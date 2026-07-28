## Context

MYK9-113 was filed from the 2026-07-26 go-live review with 58 unindexed foreign-key findings,
103 advisor `unused_index` findings, 2 duplicate-index groups, and 222 raw indexes whose
`pg_stat_user_indexes.idx_scan` was zero. A fresh read-only inventory on 2026-07-28 found:

- 52 public foreign keys without an index containing the FK column anywhere (the issue's
  advisor-compatible definition);
- 78 public foreign keys without strict coverage by a valid, ready, non-partial index whose
  leading key is the FK column, including 10 on the named hot-path tables:
  `classes.deleted_by`, `classes.results_released_by`, `entries.deleted_by`,
  `entries.promo_code_id`, `entries.refund_decided_by`, `shows.deleted_by`,
  `trials.deleted_by`, `user_roles.club_id`, `user_roles.show_id`, and
  `waitlist_entries.promoted_entry_id`;
- 147 public indexes with zero scans in the current statistics window; and
- the same 2 exact duplicate groups:
  `platform_waitlist_email_key` / `platform_waitlist_email_unique`, and
  `idx_push_subscriptions_user_id` / `push_subscriptions_user_id_idx`.

The database is pre-launch and small (36 entries, 24 classes, 17 trials, and 16 shows), so zero
scans are not reliable evidence that an index is unnecessary. MYK9-109's realistic load fixture
and rehearsal have not run. The linked Supabase project is shared; reads are safe, but applying
migrations or re-running dashboard advisors after a change requires explicit approval.

This is a physical-schema change only. Existing application reads, writes, RLS policies, and
`@myk9/replication` data paths remain unchanged. The indexes support those existing paths but do
not bypass or alter offline-first behavior. No page, component, hook, or new query/mutation layer
is introduced, and `docs/INTENT.md` is therefore unaffected.

## Goals / Non-Goals

**Goals:**

- Give every one of the 78 strictly uncovered public foreign keys a valid supporting index,
  including every
  foreign key on the MYK9-113 hot-path tables.
- Remove the two provably exact duplicate indexes while retaining one canonical definition from
  each group.
- Preserve all other zero-scan indexes unless their definition is proven redundant.
- Record a reviewable one-line keep/drop rationale for every zero-scan index in the baseline.
- Make the additive and subtractive migration effects testable from source and verifiable against
  a database.
- Record post-push advisor and catalog counts before declaring MYK9-113 complete.

**Non-Goals:**

- Dropping indexes merely because `idx_scan = 0`.
- Optimizing high sequential-scan relations tracked by MYK9-114.
- Running or repairing the load harness tracked by MYK9-109.
- Changing queries, RLS semantics, replication behavior, APIs, or UI.

## Decisions

### Add supporting indexes for all 78 strict findings

The additive migration will create a non-partial btree index whose leading column is the
foreign-key column for every live finding, not only the 10 named hot-path findings. Every
current finding is a
single-column foreign key, so a single-column index is the smallest general-purpose structure for
referential checks and joins.

This follows the Supabase/Postgres rule to index the referencing side of foreign keys and avoids
turning the remaining findings into undocumented exceptions. Adding only the 10 hot-path indexes
was considered, but it would leave the schema and advisor intentionally noisy and require a
subjective, fragile definition of "cold" before realistic traffic exists.

The issue's original subset query was considered but rejected as the implementation invariant:
it treats a partial index or an index with the FK column after another leading key as coverage,
even though PostgreSQL cannot use that index for every parent-row referential check.

Index names will be explicit and stable. Long table/column combinations will use unambiguous
abbreviations rather than relying on PostgreSQL's silent 63-byte identifier truncation.

### Use a normal additive migration during the pre-launch quiet window

The database is approximately 50 MB and the affected tables are currently tiny. Regular
`CREATE INDEX` statements keep the migration compatible with the established Supabase migration
runner and complete quickly at this scale. They intentionally fail closed on any same-name
collision, so an unrelated existing object cannot be silently accepted. A final catalog
postcondition also verifies that no public foreign key remains without strict coverage.

`CREATE INDEX CONCURRENTLY` was considered to reduce write blocking, but it complicates migration
transaction behavior and recovery. It provides little benefit for the measured table sizes.
The approved push must still occur in a quiet window, and table sizes will be rechecked first.

### Keep the older repository-owned duplicate in each group

The subtractive migration will drop:

- `platform_waitlist_email_unique`, retaining
  `platform_waitlist_email_key` from `197_create_platform_waitlist.sql`; and
- `push_subscriptions_user_id_idx`, retaining
  `idx_push_subscriptions_user_id` from `056_push_subscriptions.sql`.

The retained indexes have identical live definitions. The platform-waitlist survivor is the
repository-declared canonical index; the dropped twin is not created by any current migration.
For push subscriptions, the retained `idx_` index has 48 recorded scans while the older twin has
zero, and it is the name introduced by the later notification-specific migration. Keeping the
older object was considered, but would discard the planner-selected object's statistics without
any compatibility benefit.

Before either drop, the migration requires both indexes to be valid, ready, and live and compares
their access method, tablespace, storage options, uniqueness/NULL semantics, primary/exclusion/
replica-identity/cluster/immediacy roles, keys, operator classes, collations, per-column options,
expressions, and predicates. Any drift aborts the migration.

The drops live in a migration after the additive migration, as required by MYK9-113, so reviewers
can approve additive safety and subtractive evidence independently.

### Treat zero scans as a classification ledger, not a deletion queue

The evidence document will list every one of the 147 baseline zero-scan indexes with one of:

- `KEEP — constraint/invariant`: primary, unique, or exclusion enforcement;
- `KEEP — foreign-key/join`: referential checks or a named relationship path;
- `KEEP — query path`: an existing source/migration query using its leading columns/predicate;
- `KEEP — pending MYK9-109`: an intended, named pre-launch path whose absence of scans is not yet
  meaningful; or
- `DROP — exact duplicate`: one of the two definitions above.

No other drop is permitted in this change. Broader consolidation based on a composite index
requires both definition proof and realistic traffic and would be a follow-up after MYK9-109.

### Verify source contracts before any shared-system mutation

A focused Vitest contract will assert:

- additive and subtractive migrations are separate;
- all 78 strictly inventoried foreign-key table/column pairs have an explicit additive index;
- the 10 named hot-path findings are covered;
- exactly the two reviewed duplicate indexes are dropped; and
- the two retained twins are never dropped.

This repository uses remote Supabase and does not use the Supabase local Docker stack. Isolated
execution therefore restores a read-only schema snapshot from remote Supabase into a disposable
vanilla PostgreSQL cluster, applies both migrations there, and reruns the catalog invariants.
Verification also includes migration-version uniqueness, database migration sanity, OpenSpec
validation, `git diff --check`, and a remote `supabase db push --dry-run`. If the scratch
PostgreSQL cluster cannot start, implementation stops at that failed evidence gate rather than
treating source inspection as equivalent execution. After approval and push, the same read-only
inventory queries and Supabase performance advisor will be rerun and their counts added to the
evidence ledger.

### Keep database credentials out of artifacts

Read-only inventories and dry runs load `SUPABASE_DB_PASSWORD` from the gitignored
`supabase/.env`. Commands, logs, evidence files, commits, and PR text must not contain credential
values or connection strings with embedded passwords. A network/authentication failure produces
no replacement inference from stale snapshots; the failed gate is recorded and retried only when
connectivity is restored.

## Risks / Trade-offs

- **[Risk] 78 new indexes add write amplification and may initially appear unused.** →
  **Mitigation:** each is the minimum single-column structure supporting a live FK; the evidence
  ledger labels the reason, and MYK9-109 can inform later consolidation.
- **[Risk] Regular index creation briefly blocks writes.** → **Mitigation:** recheck relation sizes,
  push in a quiet pre-launch window, and stop for a concurrent-index redesign if any affected
  relation has reached 100 MB.
- **[Risk] Same-name catalog drift aborts the migration.** → **Mitigation:** the live inventory
  confirms the intended names are absent, and failing closed is safer than accepting an unrelated
  object.
- **[Risk] Statistics reset or light traffic changes the zero-scan list.** → **Mitigation:** record
  timestamped baseline and post-push snapshots; do not infer usefulness from the raw count.
- **[Risk] Dropping a duplicate name referenced by tooling.** → **Mitigation:** repository-wide
  search found no runtime name dependency; source contract protects the retained names.

## Migration Plan

1. Record the live baseline and complete the zero-scan classification ledger.
2. Add the focused failing source-contract test.
3. Add one migration containing only the 78 supporting index additions and catalog
   postconditions.
4. Add a later migration containing only the two reviewed duplicate drops and postconditions.
5. Restore a read-only remote schema snapshot into a disposable vanilla PostgreSQL cluster and
   apply both migrations there; do not use Supabase local/Docker. Then run focused tests,
   migration sanity/version checks, OpenSpec validation, and a linked-project
   `supabase db push --dry-run`.
6. Obtain explicit approval for the real `supabase db push`.
7. Push during a quiet window and rerun the catalog inventory plus performance advisor.
8. If the additive migration must be rolled back, create a new forward migration dropping only
   the added indexes. If duplicate rollback is needed, recreate the exact recorded definitions in
   a new migration.
9. Record evidence in MYK9-113 and launch-readiness tracking; keep the issue open if the shared
   push or post-push advisor evidence is not complete.

## Open Questions

- Whether MYK9-109 will justify dropping any currently retained query indexes remains deferred to
  that realistic rehearsal; it does not block this bounded change.
