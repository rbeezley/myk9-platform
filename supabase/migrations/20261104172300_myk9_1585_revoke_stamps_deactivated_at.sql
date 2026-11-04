-- MYK9-1585: club-secretary and steward revokes set user_roles.is_active = false but left
-- deactivated_at NULL, so "when did this person lose access" read NULL (the audit log was intact).
-- FORWARD ONLY (owner, 2026-11-04): no backfill; rows revoked before this migration stay NULL.
-- Both functions are copied verbatim from their latest definitions
-- (docs/lessons/README.md#replace-function-latest); the only change is `deactivated_at = now()`.
--   revoke_club_secretary: 20261017163700_myk9_1208_step_up_reauth.sql
--   revoke_show_official:  20260830240000_show_officials_separates_label_from_permission.sql
-- Deliberately untouched: the club-delete trigger (MYK9-1388 keeps deactivated_at for person deletes).

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

  -- MYK9-1208: a role change needs a password confirmed in the last five minutes.
  PERFORM public.require_recent_reauth();

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  -- Match every role the read side honours, not just the one the grant path writes.
  -- The UPDATE is unbounded on purpose: if a person somehow holds both rows, revoking
  -- one and leaving the other is the bug this migration exists to fix.
  WITH updated AS (
    UPDATE public.user_roles ur
    SET is_active = false, deactivated_at = now()
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

REVOKE EXECUTE ON FUNCTION public.revoke_club_secretary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_club_secretary(uuid, uuid) TO authenticated;

-- 6. Un-naming, which had no RPC at all while the label lived in user_roles.
CREATE OR REPLACE FUNCTION public.revoke_show_official(
  p_person_id uuid,
  p_role_name text,
  p_show_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_club_id uuid;
BEGIN
  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = p_show_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'show not found' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(v_club_id)
    OR public.is_trial_secretary(v_club_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to change officials on this show' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.show_officials
  WHERE show_id = p_show_id
    AND person_id = p_person_id
    AND role = p_role_name;

  -- Mirror of the grant: un-naming a steward must also withdraw the ring
  -- assignment, or revoke would report success while access remained.
  IF p_role_name = 'steward' THEN
    UPDATE public.user_roles ur
    SET is_active = false, deactivated_at = now()
    FROM public.roles r
    WHERE r.id = ur.role_id
      AND r.name = 'steward'
      AND ur.user_id = p_person_id
      AND ur.show_id = p_show_id
      AND ur.is_active = true;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.revoke_show_official(uuid, text, uuid) IS
  'Removes someone from a show''s paperwork. For secretary and chairman this does not touch show access, which comes from a club appointment. For steward it also withdraws the show-scoped ring assignment that naming granted.';

REVOKE ALL ON FUNCTION public.revoke_show_official(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_show_official(uuid, text, uuid) TO authenticated;

-- Reactivation clears the stamp, in one place. Without this, revoke then re-grant leaves an ACTIVE
-- row with deactivated_at set. One trigger covers every path that flips a row back on:
-- grant_club_secretary, grant_show_official (steward), approve_role_request,
-- review_club_access_request, person restore, and client RoleManager re-grants.
-- It never stamps on true -> false: the club-delete trigger (MYK9-1388) deliberately leaves
-- deactivated_at NULL, and the revoke functions above stamp explicitly.
-- Sibling triggers on user_roles (none touch deactivated_at): trg_enforce_club_id_for_scoped_roles,
-- sync_user_roles_auth_user_id_trigger, trg_user_roles_require_recent_reauth (AFTER),
-- trg_user_roles_refuse_deleted_club_grant_ins/_upd (BEFORE), trg_user_roles_touch_access_epoch (AFTER).
CREATE OR REPLACE FUNCTION public.user_roles_clear_deactivated_at_on_reactivate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_active AND NOT COALESCE(OLD.is_active, false) THEN
    NEW.deactivated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.user_roles_clear_deactivated_at_on_reactivate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_roles_clear_deactivated_at_on_reactivate ON public.user_roles;
CREATE TRIGGER user_roles_clear_deactivated_at_on_reactivate
  BEFORE UPDATE OF is_active ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.user_roles_clear_deactivated_at_on_reactivate();
