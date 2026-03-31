-- =============================================================================
-- Migration 100: Harden volunteer scheduling RLS policies
--
-- Fixes from migration 095:
-- 1. CRITICAL: Policies used user_roles.user_id = auth.uid(), but user_roles.user_id
--    references people(id), not auth.users(id). Policies never matched any user.
-- 2. No show scoping — secretary for Show A could manage volunteers for Show B.
-- 3. 6x duplicated inline subqueries with redundant WITH CHECK clauses.
-- 4. Missing expires_at check on role assignments.
-- 5. Missing club_admin access.
--
-- Fix: Reuse existing can_manage_show(show_id) which correctly checks
-- is_club_admin(club_id) OR is_trial_secretary(club_id) OR is_platform_admin()
-- with proper people join, is_active, and expires_at checks.
-- =============================================================================

-- [ADDED] Dependency guard: verify can_manage_show() exists before proceeding.
-- If this fails, migration 038 was not applied — stop and investigate.
DO $$ BEGIN
  PERFORM can_manage_show(NULL);
EXCEPTION WHEN undefined_function THEN
  RAISE EXCEPTION 'DEPENDENCY MISSING: can_manage_show() from migration 038 must exist before applying this migration';
END $$;

-- 1. Helper: resolve show_id from a volunteer record
--    Needed because volunteer_class_assignments has no show_id column.
CREATE OR REPLACE FUNCTION volunteer_show_id(vol_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT show_id FROM public.volunteers WHERE id = vol_id;
$$;

-- 2. Drop broken write policies from migration 095
DROP POLICY IF EXISTS "Secretary can manage volunteers" ON volunteers;
DROP POLICY IF EXISTS "Secretary can manage class assignments" ON volunteer_class_assignments;
DROP POLICY IF EXISTS "Secretary can manage general assignments" ON volunteer_general_assignments;

-- 3. Recreate with can_manage_show() — show-scoped, correct auth, DRY
--    No WITH CHECK needed: Postgres uses USING as fallback for FOR ALL policies.

CREATE POLICY "Show managers can manage volunteers"
  ON volunteers FOR ALL TO authenticated
  USING ((SELECT can_manage_show(show_id)));

CREATE POLICY "Show managers can manage class assignments"
  ON volunteer_class_assignments FOR ALL TO authenticated
  USING ((SELECT can_manage_show(volunteer_show_id(volunteer_id))));

CREATE POLICY "Show managers can manage general assignments"
  ON volunteer_general_assignments FOR ALL TO authenticated
  USING ((SELECT can_manage_show(show_id)));
