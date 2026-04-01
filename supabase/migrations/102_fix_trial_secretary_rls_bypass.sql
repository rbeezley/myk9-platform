-- =============================================================================
-- Migration 102: Remove club_id IS NULL bypass from is_trial_secretary()
--                and is_club_admin() RLS helper functions
--
-- SECURITY FIX: Both is_trial_secretary() and is_club_admin() contained a
-- predicate `ur.club_id IS NULL` in their club_id matching clause:
--
--   AND (check_club_id IS NULL OR ur.club_id = check_club_id OR ur.club_id IS NULL)
--
-- This means any user_roles row inserted without a club_id acted as a
-- platform-wide grant for that role. A secretary with no club_id could
-- modify visibility settings, release results, and manage volunteers for
-- ANY show — not just shows belonging to their assigned club.
--
-- This migration:
--   1. Replaces is_trial_secretary() — removes `ur.club_id IS NULL` fallback
--   2. Replaces is_club_admin() — removes the same fallback
--   3. Deletes any existing over-privileged rows (NULL club_id for these roles)
--   4. Adds a constraint trigger on user_roles enforcing club_id IS NOT NULL
--      for secretary and club_admin roles
-- =============================================================================

-- 1. Fix is_trial_secretary(): require club_id match when check_club_id is provided
CREATE OR REPLACE FUNCTION is_trial_secretary(check_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name IN ('secretary', 'trial_secretary')
      AND ur.is_active = true
      AND (check_club_id IS NULL OR ur.club_id = check_club_id)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

-- 2. Fix is_club_admin(): remove the same ur.club_id IS NULL fallback
CREATE OR REPLACE FUNCTION is_club_admin(check_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name = 'club_admin'
      AND ur.is_active = true
      AND (check_club_id IS NULL OR ur.club_id = check_club_id)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

-- 3. Backfill: remove any existing user_roles rows for secretary/club_admin
--    that have NULL club_id (these are the over-privileged rows).
--    We delete rather than guess a club_id — an admin can re-grant with
--    the correct club scope.
DELETE FROM public.user_roles ur
USING public.roles r
WHERE r.id = ur.role_id
  AND r.name IN ('secretary', 'trial_secretary', 'club_admin')
  AND ur.club_id IS NULL;

-- 4. Add constraint: secretary and club_admin roles must have a club_id.
--    PostgreSQL CHECK constraints cannot contain subqueries, so we use a
--    CONSTRAINT TRIGGER that fires on INSERT/UPDATE and raises an exception
--    if club_id is NULL for these role types.

CREATE OR REPLACE FUNCTION enforce_club_id_for_scoped_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_role_name TEXT;
BEGIN
  SELECT r.name INTO v_role_name
  FROM public.roles r
  WHERE r.id = NEW.role_id;

  IF v_role_name IN ('secretary', 'trial_secretary', 'club_admin')
     AND NEW.club_id IS NULL THEN
    RAISE EXCEPTION 'club_id is required for role "%" — secretary and club_admin roles must be scoped to a club', v_role_name
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Use a CONSTRAINT TRIGGER so it behaves like a CHECK constraint
-- (deferrable, raises check_violation error code)
DROP TRIGGER IF EXISTS trg_enforce_club_id_for_scoped_roles ON public.user_roles;
CREATE CONSTRAINT TRIGGER trg_enforce_club_id_for_scoped_roles
  AFTER INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_club_id_for_scoped_roles();
