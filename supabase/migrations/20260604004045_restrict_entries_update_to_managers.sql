-- BUG-EX-13: route exhibitor self check-in through the RPC only.
--
-- Migration 118 created self_checkin_entry() and removed handler direct UPDATE,
-- but migration 129 reintroduced a broad handler UPDATE clause while fixing
-- manager scoping. That lets an exhibitor update any allowed entries column via
-- the browser API if a client path accidentally uses a direct UPDATE helper.
--
-- Keep show managers on direct UPDATE. Keep exhibitors on this narrow RPC,
-- which validates handler/owner/co-owner scope and writes only check_in_status.

create or replace function public.self_checkin_entry(
  p_entry_id uuid,
  p_new_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
  v_allowed_statuses text[] := array[
    'checked-in', 'conflict', 'pulled', 'at-gate', 'no-status'
  ];
begin
  if not p_new_status = any(v_allowed_statuses) then
    raise exception 'Status % is not allowed for self-check-in', p_new_status;
  end if;

  select p.id
    into v_person_id
    from public.people p
   where p.auth_user_id = (select auth.uid())
   limit 1;

  if v_person_id is null then
    raise exception 'Not authorized: caller is not linked to a person record';
  end if;

  update public.entries e
     set check_in_status = p_new_status,
         updated_at = now()
    from public.dogs d
   where e.id = p_entry_id
     and d.id = e.dog_id
     and (
       e.handler_id = v_person_id
       or d.owner_id = v_person_id
       or d.co_owner_id = v_person_id
     );

  if not found then
    raise exception 'Not authorized: caller does not own entry %', p_entry_id;
  end if;
end;
$$;

revoke all on function public.self_checkin_entry(uuid, text) from public;
grant execute on function public.self_checkin_entry(uuid, text) to authenticated;

drop policy if exists "entries_checkin_update_staff" on public.entries;
drop policy if exists "entries_checkin_update_own" on public.entries;
drop policy if exists "entries_update" on public.entries;

create policy "entries_update" on public.entries
  for update to authenticated
  using ((select public.can_manage_show(entries.show_id)))
  with check ((select public.can_manage_show(entries.show_id)));

notify pgrst, 'reload schema';
