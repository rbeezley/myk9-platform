-- revoke_club_secretary could not revoke everything the system treats as a secretary.
--
-- Every read-side helper accepts BOTH role names — is_trial_secretary,
-- is_show_secretary, is_show_official and get_club_show_managers all match
-- `r.name IN ('secretary', 'trial_secretary')` — while this function looked up
-- `WHERE name = 'secretary'` alone. A club-scoped `trial_secretary` row therefore
-- granted access that the revoke path could not take away.
--
-- The failure is silent, which is what makes it worth a migration rather than a note.
-- The function returns void and ends with `IF v_assignment_id IS NULL THEN RETURN`, so
-- a revoke that matched no rows succeeds. The Show Access tab reports "Show access
-- revoked from X" on that success while X keeps every permission they had — the same
-- shape of silent authorization surprise this whole change set exists to remove.
--
-- Latent rather than live today: `trial_secretary` has no row in public.roles, so
-- nothing can currently hold one. It is fixed rather than ignored because
-- get_club_show_managers explicitly lists that role, so the tab would render a Revoke
-- button for it the moment the role existed. Excluding it from the list instead would
-- recreate the invisible-appointee hole that tab was built to close.
--
-- Found by Codex review of PR #1895.

BEGIN;

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
  v_actor_person_id uuid;
  v_assignment_id uuid;
BEGIN
  IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can revoke secretary access'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  -- Match every role the read side honours, not just the one the grant path writes.
  -- The UPDATE is unbounded on purpose: if a person somehow holds both rows, revoking
  -- one and leaving the other is the bug this migration exists to fix.
  WITH updated AS (
    UPDATE public.user_roles ur
    SET is_active = false
    WHERE ur.user_id = p_person_id
      AND ur.club_id = p_club_id
      AND ur.show_id IS NULL
      AND ur.is_active = true
      AND ur.role_id IN (
        SELECT r.id FROM public.roles r WHERE r.name IN ('secretary', 'trial_secretary')
      )
    RETURNING ur.id
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

COMMENT ON FUNCTION public.revoke_club_secretary(uuid, uuid) IS
  'Deactivates a person''s club-scoped secretary appointment. Matches every role the read-side helpers honour (secretary and trial_secretary), so access cannot survive a revoke that reported success.';

REVOKE EXECUTE ON FUNCTION public.revoke_club_secretary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_club_secretary(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
