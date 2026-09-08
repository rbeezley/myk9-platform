-- Keep account-today authorization authoritative while making the ownership
-- branches indexable. The old OR predicate joined every today's entry to dogs
-- before it could use the handler/owner/co-owner filters, which left the
-- exhibitor route with a long-lived RPC during navigation (MYK9-441).

begin;

-- These are ordinary indexes because Supabase runs migrations in a transaction.
-- Refuse to wait behind show-day writes, and require a separately coordinated
-- concurrent-index rollout once either source table reaches 100 MB.
set local lock_timeout = '5s';
set local statement_timeout = '10min';

do $$
declare
  oversized text;
begin
  select string_agg(
    format('%I.%I (%s)', n.nspname, c.relname, pg_size_pretty(pg_relation_size(c.oid))),
    ', '
    order by c.relname
  )
  into oversized
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and n.nspname = 'public'
    and c.relname in ('entries', 'dogs')
    and pg_relation_size(c.oid) >= 100 * 1024 * 1024;

  if oversized is not null then
    raise exception
      'MYK9-441 requires a concurrent-index plan before indexing relations at or above 100 MB: %',
      oversized;
  end if;
end
$$;

create index if not exists entries_active_handler_id_idx
  on public.entries (handler_id)
  where deleted_at is null
    and entry_status not in ('withdrawn', 'scratched');

create index if not exists entries_active_dog_id_idx
  on public.entries (dog_id)
  where deleted_at is null
    and entry_status not in ('withdrawn', 'scratched');

create index if not exists dogs_active_co_owner_id_idx
  on public.dogs (co_owner_id)
  where deleted_at is null;

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

comment on function public.get_account_today_entries() is
  'Returns signed-in account entries for today''s shows with enough show/class summary data to authorize at-show access before replicated rows hydrate.';

-- The RPC is authenticated-only; make the anon decision explicit for the
-- migration grant contract as well as the database ACL.
revoke execute on function public.get_account_today_entries() from public, anon;
grant execute on function public.get_account_today_entries() to authenticated;

commit;
