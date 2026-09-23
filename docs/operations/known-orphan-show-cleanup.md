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

The preflight prints the exact show identity, same-title siblings, counts for
entries, enrollments, submissions, activity, and retained record classes, plus
the catalog edge-count status and the live FK definitions. It always rolls back
its read-only transaction.

This preflight is advisory and can become stale. The catalog status compares
live edge counts with the reviewed manifest counts and prints every live edge
for inspection; a matching count alone does not prove each edge is unchanged.
If the target identity differs, any blocker is present, the catalog counts
differ, or an edge is unknown or changed, stop and investigate. An approved
site administrator must recheck eligibility through the RPC when using the
existing Show Details permanent-delete action. The RPC performs the authoritative
catalog and retained-record checks in the deletion transaction.

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
