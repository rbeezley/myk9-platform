-- =============================================================================
-- Migration 038: Fix trials/classes RLS with SECURITY DEFINER helpers
--
-- Problem: trials and classes INSERT/UPDATE/DELETE policies use subqueries
-- against the shows table. These subqueries are subject to shows_select RLS,
-- creating nested RLS evaluation that can fail unexpectedly.
--
-- Fix: Create SECURITY DEFINER helper functions that bypass RLS when checking
-- show/trial management permissions, then use those in the policies.
-- =============================================================================

-- Helper: Check if current user can manage a specific show
-- (Bypasses shows_select RLS by using SECURITY DEFINER)
CREATE OR REPLACE FUNCTION can_manage_show(check_show_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shows s
    WHERE s.id = check_show_id
    AND (
      (SELECT public.is_club_admin(s.club_id))
      OR (SELECT public.is_trial_secretary(s.club_id))
      OR (SELECT public.is_platform_admin())
    )
  );
$$;

-- Helper: Check if current user can manage a specific trial's show
-- (Bypasses both trials_select and shows_select RLS)
CREATE OR REPLACE FUNCTION can_manage_trial(check_trial_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trials t
    JOIN public.shows s ON s.id = t.show_id
    WHERE t.id = check_trial_id
    AND (
      (SELECT public.is_club_admin(s.club_id))
      OR (SELECT public.is_trial_secretary(s.club_id))
      OR (SELECT public.is_platform_admin())
    )
  );
$$;

-- =============================================================================
-- TRIALS: Replace policies to use helper functions
-- =============================================================================

DROP POLICY IF EXISTS "trials_insert" ON trials;
CREATE POLICY "trials_insert" ON trials
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT can_manage_show(show_id)));

DROP POLICY IF EXISTS "trials_update" ON trials;
CREATE POLICY "trials_update" ON trials
  FOR UPDATE TO authenticated
  USING ((SELECT can_manage_show(show_id)));

DROP POLICY IF EXISTS "trials_delete" ON trials;
CREATE POLICY "trials_delete" ON trials
  FOR DELETE TO authenticated
  USING (
    (SELECT is_platform_admin())
    OR (SELECT can_manage_show(show_id))
  );

-- =============================================================================
-- CLASSES: Replace policies to use helper functions
-- =============================================================================

DROP POLICY IF EXISTS "classes_insert" ON classes;
CREATE POLICY "classes_insert" ON classes
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT can_manage_trial(trial_id)));

DROP POLICY IF EXISTS "classes_update" ON classes;
CREATE POLICY "classes_update" ON classes
  FOR UPDATE TO authenticated
  USING ((SELECT can_manage_trial(trial_id)));

DROP POLICY IF EXISTS "classes_delete" ON classes;
CREATE POLICY "classes_delete" ON classes
  FOR DELETE TO authenticated
  USING (
    (SELECT is_platform_admin())
    OR (SELECT can_manage_trial(trial_id))
  );
