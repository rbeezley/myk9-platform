-- Tighten the remaining people-management gaps from the DB migration sanity audit.
--
-- 1. people_insert_secretary was named as secretary-specific, but allowed any
--    authenticated user to insert an unlinked person. Keep owner self-create on
--    the existing people_insert policy; this policy is only for show staff
--    creating offline/unlinked people.
-- 2. delete_show_managed_person authorized the caller against p_show_id, then
--    soft-deleted p_person_id without proving that person had ever belonged to
--    that show. Add an explicit show/person relationship check before delete.

begin;

drop policy if exists people_insert_secretary on public.people;

CREATE POLICY people_insert_secretary on public.people
  for insert to authenticated
  with check (
    auth_user_id IS NULL
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.auth_user_id = (select auth.uid())
        and ur.is_active = true
        and (ur.expires_at is null or ur.expires_at > now())
        and r.name in ('secretary', 'club_admin', 'site_admin', 'platform_admin')
    )
  );

CREATE OR REPLACE FUNCTION public.can_manage_show_person_for_show(
  p_show_id uuid,
  p_person_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.entries e
    left join public.dogs d on d.id = e.dog_id
    where e.show_id = p_show_id
      and (
        e.handler_id = p_person_id
        or d.owner_id = p_person_id
        or d.co_owner_id = p_person_id
      )
  );
$$;

revoke all on function public.can_manage_show_person_for_show(uuid, uuid) from public;

CREATE OR REPLACE FUNCTION public.delete_show_managed_person(
  p_show_id uuid,
  p_person_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_person_id uuid;
begin
  if not public.can_manage_show(p_show_id) then
    RAISE EXCEPTION 'Permission denied for show %', p_show_id using errcode = '42501';
  end if;

  if not public.can_manage_show_person_for_show(p_show_id, p_person_id) then
    RAISE EXCEPTION 'Person % is not managed through show %', p_person_id, p_show_id
      using errcode = '42501';
  end if;

  select id into v_actor_person_id
  from public.people
  where auth_user_id = (select auth.uid())
  limit 1;

  update public.people p
  set deleted_at = now(),
      deleted_by = v_actor_person_id
  where p.id = p_person_id
    and p.auth_user_id is null
    and p.deleted_at is null
    and not exists (
      select 1
      from public.entries e
      where e.handler_id = p_person_id
        and e.deleted_at is null
    )
    and not exists (
      select 1
      from public.dogs d
      where (d.owner_id = p_person_id or d.co_owner_id = p_person_id)
        and d.deleted_at is null
    );
end;
$$;

GRANT EXECUTE on function public.delete_show_managed_person(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
