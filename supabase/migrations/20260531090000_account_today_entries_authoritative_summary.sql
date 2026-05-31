-- Keep at-show access authoritative even when local replication is cold.

begin;

set local search_path = '';

drop function if exists public.get_account_today_entries();

create function public.get_account_today_entries()
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
    select id, name
    from public.shows
    where deleted_at is null
      and current_date between start_date and end_date
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
    coalesce(c.start_time, t.planned_start_time)::text as class_start_time
  from public.entries e
  left join public.trials t on t.id = e.trial_id
  left join public.classes c on c.id = e.class_id
  join today_shows s on s.id = coalesce(e.show_id, t.show_id)
  left join public.dogs d on d.id = e.dog_id
  where exists (select 1 from me)
    and e.deleted_at is null
    and e.entry_status not in ('withdrawn', 'scratched')
    and (e.trial_id is null or t.deleted_at is null)
    and (e.class_id is null or c.deleted_at is null)
    and (e.dog_id is null or d.deleted_at is null)
    and (
      e.handler_id = (select person_id from me)
      or d.owner_id = (select person_id from me)
      or d.co_owner_id = (select person_id from me)
    );
$func$;

comment on function public.get_account_today_entries() is
  'Returns signed-in account entries for today''s shows with enough show/class summary data to authorize at-show access before replicated rows hydrate.';

revoke execute on function public.get_account_today_entries() from public;
grant execute on function public.get_account_today_entries() to authenticated, anon;

commit;
