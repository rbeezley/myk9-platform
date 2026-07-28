## Context

The latest definition of `view_authenticated_entry_results` is migration
`20260710160000_ringside_passcode_generation_revocation_complete.sql`. It is the
security-definer read boundary used by `ReplicatedEntriesTable`, entry search,
class-entry hooks, results/statistics hooks, notifications, and ringside views.
Its caller-visible authorization model is correct, but the implementation builds
`flags` and `access` through flattenable lateral subqueries and then references
those aliases throughout a wide projection.

PostgreSQL expands those expressions rather than materializing the aliases. A
live full-row `EXPLAIN ANALYZE` showed 38 separately planned copies of the
assigned-judge subplan. A single valid-ringside-claim read changed the relation
counters by:

| Relation            | Sequential scans | Index scans |
| ------------------- | ---------------: | ----------: |
| `user_roles`        |               45 |       5,001 |
| `judge_assignments` |               41 |           0 |
| `show_passcodes`    |            1,108 |           0 |

All expected lookup indexes already exist. With only 12 `judge_assignments`, 16
`show_passcodes`, and 41 `user_roles`, PostgreSQL often chooses a sequential scan
correctly; the defect is repeated execution, not a missing index.

The 60-second `AuthContext` refresh is a secondary source: it calls
`get_user_permissions`, `get_user_roles`, and `get_effective_permissions` once
each. Live `pg_stat_statements` contains roughly 77k calls per RPC since January,
which cannot explain hundreds of millions of scans. Class/show PostgREST reads
also embed `judge_assignments`, but their existing indexes and offline snapshots
are required and their small-table sequential plan is currently cost-optimal.

### [ADDED] Baseline evidence and concrete sources

- `pg_stat_database.stats_reset`:
  `2025-12-08 11:03:29.274482+00`.
- `pg_stat_statements_info.stats_reset`:
  `2026-01-03 21:10:57.816885+00`.
- Baseline at `2026-07-28 20:19 UTC`:

  | Relation            | Live rows | Sequential scans | Index scans |
  | ------------------- | --------: | ---------------: | ----------: |
  | `user_roles`        |        41 |      407,784,975 | 917,576,772 |
  | `judge_assignments` |        12 |      360,215,448 |     552,543 |
  | `show_passcodes`    |        16 |       24,608,273 |         836 |

- A 10-second sample at `20:22 UTC` had zero new scans on all three
  relations. The counters are historical/bursty, not a continuous present-day
  rate, so a known post-reset window is mandatory.
- `user_roles`: the view's correlated
  `public.can_manage_show(e.show_id)` and steward-role `EXISTS` are flattened
  across its access-controlled projection. `can_manage_show` invokes the
  SECURITY DEFINER role helpers. The 60-second `AuthContext` triple-RPC refresh
  is measurable secondary traffic, not the main multiplier.
- `judge_assignments`: the view's correlated `is_assigned_judge` `EXISTS`
  appears as 38 copied plan nodes in a representative full projection.
  `ReplicatedClassesTable.sync`, `shows/reads.postgrest.ts`, trial timeline, and
  TV-display reads also use PostgREST `judge_assignments(...)` embeds.
- `show_passcodes`: the view calls
  `ringside_claim_generation_current()` inside `claim_show_match`; the flattened
  claim/access expressions turned one valid ringside full-row read into 1,108
  `show_passcodes` sequential scans.

## Goals / Non-Goals

**Goals:**

- Read `user_roles`, `judge_assignments`, and `show_passcodes` into one
  statement-scoped caller context for each entry-results query.
- Preserve every existing manager, judge, steward, exhibitor, owner, co-owner,
  passcode-revocation, and field-release decision.
- Preserve the view's columns, column types, grants, watermark semantics, and
  security-definer boundary so existing replication and query consumers require
  no application changes.
- Provide repeatable plan/counter evidence before and after deployment.

**Non-Goals:**

- Broad RLS-helper wrapping or permissive-policy consolidation (MYK9-112).
- Index addition/removal already owned by MYK9-113.
- Removing the 60-second RBAC refresh without load evidence.
- Changing class/show/judge replication scope or rebuilding MYK9-109's harness.
- Any UX-facing change. `docs/INTENT.md` behavior is unaffected.

## Decisions

### 1. Add one internal statement-scoped access-context helper

Create a `STABLE SECURITY DEFINER` SQL function with an empty `search_path` that
returns exactly one row containing the caller facts needed by the view:

- auth user and person IDs;
- site-admin status and the club IDs manageable through active
  secretary/trial-secretary/club-admin roles;
- assigned class IDs for active judge assignments;
- steward show and club scopes;
- ringside claim show, role, and generation-current result.

The function will aggregate active role and assignment rows once. The view will
call it through a one-row `MATERIALIZED` CTE and compare each entry's show/class
against the returned arrays.

This keeps the security-sensitive role rules in one auditable helper and prevents
the optimizer from copying base-table subplans across output columns.

The helper MUST return a well-formed one-row context for callers with no person
row, no active roles, no assignments, or no passcode claim. Arrays are normalized
to empty arrays and booleans fail closed; the existing
`ringside_claim_generation_current()` remains the authority for current/stale
claim handling so no new claim parsing semantics are introduced.

[CORRECTED] PostgreSQL requires a view caller to hold `EXECUTE` on every
function referenced by the view; therefore a helper in `public` cannot both
power the view and be revoked from `authenticated`. The migration creates a
non-exposed `private` schema, revokes schema access from API roles, and places
the helper there. `authenticated` and `service_role` receive `EXECUTE` only so
their existing view grants continue to work, while lack of schema `USAGE` and
the API configuration (`schemas = ["public", "storage", "graphql_public"]`)
prevent direct PostgREST RPC access. The helper does not enter the generated
public-schema API types.

Alternative considered: wrap each existing expression in a scalar subselect.
That helps uncorrelated passcode checks but does not solve show/class-correlated
manager and judge checks, and remains vulnerable to expression duplication.

Alternative considered: add more indexes. The required indexes already exist,
and forcing index scans over 12–41 rows would change the scan ratio without
removing the repeated CPU work.

### 2. Materialize only the one-row caller context

The entries relation itself will not be materialized. PostgREST filters on
`show_id`, `class_id`, and the `updated_at` watermark must remain eligible for
predicate pushdown. Only the small, caller-specific authorization context is
explicitly materialized.

Alternative considered: materialize the whole view or entry set. That would hide
repeated authorization work but force broad entry scans for scoped replication
queries.

### 3. Preserve access semantics as a migration contract

The helper will copy the latest predicates exactly:

- `site_admin` is global;
- `club_admin`, `secretary`, and `trial_secretary` manage only matching
  non-null club scopes;
- judge access requires the caller's person ID, matching class ID, and
  `confirmed|invited`;
- steward access matches either a show role or a club role with null show scope;
- ringside access requires the forge-proof claim marker, matching show/role, and
  the existing generation-current check;
- expiration and `is_active` filters remain unchanged.

The migration will recreate the latest view definition rather than editing an
older version. Existing contract suites for ringside claims, passcode
revocation, exhibitor/co-owner queue reads, result visibility, and view grants
remain required.

[EXPANDED] Before implementation,
`supabase/tests/myk9_114_entry_access_context_test.sql` will create fixed
fixtures, set authenticated JWT claims, and assert the current view's row and
protected-field outputs for site admin, scoped secretary/club admin, assigned
judge, steward, plain exhibitor, anonymous ringside caller with no person row,
expired role, and stale claim. It must pass against the current implementation
as a characterization test. The identical file then runs after the migration;
only the separate source-shape contract is expected to move from red to green.
The SQL test follows the existing `BEGIN`/`ROLLBACK`, `set local role`, and
`set_config` pattern in `supabase/tests/recoverable_show_access_codes_test.sql`.
Source-string assertions alone are not sufficient authorization evidence.

### 4. Keep offline-first consumers unchanged

`ReplicatedEntriesTable` continues reading
`view_authenticated_entry_results`; no direct PostgREST bypass is introduced.
The view retains `GREATEST(...) AS updated_at`, all existing result fields, and
the same grants. Class and judge-assignment replication are not changed.

### 5. Treat post-reset evidence as an approval-gated deployment check

Repository verification will include
`scripts/qa/db-drift/myk9-114-scan-evidence.sql` with mutually exclusive
snapshot, read, and plan modes plus
`scripts/qa/db-drift/myk9-114-scan-evidence.ts`:

1. [CORRECTED] the SQL script has no statistics-reset path and is safe for
   approved linked read-only evidence;
2. the TypeScript runner opens separate snapshot/read/snapshot backend sessions,
   subtracts relation counters, and fails when the one-read delta exceeds two
   scans for any hot relation;
3. plan mode captures global, show-scoped, class-scoped, and watermark full-row
   plans without contaminating the one-read delta;
4. after approved deployment and a separately approved `pg_stat_reset()`,
   the runner replays representative account/ringside reads;
5. reset timestamps and the known-window deltas are recorded for MYK9-114 and
   MYK9-109.

The source change can be reviewed and merged without pretending that local tests
are post-deployment evidence. MYK9-114 remains open until the shared-system gate
is completed or explicitly accepted as deferred by the issue owner.

## Risks / Trade-offs

- **[Risk] Role semantics drift between the helper and existing functions** →
  Copy the latest role names, scope, active, and expiration predicates; add
  contract assertions for each; compare old/new result sets for representative
  caller roles before deployment.
- **[Risk] A materialized CTE blocks entry-filter pushdown** → Materialize only
  the one-row caller context, not entries or view output; inspect plans for
  global, show-scoped, class-scoped, and watermark reads.
- **[Risk] Array membership becomes expensive for unusually broad staff
  accounts** → Arrays are bounded by that caller's active roles/assignments and
  are still generated once; MYK9-109 will validate realistic concurrency.
- **[Risk] Security-definer privilege widening** → Use `SET search_path = ''`,
  schema-qualify every object, revoke public/anon execution, and expose the
  helper only through the existing view boundary.
- **[CORRECTED Risk] View callers require helper execution** → Put the helper in
  the non-exposed `private` schema, grant only function `EXECUTE` to existing
  view roles, revoke schema `USAGE`, and prove direct API-role invocation is
  denied while view reads still succeed.
- **[Risk] Statistics reset destroys historical evidence** → Record the
  pre-reset counters/reset timestamps in the issue and repository first; request
  approval immediately before reset; use the reset only to establish the new
  attributable window.
- **[CORRECTED Risk] Same-session statistics snapshots can report stale
  counters** → Run reset, representative read, and counter snapshot in separate
  database sessions; use broad reset only in a disposable isolated database and
  retain the no-reset default everywhere linked.
- **[Trade-off] Direct class/show embeds may still register sequential scans of
  `judge_assignments`** → Keep them because the relation is tiny, indexed, and
  feeds required offline snapshots; reassess with MYK9-109 traffic rather than
  distorting the planner now.

## Migration Plan

1. Add the internal context helper and recreate the latest view in one migration.
   Wrap the helper, view replacement, privilege changes, schema reload, and
   comments in one explicit transaction so partial deployment cannot expose a
   half-updated boundary.
2. Add the passing pre-change SQL characterization matrix, then add focused
   red-first SQL-source contract tests. Run both plus all existing
   entry-results, passcode-generation, ringside-claim, exhibitor/co-owner, and
   replication tests after implementation.
3. Reset an isolated local database through the new migration, run local
   database lint, confirm canonical public-schema types do not change, run
   package/app typechecks, and run strict OpenSpec validation.
4. Review the branch and migration with the required database/security
   second-opinion check.
5. Open a PR; do not deploy or reset statistics without explicit approval.
6. After approval, capture pre-reset evidence, push the migration, smoke-test
   representative caller roles, reset statistics, replay the agreed workload,
   and record post-reset ratios.
7. Roll back with a forward migration that restores the exact prior view and
   drops the internal helper if authorization or plan verification fails.

[ADDED] PostgreSQL DDL is transactional, so the implementation contract test
must assert that helper creation, view replacement, privilege changes, comments,
and schema notification all occur between one explicit `BEGIN` and `COMMIT`.
An isolated failure-path check will run a temporary copy of the migration with
an injected exception immediately before `COMMIT`, then reconnect and prove the
pre-migration view definition hash and grants are unchanged and the helper is
absent. The temporary copy is never added to `supabase/migrations/`.

## Open Questions

- The post-reset observation window should be aligned with MYK9-109's refreshed
  normal scenario when available. Until then, the deterministic representative
  reads prove scan amplification removal but do not close the 50-device capacity
  gate by themselves.

## Implementation Evidence — 2026-07-28

- The source-shape contract failed before the migration existed and passes
  afterward (7/7 assertions), including the reset-incapable evidence contract.
- A current linked-schema snapshot rejected the first draft because it omitted
  `is_in_ring`; the corrected migration preserves all 95 view columns and
  compiles atomically.
- The rollback-only SQL matrix passed before and after the migration for site
  admin, secretary, trial secretary, club admin, null-club manager parity,
  confirmed/invited judges, show/club stewards, exhibitor, expired/inactive
  managers, current no-person ringside claim, stale claim, and a claim without
  generation metadata.
- Public columns, routine signatures, enums, and constraints hashed identically
  before and after (`88458e13cfcb0fe36920f39b116fc0b1`); the private helper
  does not alter the generated public API surface.
- Global, show-, class-, and watermark-scoped plans retain the expected entry
  access shape; scoped plans preserve predicate pushdown and every plan has one
  materialized `caller_context` CTE.
- Separate-session full-projection evidence:

  | Caller                       | `user_roles` | `judge_assignments` | `show_passcodes` |
  | ---------------------------- | -----------: | ------------------: | ---------------: |
  | Site-admin account           |            1 |                   1 |                0 |
  | Current ringside judge claim |            1 |                   0 |                1 |

- The injected pre-commit failure test restored the prior view-definition hash,
  ACL, and helper-absence state.
- Supabase database lint could not run in the Docker-free environment because
  the local PostgreSQL installation lacks `plpgsql_check`; direct migration
  compilation, behavioral SQL, source contracts, and typechecks cover the
  implementation pending CI/preview lint.
- An independent sub-agent database/security review found null-club manager
  parity plus evidence-script safety/reproducibility gaps. After remediation,
  its closure review reported no remaining blocker and marked task 4.5
  satisfied.
