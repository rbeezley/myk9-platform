-- Granting permanent club secretary access must fully reactivate a prior
-- assignment. The existing RPC set is_active but retained a past expires_at,
-- so role reads continued to exclude the assignment after a reported success.

BEGIN;

CREATE OR REPLACE FUNCTION public.grant_club_secretary(
  p_person_id uuid,
  p_club_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_person_id uuid;
  v_secretary_role_id uuid;
  v_assignment_id uuid;
BEGIN
  IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can grant secretary access'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'Person % not found', p_person_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Club % not found', p_club_id USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  SELECT id INTO v_secretary_role_id
  FROM public.roles
  WHERE name = 'secretary';

  IF v_secretary_role_id IS NULL THEN
    RAISE EXCEPTION 'secretary role is missing' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_assignment_id
  FROM public.user_roles
  WHERE user_id = p_person_id
    AND role_id = v_secretary_role_id
    AND club_id = p_club_id
    AND show_id IS NULL
  LIMIT 1;

  IF v_assignment_id IS NULL THEN
    INSERT INTO public.user_roles (
      user_id,
      role_id,
      club_id,
      granted_by,
      is_active
    )
    VALUES (
      p_person_id,
      v_secretary_role_id,
      p_club_id,
      v_actor_person_id,
      true
    )
    RETURNING id INTO v_assignment_id;
  ELSE
    UPDATE public.user_roles
    SET is_active = true,
        expires_at = NULL,
        granted_by = v_actor_person_id,
        granted_at = now()
    WHERE id = v_assignment_id;
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
    'club_secretary_granted',
    'user_role',
    v_assignment_id,
    jsonb_build_object(
      'person_id', p_person_id,
      'club_id', p_club_id,
      'role', 'secretary'
    )
  );

  RETURN v_assignment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_club_secretary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_club_secretary(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
