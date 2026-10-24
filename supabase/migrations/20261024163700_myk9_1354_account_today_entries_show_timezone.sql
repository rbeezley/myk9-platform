-- MYK9-1354: "today" for get_account_today_entries() was the database's
-- current_date (UTC on Supabase) compared with show-local start_date/end_date.
-- For a US show that admitted exhibitors from ~5 pm PDT the day BEFORE day 1
-- and returned nothing from ~5 pm PDT on the LAST day. "Today" is now the
-- show-local date, taken from the show's primary trial timezone (the rule
-- submit_entries uses, MYK9-979). Body copied from the latest definition,
-- 20260908134500_optimize_account_today_entry_reads.sql.

begin;

create or replace function public.get_account_today_entries_at(p_at timestamptz)
returns table (
  entry_id uuid,
  show_id uuid,
  show_name text,
  class_id uuid,
  trial_id uuid,
  class_name text,
  class_start_time text
)
language sql
stable
security definer
set search_path = ''
as $func$
  with me as (
    select id as person_id
    from public.people
    where auth_user_id = auth.uid()
      and deleted_at is null
    limit 1
  ),
  today_shows as (
    select s.id, s.name
    from public.shows s
    cross join lateral (
      -- Same primary-trial rule as submit_entries (MYK9-979): earliest live
      -- trial, zone validated against pg_timezone_names, New York fallback.
      select coalesce(
        (
          select n.name
          from pg_catalog.pg_timezone_names n
          where n.name = (
            select t.timezone
            from public.trials t
            where t.show_id = s.id
              and t.deleted_at is null
            order by t.date nulls last, t.id
            limit 1
          )
        ),
        'America/New_York'
      ) as tz
    ) z
    where s.deleted_at is null
      -- Cheap prefilter: zones span UTC-12..UTC+14, so the show-local date is
      -- within one day of the UTC date.
      and s.start_date <= ((p_at at time zone 'UTC')::date + 1)
      and s.end_date >= ((p_at at time zone 'UTC')::date - 1)
      and (p_at at time zone z.tz)::date between s.start_date and s.end_date
  ),
  account_entry_ids as (
    select e.id
    from public.entries e
    join me on me.person_id = e.handler_id
    where e.deleted_at is null
      and e.entry_status not in ('withdrawn', 'scratched')

    union

    select e.id
    from public.entries e
    join public.dogs d on d.id = e.dog_id
    join me on me.person_id = d.owner_id
    where e.deleted_at is null
      and e.entry_status not in ('withdrawn', 'scratched')
      and d.deleted_at is null

    union

    select e.id
    from public.entries e
    join public.dogs d on d.id = e.dog_id
    join me on me.person_id = d.co_owner_id
    where e.deleted_at is null
      and e.entry_status not in ('withdrawn', 'scratched')
      and d.deleted_at is null
  )
  select
    e.id as entry_id,
    s.id as show_id,
    s.name as show_name,
    e.class_id,
    coalesce(c.trial_id, e.trial_id) as trial_id,
    coalesce(
      nullif(trim(concat_ws(' ', c.element, c.level, nullif(c.section, '-'))), ''),
      c.name
    ) as class_name,
    coalesce(c.start_time::text, t.planned_start_time) as class_start_time
  from account_entry_ids eligible
  join public.entries e on e.id = eligible.id
  left join public.trials t on t.id = e.trial_id
  left join public.classes c on c.id = e.class_id
  join today_shows s on s.id = coalesce(e.show_id, t.show_id)
  left join public.dogs d on d.id = e.dog_id
  where e.deleted_at is null
    and e.entry_status not in ('withdrawn', 'scratched')
    and (e.trial_id is null or t.deleted_at is null)
    and (e.class_id is null or c.deleted_at is null)
    and (e.dog_id is null or d.deleted_at is null);
$func$;

comment on function public.get_account_today_entries_at(timestamptz) is
  'MYK9-1354: get_account_today_entries() evaluated at an explicit instant. A show is today when the show-local date of p_at (primary trial timezone, America/New_York fallback) is within start_date..end_date. Not client-callable: a client must not choose its own clock.';

-- Only the owner and the wrapper below call this; no client role may pick the clock.
revoke execute on function public.get_account_today_entries_at(timestamptz) from public, anon, authenticated;

create or replace function public.get_account_today_entries()
returns table (
  entry_id uuid,
  show_id uuid,
  show_name text,
  class_id uuid,
  trial_id uuid,
  class_name text,
  class_start_time text
)
language sql
stable
security definer
set search_path = ''
as $func$
  select * from public.get_account_today_entries_at(now());
$func$;

comment on function public.get_account_today_entries() is
  'Returns signed-in account entries for today''s shows (today = show-local date, MYK9-1354) with enough show/class summary data to authorize at-show access before replicated rows hydrate.';

revoke execute on function public.get_account_today_entries() from public, anon;
grant execute on function public.get_account_today_entries() to authenticated;

commit;
