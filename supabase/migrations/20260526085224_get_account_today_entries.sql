-- =====================================================
-- Phase 0 step 7: get_account_today_entries() RPC
-- =====================================================
--
-- Returns the entry IDs the signed-in account is associated with as
-- handler, owner, or co-owner, scoped to shows happening today.
--
-- No parameters: identity is derived from `auth.uid()` via
-- `people.auth_user_id`, so a tampered client cannot ask for entries
-- belonging to a different account. Unauthenticated callers receive
-- an empty result rather than an error.
--
-- Predicate per Locked Decision 7 in
-- docs/plans/2026-05-17-unify-myk9show-myk9q.md:
--   entries.handler_id = $person_id
--   OR dogs.owner_id   = $person_id
--   OR dogs.co_owner_id = $person_id
-- scoped to shows where current_date BETWEEN start_date AND end_date
-- (mirrors the `getActiveShows` predicate used elsewhere in the
-- replication layer — same naive timezone semantics).
--
-- Withdrawn / scratched entries are excluded — those entries aren't
-- at the show today and shouldn't be auto-favorited. The exclusion
-- list matches the partial index in migration 003
-- (`entries_class_run_order_idx WHERE entry_status NOT IN
-- ('withdrawn', 'scratched')`).
--
-- SECURITY: SECURITY DEFINER so the function can join `people` and
-- `dogs` regardless of caller's RLS. Direct table queries against
-- `entries` remain RLS-protected; this RPC is the *only* way to
-- enumerate "my entries today" without re-implementing the predicate
-- client-side.

begin;

set local search_path = '';

create or replace function public.get_account_today_entries()
returns table (entry_id uuid)
language sql
stable
security definer
set search_path = ''
as $func$
  with me as (
    -- auth.uid() returns NULL for unauthenticated callers; the LIMIT 1
    -- + EXISTS check below means the function naturally returns an
    -- empty result rather than erroring in that case.
    select id as person_id
    from public.people
    where auth_user_id = auth.uid()
    limit 1
  ),
  today_shows as (
    select id
    from public.shows
    where deleted_at is null
      and current_date between start_date and end_date
  )
  select e.id as entry_id
  from public.entries e
  join public.trials t on t.id = e.trial_id
  join today_shows s on s.id = t.show_id
  left join public.dogs d on d.id = e.dog_id
  where exists (select 1 from me)
    and e.entry_status not in ('withdrawn', 'scratched')
    and (
      e.handler_id = (select person_id from me)
      or d.owner_id = (select person_id from me)
      or d.co_owner_id = (select person_id from me)
    );
$func$;

comment on function public.get_account_today_entries() is
  'Phase 0: returns entry IDs for the signed-in account at today''s shows. Derives person_id from auth.uid() — no parameters to tamper with. Excludes withdrawn/scratched entries. Unauthenticated callers receive an empty result.';

-- Lock down execute to authenticated + anon (anon gets an empty result
-- because auth.uid() is NULL; granting execute is required for the
-- empty-vs-error behavior documented in the plan). PUBLIC is revoked
-- to make the grant explicit.
revoke execute on function public.get_account_today_entries() from public;
grant execute on function public.get_account_today_entries() to authenticated, anon;

commit;
