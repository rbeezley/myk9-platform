# Known leaked E2E show preflight (MYK9-615)

The published show `[E2E MYK9-336] Past Due Payment Fixture` with ID
`f3360000-0000-0000-0000-000000000001` was found in the shared environment,
but its creator is not recoverable from repository history. It is outside the
canonical demo fixture and must never be removed by `supabase/seed-demo.sql`.

The one-time artifact is read-only evidence. Run
`scripts/qa/preflight-known-orphan-show.sql` in a read-only database session
after the artifact is available in the approved deployment checkout:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/qa/preflight-known-orphan-show.sql
```

The preflight prints the exact show identity and same-title siblings, followed
by summary counts for entries, enrollments, submissions, activity, and common
retained records. It also reads the manifest embedded in the current
`hard_delete_show` function, compares every live FK identity, column, and delete
action against it, and reports missing or added/changed edges. The status is an
exact comparison, not an edge-count comparison.

The catalog-driven inventory then emits one read-only row count for every live
FK edge into shows, trials, or classes, including announcements, carts,
assignments, favorites, tickets, and cross-show links through a target trial or
class. These per-edge rows are the complete blocker inventory for the reviewed
FK graph; the summary counts above only spotlight common record classes. Each
row includes its exact FK definition, the manifest disposition (`DISPOSABLE`
only for a matched reviewed structural edge; all others default to
`RETAINED`), a review status, and the referencing-row count. New or changed
edges are labeled `UNCLASSIFIED / CHANGED — STOP`; composite edges are labeled
`UNCLASSIFIED COMPOSITE FK — STOP` and have no row count. Only the two reviewed
structural edges can be labeled disposable; any other or missing disposition
stops the preflight. The preflight ends by rolling back its read-only
transaction.

This preflight is advisory and can become stale. If the RPC or its embedded
manifest is unavailable, the exact comparison reports a stop status. If the
target identity differs, any blocker is present, the catalog status is not an
exact match, or any edge is unclassified/changed, stop and investigate. Even
with an exact match and zero reported rows, an approved site administrator must
recheck eligibility through the RPC when using the existing Show Details
permanent-delete action. The RPC performs the authoritative catalog and
retained-record checks in the deletion transaction.

Any shared cleanup, reseed, or recording of post-delete and sibling evidence
requires separate approval. Once approved, use only the existing Show Details
site-admin action for the exact show. If that action refuses, stop; do not edit
the seed, weaken the guard, or perform hand-written database cleanup. Do not
create another admin surface for this one-time task.

After a separately approved cleanup, the operator may record exact post-delete
and sibling evidence using read-only checks:

```sql
select count(*) as target_show_count
from public.shows
where id = 'f3360000-0000-0000-0000-000000000001';

select count(*) as other_same_name_count
from public.shows
where id <> 'f3360000-0000-0000-0000-000000000001'
  and name = '[E2E MYK9-336] Past Due Payment Fixture';
```

Do not broaden the target to all published shows, a name pattern, or a date
range. A future leaked UUID needs its own reviewed inventory and preflight.
