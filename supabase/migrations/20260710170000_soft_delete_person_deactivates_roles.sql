-- Deactivate a person's role grants when their person row is soft-deleted.
--
-- Why (Codex review of PR #1257, P1): soft_delete_person tombstones only
-- public.people. The RBAC RPCs (get_user_roles / get_effective_permissions)
-- join people without filtering deleted_at, so a tombstoned person's
-- user_roles rows stayed effective — a self-deleted secretary/judge could
-- sign back in (auth.users is untouched by soft delete) and still exercise
-- staff privileges. Deactivating the grants inside the same RPC closes that
-- for every caller (self-service, admin, show manager).
--
-- Restore semantics: restore_person intentionally does NOT reactivate roles.
-- Blanket reactivation would over-grant (it cannot distinguish grants that
-- were already inactive before the delete). After a restore, roles must be
-- re-granted explicitly by an admin.
--
-- Auth identity: banning/deleting the auth.users row requires the service
-- role and stays with the admin-delete-user edge function (hard delete).

CREATE OR REPLACE FUNCTION public.soft_delete_person(p_person_id uuid)
RETURNS SETOF public.people
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  -- Site admin, a manager of a show this person is entered in, or the person
  -- themself (self-service account deletion).
  IF NOT (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show_person(p_person_id))
    OR EXISTS (
      SELECT 1 FROM public.people
      WHERE id = p_person_id
        AND auth_user_id = (SELECT auth.uid())
        AND deleted_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.people
  SET deleted_at = NOW(), deleted_by = auth.uid(), updated_at = NOW()
  WHERE id = p_person_id AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Person not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  -- A tombstoned person must not retain effective role grants (RBAC lookups
  -- do not filter people.deleted_at). Runs after the owns-dogs trigger guard
  -- (MK001) so a blocked delete leaves roles untouched.
  UPDATE public.user_roles
  SET is_active = false
  WHERE user_id = p_person_id AND is_active;

  RETURN QUERY SELECT * FROM public.people WHERE id = p_person_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_person(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_person(uuid) TO authenticated;
