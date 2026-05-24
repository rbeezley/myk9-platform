-- Follow-up review fixes for club role approval.
--
-- The prior migrations are already applied remotely. Keep this as an additive
-- migration so PADI can move forward safely.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_show_managed_person(
  p_show_id uuid,
  p_person_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_person_id uuid;
BEGIN
  IF NOT public.can_manage_show(p_show_id) THEN
    RAISE EXCEPTION 'Permission denied for show %', p_show_id USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  UPDATE public.people p
  SET deleted_at = now(),
      deleted_by = v_actor_person_id
  WHERE p.id = p_person_id
    AND p.auth_user_id IS NULL
    AND p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.entries e
      WHERE e.handler_id = p_person_id
        AND e.deleted_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.dogs d
      WHERE (d.owner_id = p_person_id OR d.co_owner_id = p_person_id)
        AND d.deleted_at IS NULL
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_club_secretary(
  p_person_id uuid,
  p_club_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secretary_role_id uuid;
  v_actor_person_id uuid;
  v_assignment_id uuid;
BEGIN
  IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can revoke secretary access'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_secretary_role_id
  FROM public.roles
  WHERE name = 'secretary';

  IF v_secretary_role_id IS NULL THEN
    RAISE EXCEPTION 'secretary role is missing' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  WITH updated AS (
    UPDATE public.user_roles
    SET is_active = false
    WHERE user_id = p_person_id
      AND role_id = v_secretary_role_id
      AND club_id = p_club_id
      AND show_id IS NULL
      AND is_active = true
    RETURNING id
  )
  SELECT id INTO v_assignment_id
  FROM updated
  LIMIT 1;

  IF v_assignment_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.permission_audit_log (
    user_id,
    action,
    target_type,
    target_id,
    new_value
  )
  VALUES (
    v_actor_person_id,
    'club_secretary_revoked',
    'user_role',
    v_assignment_id,
    jsonb_build_object('person_id', p_person_id, 'club_id', p_club_id, 'role', 'secretary')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_show_managed_person(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_club_secretary(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
