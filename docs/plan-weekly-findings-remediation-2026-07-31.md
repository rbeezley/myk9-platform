# Plan: Weekly Findings Remediation — 2026-07-31

> **Status:** Active

Roadmap for the 2026-07-31 Codex weekly review (pilot confidence **Red**, stability window 0/4).
This is a **multi-change roadmap**, so it lives here rather than as a single OpenSpec change
(`docs/PLAYBOOK.md` § 1). Every buildable slice below names the OpenSpec change that _is_ its plan;
create each with `opsx:propose` and ship with `opsx:ship` (or `opsx-orchestrate` for the large ones).

Sources: `docs/security-audit-2026-07-30.md`, `docs/qa/findings.md`,
`~/.codex/automations/weekly-review/memory.md`, `~/.codex/automations/production-readiness-audit/memory.md`.
Baseline commit: `18e560c6c`.

## Design goals

1. **One approval batch, then unattended execution.** Every shared-system action the whole program
   needs (Linear writes, `supabase db push`, headed staging replays, edge-function deploys) is
   collected in Phase 0 so Phases 1–4 can run without stopping for consent.
2. **Serialize the grant/ACL work.** SA-2026-07-29-01 and SA-2026-07-29-02 both rewrite grants and
   policies on overlapping tables. Parallel branches would collide on migration versions and on the
   same `relacl`. They run in sequence; the first defines the shared predicate the second reuses.
3. **Proof gates closure, not merge.** Per `quality-finding-lifecycle`, a merged PR is not a closed
   finding. Each slice below states the behavioral proof that must pass on the applied database
   before the finding moves to resolved.

## Phase 0 — Approval batch and evidence refresh (no product code)

Runs first, in one session. Everything here is either read-only or a single approval request.

| Step | Action                                                                                                                                                                                                                                                                                                             | Autonomy                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| 0.1  | Present one Linear batch for approval: **create** `SA-2026-07-30-01` (P0/Urgent, draft complete in the security audit) and `PRA-2026-07-31-01` (P1/High, admin invitations). **Update** MYK9-127/128/117/125/115/120/88 to reflect the phase ordering below. **Close nothing** — MYK9-120 stays open.              | Needs one user approval |
| 0.2  | Ask once for standing approval covering: `supabase db push` for the migrations in Phases 1–3, `supabase functions deploy` for `generate-premium` and `cron-health-check`, and headed staging replays against seeded `e2e-*` accounts.                                                                              | Needs one user approval |
| 0.3  | Run the already-written behavioral SQL test for **SA-2026-07-29-13** (`supabase/tests/rbac_access_lookup_authorization_test.sql`) against the applied DB in a rolled-back transaction. The source fix merged in #1534; only proof is missing. Closes a blocked P2 for free.                                        | Autonomous after 0.2    |
| 0.4  | Fresh headed replay of **QA-CLUB-PAYMENTS-041** against a club with no connected Stripe account. Evidence is from 2026-07-18 and stale; confirm or reject before it consumes an implementation slot.                                                                                                               | Autonomous after 0.2    |
| 0.5  | Confirm applied state of the **MYK9-115** OCC containment: is `20260711150000_ringside_occ_conflict_containment.sql` applied, is `cron-health-check` redeployed, does the latest `system_health_snapshots` row carry a `ringside_conflicts` check? This decides whether Phase 1C is a code slice or a proof slice. | Autonomous after 0.2    |
| 0.6  | **[ADDED] Containment decision per P0** — see below. Decide and apply _before_ starting the corresponding fix.                                                                                                                                                                                                     | Autonomous after 0.2    |

### [ADDED] 0.6 — Containment before remediation

`launch-readiness-triage` treats a credible P0 as stop-the-line: _contain exposure, then_ remediate.
Phase 1's fixes are days of work; exposure continues throughout. The July OCC storm was survived by
`REVOKE EXECUTE`, not by the structural fix that followed. For each P0, decide explicitly — a
documented "no containment, accept exposure for N days" is an acceptable outcome, silence is not.

| P0                                  | Candidate containment                                                                                                                             | Cost of containing                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| SA-2026-07-30-01 (cross-tenant RPC) | None needed if 1A lands same-day — it is a single-function migration. Otherwise `REVOKE EXECUTE ON create_show_with_children FROM authenticated`. | Breaks all show creation. Only justified if exploitation is observed.                                      |
| SA-2026-07-29-01 (hide exposure)    | Revoke `authenticated` SELECT on `num_hides`/`has_blank`/`hides_known` immediately, ahead of the full official-gated design.                      | Breaks judge/steward scoring until 1B restores gated access. Check whether any live show is running first. |
| QA-INFRA-OCC-STORM-037              | Already contained in July (`REVOKE EXECUTE`, since re-granted behind the migration). Step 0.5 confirms whether containment is still in force.     | —                                                                                                          |

**Before applying any containment,** check `shows` for a trial in progress. Containment that breaks
show-day scoring during a live show is worse than the exposure it prevents.

**Exit:** Linear reflects reality, three findings have refreshed evidence, each P0 has a recorded
containment decision, and no later phase needs to stop for consent.

## Phase 0 results — 2026-07-31

Read-only steps executed against the applied database (project `sojmvhhwsjxmfistvzbe`). Steps 0.1
and 0.2 remain open pending approval.

### 0.3 — SA-2026-07-29-13 — **PASS, eligible to close**

`supabase/tests/rbac_access_lookup_authorization_test.sql` run via psql against the applied DB:
`PASS self, non-admin cross-user denial, and site-admin cross-user access for all four RBAC RPCs`.
Transaction rolled back; verified zero residual rows in `public.people` and `auth.users`. This was
the only missing piece — the finding can move to resolved in the 0.1 batch.

### 0.4 — QA-CLUB-PAYMENTS-041 — **BLOCKED on data, not effort**

The replay requires "a club with no connected Stripe account." The database contains **exactly one
club** (`Heartland Scent Work Club`), and it has `onboarding_complete = true`. The precondition
cannot be met without seeding a second club — a shared-system write.

This is the disposable-environment dependency arriving early. Options: seed a throwaway club under
the 0.2 approval, or accept that this P1 stays **blocked on infrastructure** until
`isolated-resettable-e2e-environment` ships. Do **not** implement 3D against stale 2026-07-18
evidence.

### 0.5 — MYK9-115 — **containment applied; a 34M-conflict storm ran undetected**

Applied: `20260711150000_ringside_occ_conflict_containment`,
`20260711160000_ringside_conflict_seq_revoke_client_grants`,
`20260712101000_authorize_ringside_occ_conflicts`. `ringside_update_entry` carries
`authenticated=X` (EXECUTE restored) and is `SECURITY DEFINER`; `ringside_conflict_seq` has **no**
client grants — correct, because definer rights cover `nextval()`. The `ringside_conflicts` check is
present in the health snapshot. So the July remediation is fully in place.

But the check reads **`fail`**, and the history is the real finding:

| Snapshot      | Conflicts since previous | Counter    | Status |
| ------------- | ------------------------ | ---------- | ------ |
| 07-24 → 07-28 | 0                        | 36         | ok     |
| 07-29         | 16,619,333               | 16,619,369 | fail   |
| 07-30         | 16,374,011               | 32,993,380 | fail   |
| 07-31         | 1,428,120                | 34,421,500 | fail   |

**The storm is over** — `ringside_conflict_seq.last_value` is still exactly `34421500` some six hours
after the 07:00 snapshot, and `pg_stat_activity` is quiet (5 idle connections, nothing running). No
emergency containment is warranted; this is not July 11 repeating.

The correct reading is that **containment worked and admission control is still missing**. The
structural fix absorbed ~34M conflict attempts across three days without an outage — that is the
containment succeeding. What it did not do is stop the wedged client, and nobody noticed for three
days. This makes `docs/plan-ringside-occ-admission-control.md` the live priority, and it upgrades
MYK9-115 from "unproven" to "confirmed recurring with a demonstrated 3-day undetected window."

**Follow-up needed:** identify what generated the conflicts on 07-28. The July signature was a
wedged Playwright browser under a nightly automation holding a stale IndexedDB outbox.

### 0.5b — [NEW FINDING] the anon-grant monitor is emitting 52 false positives

`anon_grants` also reads **`fail`**, reporting every one of the 52 legitimately allowlisted `classes`
columns as `unexpected column grant classes.<col> (r)`.

Root cause in `apps/myk9show/supabase/functions/_shared/anonGrantChecks.ts`: `classes` sits in the
**table** allowlist (`classes: 'r'`, line 69) but migration `20260730140000` converted it to a
52-column grant, and `classes` has no entry in `ANON_COLUMN_ALLOWLIST`. The lookup
`expectedColumns?.includes(column)` is therefore `undefined` for every column, so all 52 report as
drift.

This is SA-2026-07-30-02, but **worse than the audit characterized it**. The audit described a
monitor that silently _accepts_ an obsolete grant; live, it is failing loudly with pure noise — a
genuine anon-grant regression would be invisible in the flood, and `/admin/health` has been red
since 07-30. Promote it: it is a small, well-understood data fix (move `classes` from the table
allowlist to the column allowlist with its 52 columns) and it restores the detector that is supposed
to verify Phase 1B's own work. **Do 0.5b before Phase 1B.**

### 0.5b — **SHIPPED IN #1538**, not by this plan

> **Concurrency note, recorded because it cost real work.** #1538 merged 2026-07-31 14:15 UTC and
> fixed **both** `SA-2026-07-30-02` (this item) and `SA-2026-07-30-01` (Phase 1A) while both were
> being implemented independently here. PRs #1537 and #1539 were closed as duplicates. Both branches
> even chose the identical migration filename
> `20260731120000_create_show_with_children_tenant_guard.sql`, because both correctly took the next
> timestamp after the same `origin/main` tip.
>
> **A finding id is a shared work queue.** Anything written into an audit doc, a Linear issue, or an
> automation memory can be picked up by another agent or by the user at any moment, and severity makes
> collision _more_ likely — a P0 is what everyone reaches for first. Checking `origin/main` once when
> picking a migration timestamp is not enough. **Before starting any slice below, and again
> immediately before pushing**, run `gh pr list --state all --limit 15` and
> `git log --oneline origin/main -5`.

#1538's fix is the same shape as the one attempted here: `classes` moved to
`ANON_COLUMN_ALLOWLIST`, and the no-table-grant invariant generalized over `ANON_COLUMN_TABLES`.

The diagnosis below is kept because it explains why CI never caught this.

`classes` moved from `ANON_TABLE_ALLOWLIST` to `ANON_COLUMN_ALLOWLIST` with its 52 columns; the
"must stay column-scoped" invariant generalized from a hardcoded `entries` check to every table in
`ANON_COLUMN_TABLES`, so a table-grant regression on either table now names itself precisely.

**The fixture was the real bug.** `anonGrantTestFixtures.ts` still modelled `classes` as a table
grant, so the unit suite asserted against a baseline that stopped describing reality the moment
`20260730140000` landed. CI stayed green while production went red — a test that tests its fixture,
not the world. The fixture now carries the 52 columns, spelled out rather than derived from the
allowlist constant (deriving it would make the baseline test vacuous), with a comment recording why.

Verification:

- 16/16 in `anonGrantChecks.test.ts` (11 existing + 5 new: `classes` table-grant regression, and one
  per hide column proving an explicit column grant is also rejected).
- 439/439 across all `_shared` edge-function tests.
- `pnpm typecheck` 26/26 tasks; `pnpm lint` 0 errors.
- **Live proof:** ran `public.system_health_probe()->'anon_grants'` against the applied database and
  fed the real facts through `anonGrantsCheck`. Result:
  `ok — 20 table grants (1 write), 75 column grants, all on the allowlist`. This is the check the
  fixture-only test could not make.

Remaining: merge, then deploy `cron-health-check` and confirm `anon_grants` = `ok` in the next
applied snapshot. Not deployed pre-merge, to avoid drift between `main` and the deployed function.

### 0.6 — containment decisions

- **SA-2026-07-30-01:** no containment. 1A is a single-function migration; revoking EXECUTE would
  break all show creation for a strictly worse trade.
- **SA-2026-07-29-01:** no containment — **a scent-work show starts tomorrow.**
  `Heartland Scent Work Classic` runs 2026-08-01 → 08-03 and is the only show in the window.
  Revoking `authenticated` access to the hide columns would break judge scoring for exactly the
  sport the columns exist for. Ship 1B properly instead. (The show is seed data, id
  `dededede-...0010` — if it is confirmed demo-only, revisit this and containment becomes cheap.)
- **QA-INFRA-OCC-STORM-037:** already contained and holding; see 0.5.

### Confirmed still-open state

`classes` relacl is `authenticated=arwd/postgres` — table-wide authenticated CRUD, so
SA-2026-07-29-01 is confirmed open. Column ACLs show 52 anon-readable columns and exactly 3 with no
anon grant (`num_hides`, `has_blank`, `hides_known`), so the cold-anon leg remains correctly closed.

## Phase 1 — P0 exposures (serialized)

### 1A — `secure-show-creation-rpc-tenancy` (SA-2026-07-30-01)

First because it is fully isolated: one function, one migration, no UI, no overlap with the ACL work.

- Validate the show row's `club_id` after the insert attempt; require each trial to be a fresh
  insert or verifiably a child of `v_show_id`; append only verified trial IDs; reject mismatched
  class/trial references before any class insert.
- Decide and document the retry rule: full immutable-payload comparison vs. graph-ownership only.
- **Heed the LESSON:** `grep -l "CREATE OR REPLACE FUNCTION public.create_show_with_children" supabase/migrations/`
  and copy from the newest hit (`20260730230000_...num_hides.sql`), not the canonical-looking one.
  This function has silently reverted `registry_id` and the judge-assignment shape before (#1484).
- **Proof:** two-club behavioral SQL — cross-club show conflict denied, cross-club trial conflict
  denied, mixed valid/invalid children roll back entirely, same-club exact retry stays idempotent,
  normal creation and passcode generation still work. Plus a direct PostgREST RPC probe leaving zero
  victim-tenant rows.

#### 1A results — **SHIPPED IN #1538**; two gaps closed as follow-ups

The P0 itself is fixed on `main` by #1538 (see the concurrency note under 0.5b — this plan's PR
#1539 was a duplicate and is closed). #1538's fix is structurally identical: three ownership checks
using `RETURNING id` to distinguish a fresh insert from an `ON CONFLICT` no-op.

Two things #1538 did not cover, carried into a follow-up PR:

1. **Its closure-proof test never ran in CI.** `supabase/tests/` held 12 files; the harness
   registered 8, and `create_show_with_children_tenant_isolation_test.sql` was in neither
   `run-behavioral-sql-tests.sh` nor the `launchCriticalSqlTests` contract list. The P0 was fixed
   with an inert regression guard. Verified the test passes before registering it — a dormant test
   can rot against schema drift, and registering a failing one turns CI red for everyone.
2. **No row locking.** All three owner re-reads were unlocked plain `SELECT`s, leaving a window
   where a concurrent club transfer could commit between the ownership check and the child inserts.
   Defence in depth, not a reopening of the P0. Migration `20260731140000` adds `FOR UPDATE`.

The analysis below was written against this plan's own implementation. It is kept because the
findings are about the code and the harness, not about which PR shipped them.

**The attack is worse than the audit described.** The audit framed it as mishandled UUID
_conflicts_. Once `v_show_id` is the victim's show, step 3 is not a conflict at all — brand-new
trials INSERT cleanly into another club's show under definer rights. The conflict path is the
second, narrower half.

Fix: each level captures whether the INSERT happened (`RETURNING id` is NULL on a no-op) and
verifies ownership before trusting the node — show belongs to the authorized club, trial belongs to
this show, class belongs to the trial the payload claims. All three lookups take `FOR UPDATE`.

**Retry semantics decided: graph ownership, not payload equality.** The wizard legitimately retries
after edits, so diffing the immutable payload would break normal retries while adding no tenancy
protection. Ownership carries the security property; column drift does not.

Proof — live, red then green, in a rolled-back transaction. Against the deployed function:
`ERROR: FAIL cross-club show hijack was allowed`. With the migration: `PASS` on all five cases. The
CI `SQL tests` job then ran the same test against a fresh database and passed. This also confirms
the P0 is **exploitable on staging today**, not theoretical.

Two process traps hit, both worth carrying forward:

1. **The test would never have run.** `scripts/qa/run-behavioral-sql-tests.sh` uses an explicit
   `TEST_FILES` array, not a glob. An unregistered test file sits in the repo looking like coverage
   while CI never executes it — the closure proof for a P0 would have been decorative.
2. **There are two lists, duplicated on purpose.**
   `scripts/qa/run-behavioral-sql-tests.test.ts` keeps its own `launchCriticalSqlTests` copy and
   asserts the runner invokes exactly those files. That assertion is what stops a launch-critical
   test being quietly _dropped_. Registering a test means editing both; "simplifying" the
   duplication away would delete the protection. Comments added to both.

Note the asymmetry: the harness guards against a test being removed from the list, but nothing
guards against a test file existing and never being added. That is the same shape as 0.5b — a check
that reads as coverage while executing nothing.

### 1B — `gate-scentwork-hide-configuration` (SA-2026-07-29-01, MYK9-127 + MYK9-128)

The largest slice. Cold anon is already fixed (#1533/MYK9-116); authenticated and passcode sessions
are not.

- Column-level ACL: `num_hides`, `has_blank`, `hides_known` become official-gated rather than
  table-wide `authenticated` SELECT. Introduce the shared `private.is_real_account()` /
  claim-scope predicate here — Phase 2A depends on it.
- Replication: `ReplicatedClassesTable` selects `*`. Narrow the select list by role so an exhibitor
  cache never receives the columns, and add a purge path so leaving or signing out of a show drops
  already-cached protected fields.
- Preserve offline scoring for authorized judges/stewards. This is the design risk: the fields must
  reach an official's IndexedDB and no one else's.
- **Proof:** ordinary exhibitor denied; exhibitor passcode session denied; authorized judge/steward
  scoring passes **online and offline**; sign-out purges the cached fields. Cold-anon denial already
  recorded — re-assert it as a regression.

### 1C — MYK9-115 OCC storm

Shape determined by step 0.5. If containment is unapplied, this is a `db push` plus
`cron-health-check` redeploy; if applied, it is the proof slice only. Existing artifacts:
`docs/plan-ringside-occ-admission-control.md` and the `ringside-occ-conflict-circuit-breaker`
OpenSpec change — extend those, do not author new ones.

- **Proof:** rolled-back psql showing a stale `expected_version` raises `40001` + DETAIL without
  executing auth lookups, `ringside_conflict_seq` advances despite the abort, `authenticated`
  EXECUTE restored / `anon` revoked, and `ringside_conflicts` present in the next health snapshot.

## Phase 2 — P1 authorization (depends on 1B's predicate)

### 2A — `scope-anonymous-auth-reads` (SA-2026-07-29-02, MYK9-117)

- Apply the `is_real_account()` predicate from 1B to unconditional `USING (true)` authenticated
  reads; separately show/club-scope `volunteers` (name/email/phone/notes) and `activity_log`.
- Do **not** disable anonymous sign-in — it is load-bearing for passcode ringside access.
- **Proof:** in a disposable environment a bare anonymous session gets zero rows or `42501` from
  volunteers / activity / RBAC catalogs, while a stamped passcode session still completes the full
  ringside read/write flow.

### 2B — `authorize-premium-generation` (SA-2026-07-29-11, MYK9-125)

- `generate-premium` currently treats public show visibility as manager authorization. Require an
  actual manager role for the target show; make the quota check atomic.
- Independent of 2A's migration surface, so it may run in parallel with 2A.
- **Proof:** manager / non-manager / anonymous-auth matrix per show, plus a cross-show quota test
  showing one account cannot spend another show's allowance.

## Phase 3 — P1 pilot blockers (product paths, parallel-safe)

These touch disjoint files, so they can run as concurrent worktrees.

| Slice | OpenSpec change                             | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3A    | `provision-admin-user-invitations`          | PRA-2026-07-31-01 — `/admin/users` "Create User" inserts a `people` row only; `sendInviteEmail`, `generatePassword`, `customPassword` reach no service. Keep the existing surface (`UserManagementPage.tsx`); wire it to a real Auth invite. Note `UserManagementPage.test.tsx` mocks `CreateUserDialog` to `null` — that mock is why this shipped, so the new test must render it. **Proof:** delivered invite, accepted login, role-link and idempotency replay. |
| 3B    | (no change — replay only)                   | MYK9-120 club access grant/revoke. Fix merged in #1527; only the headed staging grant / revoke / cross-club-rejection / audit-row replay is missing. **Do not close without it.**                                                                                                                                                                                                                                                                                  |
| 3C    | `repair-registration-toast-and-dirty-guard` | EUX-2026-07-24-01 / MYK9-88 — toast blocks registration actions; route leave loses unwarned entry work. **Proof:** mobile Back/Next replay plus dirty refresh/back replay.                                                                                                                                                                                                                                                                                         |
| 3D    | `fix-club-payment-setup-activation`         | QA-CLUB-PAYMENTS-041 — **only if step 0.4 reproduces it.** Pointer clicks no-op while DOM `.click()` works, which smells like an overlay or pointer-events issue in `ClubPaymentsCard`.                                                                                                                                                                                                                                                                            |

## Phase 4 — P2 sweep (batchable)

One OpenSpec change, `close-p2-authorization-matrix`, covering the four unowned security P2s, since
they share a test harness (role matrices against the applied DB):

- SA-2026-07-29-03 — public `judge_assignments` exposes `fee` and `notes`.
- SA-2026-07-29-06 — `is_show_official()` grants stewards office-administration authority.
- SA-2026-07-29-12 — AskQ accepts disposable anonymous identities; quota count/insert race.
- SA-2026-07-30-02 — applied ACL monitor still accepts the obsolete table-wide `classes` grant.
  Fix this one **first within the phase**: it is the detector that should have caught 1B, and while
  it is broken every ACL claim in this plan is self-reported.

Recurring exhibitor responsive/a11y P2s (MYK9-102/121/122/123/124) replay after the above; they are
polish and must not displace launch risk.

### [ADDED] P3 tail — disposition, not implementation

The three open P3s do not get slices. Each needs a one-line recorded disposition so they stop
re-appearing as unowned every Friday:

- **SA-2026-07-29-05** (broad preview CORS regex) — no victim path exists. Either tighten to an
  exact-origin contract or record accepted-risk rationale in the audit ledger.
- **SA-2026-07-29-08** (anon entries policy omits `entries.deleted_at`) — small enough to fold into
  the Phase 4 migration rather than carry separately.
- **SA-027** (`SECURITY DEFINER` functions use `search_path=public`) — 4 consecutive runs, not
  exploitable under the current schema ACL. Convert to empty `search_path` opportunistically when
  each function is next edited; Phases 1A and 1B both touch definer functions, so do it there.

`SA-2026-07-29-09` is a duplicate of `SA-027` and `MYK9-65` is a duplicate per the weekly review —
merge both in Phase 0.1 rather than tracking them.

## Phase 5 — Coverage gaps and launch gates

Not findings — absences. The weekly review flags these as gaps, not passes.

- Run the missing audits: Supabase drift (`supabase-health-drift-audit`), plus secretary, judge,
  club-admin, and site-admin `role-journey-ux-audit` walks. Each seeds its own automation memory.
- **PITR / restore proof before Stripe cutover.** No backup/DR gate exists in any of the four launch
  artifacts, so it will not surface on its own — verify it explicitly.
- G9 capacity remediation and replay.

## [ADDED] Rollback and blast radius

Three slices rewrite grants, RLS policies, or a SECURITY DEFINER function on live tables. Tightening
access is not a safe default here — the project carries a standing LESSON that revoking a table only
ever reached through a PostgREST **embed** (`table(col,...)` / `table!inner(...)`) turns a null embed
into a hard `42501` that fails the _entire_ request, not just that field.

Per grant/policy slice, before `db push`:

1. **Grep for embeds, not just `.from('<table>')`.** A table you never query directly can still be
   load-bearing inside another query's embed.
2. **Check sequences alongside tables.** No migration in this repo has ever GRANTed a sequence
   privilege. An INSERT grant is worthless if an invoker-run trigger's `nextval()` is not granted,
   and a BEFORE INSERT trigger fires before the RLS `WITH CHECK`, so RLS never masks it. Query
   `relkind='S'` as well as `relkind='r'`.
3. **Write the down-migration in the same PR.** Every grant/policy change gets a paired revert
   migration held ready (not applied). For 1A, the revert is the prior `CREATE OR REPLACE` body —
   copy it out before editing.
4. **Rollback trigger:** any 42501 in Sentry or the postgres log on a path the slice did not
   intend to touch, or `/admin/health` going red. Apply the revert first, diagnose after.

Containment applied in step 0.6 is itself reverted by the corresponding Phase 1 fix landing — track
it so a temporary revoke does not become permanent.

## [ADDED] Migration hygiene

Up to four migration-bearing slices run concurrently. Two known traps apply directly:

- **Pick the timestamp against `origin/main`, not your branch.** `migrationVersionUniqueness` only
  sees the local tree, so a version another slice merged first passes every local check and then
  dies in CI at `INSERT INTO supabase_migrations.schema_migrations` with no filename in the error.
  Run `git fetch origin main && git ls-tree --name-only origin/main supabase/migrations/ | tail`
  before naming each file, and **re-check after any slice that sat open a while**.
- **Keep scratch `.sql` out of `supabase/migrations/`.** `anonEntriesGrantContract` parses the whole
  directory; an untracked experiment fails it with a confusing ACL error. Use the scratchpad.
- **Blanket revokes stay as plain statements ordered before the grants they precede** — that test's
  splitter hoists `EXECUTE '...'` payloads out of `DO $$` blocks to the end of the file, so a
  version-guarded revoke inside a `DO` block reads as wiping every column allowlist.
- **A `GRANT` can never narrow a broader earlier `GRANT`.** Codifying a tighter ACL needs its own
  explicit `REVOKE`; the migration text reads correct either way.
- Run the repo's `migration-auditor` agent on each migration before `db push`.

## [ADDED] Performance review for the new predicates

Phases 1B and 2A add `is_real_account()` / claim-scope predicates to policies on tables read on
every page load. A predicate that re-evaluates per row is the O(N) policy anti-pattern.

- Define the predicate as a `STABLE` function so the planner can hoist it, and wrap call sites in
  `(SELECT ...)` where the Supabase guidance calls for it.
- `EXPLAIN ANALYZE` the hottest affected query before and after — record both in the PR.
- Phase 1B narrows the `ReplicatedClassesTable` select list. Confirm the reduced column set does not
  break the offline **write** path or the dual-path read rule: a dual-path read must match on both
  the `SELECT` list _and_ the `WHERE` clause.

## Testing phase (required before any slice is Complete)

Per CLAUDE.md, a phase is not complete until its tests pass. For every slice:

1. `pnpm typecheck` and `pnpm lint` at the monorepo root — rebuild `@myk9/supabase` first if `tsc`
   complains about generated DB types (stale `dist` produces false failures).
2. Colocated unit tests, then grep by changed **symbol** for indirect breakage.
3. The behavioral proof named in that slice, run against the **applied** database — migration text
   is not evidence. Verify `pg_class.relacl` _and_ `pg_attribute.attacl`; `information_schema` is
   unusable over MCP. Behavioral SQL lives in `supabase/tests/`, never in `supabase/migrations/`.
4. `codex review` per code commit on the PR (a multi-commit PR needs one run per commit).

### [ADDED] When a proof fails

The proof is the gate, so a failure must not silently downgrade to a merge.

- **Proof fails → the slice is not done.** Do not merge, do not move the Linear issue, do not mark
  the finding resolved. Re-enter at the design step of that slice.
- **Proof cannot be run** (blocked on a shared system, disposable environment unavailable) → the
  finding stays **blocked**, not resolved, and the blocker is named in the Linear comment. This is
  exactly MYK9-120's current state and why it stays open.
- **Two consecutive failed attempts on the same slice** → stop autonomous execution and report.
  A third attempt without new information is how a wrong root cause gets entrenched.

## [ADDED] Execution harness

How the parallel phases actually run without corrupting each other:

- **One worktree per slice, one PR per slice.** Concurrent agents sharing the primary checkout
  corrupt each other; `.githooks/pre-commit` enforces worktree-only commits.
- If any slice runs a dev server or Playwright, give it a **unique vite port** — shared ports across
  concurrent worktrees produce cross-talk that reads as a real failure.
- A worktree agent must **not** spawn its own sub-agents; the parent's exit strands them.
- Merge from the **main repo directory**, never from inside a feature worktree. Teardown order:
  remove the worktree, _then_ `git branch -D` (not `-d` — squash rewrites SHAs).
- Selective `git add` per slice. Blind `git add -A` in a worktree picks up the other slices' leakage.

## [ADDED] Linear workflow per slice

CLAUDE.md's workflow rule applies to every slice, not just the program:

1. Move the issue to **In Progress** when the slice starts, and keep it there through PR review.
2. On implementation completion, comment with: what changed, tests/checks run and their result,
   branch or PR link, risks or remaining work, and whether acceptance criteria passed.
3. Move to **Done** only after the PR merges **and** the closure proof passed. Note the
   auto-complete trap: any `myk9-<n>-*` PR merge flips `MYK9-<n>` to Done automatically — re-open it
   if the slice needs more than one PR.
4. Keep this plan and the weekly-review automation memory in sync with merged state.

## Sequencing summary

```
Phase 0  (approvals + evidence)        → blocks everything
Phase 1A (cross-tenant RPC)            → independent, start immediately after 0
Phase 1B (hide exposure)               → defines is_real_account(); blocks 2A
Phase 1C (OCC storm)                   → parallel with 1A/1B (different surface)
Phase 2A (anon-auth reads)             → after 1B
Phase 2B (premium authz)               → parallel with 2A
Phase 3A/3B/3C/3D                      → parallel, after Phase 1
Phase 4                                → after Phase 2; start with SA-2026-07-30-02
Phase 5                                → continuous, independent
```

## [ADDED] Known blocking dependency — the disposable environment

Both 1B and 2A specify proof "in a disposable environment," and 2A's specifically requires minting a
bare anonymous Auth JWT. The security audit records that this replay stayed **blocked** precisely
because it would create persistent external Auth state on a shared project. Meanwhile
`isolated-resettable-e2e-environment` and `separate-staging-production-environments` are both still
open OpenSpec changes — the environment those proofs assume may not exist yet.

Resolve this in **Phase 0**, not when the proof is due:

- If a disposable/branch environment can be stood up (Supabase branch, or the resettable e2e
  environment), name it in the Phase 0 output and use it for every anonymous-identity proof.
- If it cannot, 2A's closure is **blocked on infrastructure, not on code** — say so explicitly and
  promote `isolated-resettable-e2e-environment` ahead of Phase 2 rather than letting 2A merge with
  an unprovable closure gate. A merged fix with no runnable proof is the exact failure mode
  MYK9-120 is currently stuck in.

## Stability window

The window is 0/4 and restarts on any new or reopened confirmed P0/P1. Phases 1–3 are all
significant auth/RLS changes, so the affected scorecard dimensions restart when they land — count
the four consecutive clean Fridays from the last Phase 3 merge, not from today.
