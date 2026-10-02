-- MYK9-921: delete_show_managed_person stamps deleted_by with the caller's auth
-- uid, not their people.id.
--
-- WHY
--
--   people.deleted_by references auth.users(id) (people_deleted_by_fkey), and
--   people.id is never an auth uid. The function looked up the caller's
--   people.id and wrote that, so:
--     * a caller with a person row (every real secretary) hit 23503
--       people_deleted_by_fkey and the delete rolled back (proved on a
--       schema-only copy of live, 2026-10-02: Key (deleted_by)=(<people.id>) is
--       not present in table "users");
--     * a caller without one stamped NULL, which the Undo check
--       (private.can_undo_soft_delete: deleted_by = auth.uid()) can never match.
--   Live had 0 soft-deleted people when this was written, so there is no
--   existing deleted_by to repair.
--
-- SOURCE (LESSONS replace-function-latest): the body is copied from the latest
-- migration that defines it, 20260605192839_tighten_people_delete_scope.sql,
-- which matches pg_get_functiondef on live (2026-10-02). The only change is the
-- deleted_by value; the v_actor_person_id lookup is removed with it.
-- CREATE OR REPLACE keeps the owner (postgres), SECURITY DEFINER, the empty
-- search_path and the ACL; the GRANT is restated so the ACL reads in one place.
--
-- Behavioral coverage: supabase/tests/myk9_921_show_managed_person_deleted_by_test.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_show_managed_person(
  p_show_id uuid,
  p_person_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_show(p_show_id) then
    RAISE EXCEPTION 'Permission denied for show %', p_show_id using errcode = '42501';
  end if;

  if not public.can_manage_show_person_for_show(p_show_id, p_person_id) then
    RAISE EXCEPTION 'Person % is not managed through show %', p_person_id, p_show_id
      using errcode = '42501';
  end if;

  -- deleted_by references auth.users(id): stamp the caller's auth uid, which
  -- is also what the Undo window (private.can_undo_soft_delete) compares.
  update public.people p
  set deleted_at = now(),
      deleted_by = (select auth.uid())
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

-- The live ACL, restated (postgres owner, authenticated, service_role; no anon).
REVOKE ALL ON FUNCTION public.delete_show_managed_person(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_show_managed_person(uuid, uuid) TO authenticated, service_role;

notify pgrst, 'reload schema';

COMMIT;
