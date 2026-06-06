-- Allow exhibitors to reassign the display handler name on their own entries.
--
-- The entries_update RLS policy only permits show managers (can_manage_show).
-- Exhibitors need to update the denormalized `handler` TEXT column when a proxy
-- handler runs one of their dogs. This RPC mirrors self_checkin_entry: it runs
-- as SECURITY DEFINER to bypass RLS, but enforces owner/co-owner/handler scope
-- before writing.

create or replace function public.update_entry_handler(
  p_entry_id uuid,
  p_handler  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
begin
  select p.id
    into v_person_id
    from public.people p
   where p.auth_user_id = (select auth.uid())
   limit 1;

  if v_person_id is null then
    raise exception 'Not authorized: caller is not linked to a person record';
  end if;

  update public.entries e
     set handler    = p_handler,
         updated_at = now()
    from public.dogs d
   where e.id      = p_entry_id
     and d.id      = e.dog_id
     and (
       e.handler_id  = v_person_id
       or d.owner_id    = v_person_id
       or d.co_owner_id = v_person_id
     );

  if not found then
    raise exception 'Not authorized: caller does not own entry %', p_entry_id;
  end if;
end;
$$;

revoke all on function public.update_entry_handler(uuid, text) from public;
grant execute on function public.update_entry_handler(uuid, text) to authenticated;

notify pgrst, 'reload schema';
