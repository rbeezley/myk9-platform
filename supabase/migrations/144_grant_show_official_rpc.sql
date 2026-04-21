-- =============================================================================
-- Migration 144: grant_show_official RPC
--
-- Context:
-- The Show Creation Wizard grants secretary/chairman/steward roles to
-- selected officials via `rbacService.ensureUserHasRole(personId, role,
-- { showId })`. This silently fails for every non-site-admin caller:
--
--   1. RLS (migration 079) restricts `user_roles` INSERT to
--      `is_site_admin()`, so a club admin or trial secretary creating a
--      show cannot INSERT any role assignment at all.
--   2. Even if RLS allowed it, the constraint trigger from migration 102
--      requires `club_id NOT NULL` for `secretary` role rows. The wizard
--      passes only `{ showId }` — no `clubId` — so the INSERT would hit
--      `check_violation`.
--
-- The failure is swallowed by `Promise.allSettled` + inner
-- `.catch(logger.warn)` in the wizard's save path, so users see no error
-- even though no show-scoped role assignments ever land in the database.
-- A DB audit on 2026-04-21 confirmed ZERO rows in `user_roles` with
-- `show_id IS NOT NULL` platform-wide.
--
-- Fix: Introduce a SECURITY DEFINER RPC that:
--   - Restricts the grantable role set to {secretary, chairman, steward}
--     so it cannot be used to escalate to site_admin, club_admin, judge,
--     or exhibitor.
--   - Looks up the show's `club_id` and writes it into `user_roles.club_id`,
--     satisfying the migration 102 trigger.
--   - Authorizes the caller against the target show: site admin, club
--     admin / trial secretary for the show's club, or an existing show
--     official.
--   - Is idempotent: returns the existing row id if the assignment already
--     exists, reactivating it if previously deactivated.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.grant_show_official(
  p_person_id uuid,
  p_role_name text,
  p_show_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role_id uuid;
  v_club_id uuid;
  v_existing_id uuid;
  v_existing_active boolean;
  v_caller_auth uuid;
  v_caller_person_id uuid;
BEGIN
  v_caller_auth := auth.uid();
  IF v_caller_auth IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_role_name NOT IN ('secretary', 'chairman', 'steward') THEN
    RAISE EXCEPTION 'role "%" cannot be granted via grant_show_official — only secretary, chairman, steward allowed', p_role_name
      USING ERRCODE = '22023';
  END IF;

  SELECT s.club_id INTO v_club_id
  FROM public.shows s
  WHERE s.id = p_show_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'show % not found', p_show_id
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(v_club_id)
    OR public.is_trial_secretary(v_club_id)
    OR public.is_show_official(p_show_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to grant officials on show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'person % not found', p_person_id
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'role "%" does not exist', p_role_name
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_caller_person_id
  FROM public.people WHERE auth_user_id = v_caller_auth;

  SELECT id, is_active INTO v_existing_id, v_existing_active
  FROM public.user_roles
  WHERE user_id = p_person_id
    AND role_id = v_role_id
    AND show_id = p_show_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF NOT v_existing_active THEN
      UPDATE public.user_roles
      SET is_active = true,
          granted_at = NOW(),
          granted_by = v_caller_person_id,
          club_id = v_club_id
      WHERE id = v_existing_id;
    END IF;
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.user_roles (
    user_id, role_id, club_id, show_id, is_active, granted_at, granted_by
  ) VALUES (
    p_person_id, v_role_id, v_club_id, p_show_id, true, NOW(), v_caller_person_id
  )
  RETURNING id INTO v_existing_id;

  RETURN v_existing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_show_official(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_show_official(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.grant_show_official(uuid, text, uuid) IS
  'Grants a show-scoped official role (secretary/chairman/steward) to a person. Caller must be a site admin, club admin / trial secretary for the show''s club, or an existing show official. Looks up the show''s club_id to satisfy the migration 102 constraint trigger. Idempotent: returns existing assignment id, reactivating if previously inactive.';
