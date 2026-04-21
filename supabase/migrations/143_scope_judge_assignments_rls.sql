-- =============================================================================
-- Migration 143: Scope judge_assignments write RLS to show owners
--
-- Context:
-- The `judge_assignments_all` policy from migration 006 was
--   FOR ALL TO authenticated USING (true)
-- which let ANY authenticated user (exhibitor, judge, spectator) INSERT,
-- UPDATE, or DELETE rows in judge_assignments for ANY show. An attacker could
-- call `persistShowJudgeAssignments(victimShowId, [...])` directly against
-- PostgREST and wipe + replace every judge panel on the platform.
--
-- The Show Creation Wizard and the edit-show form rely on this table via
-- `persistShowJudgeAssignments` (show-scoped rows with class_id IS NULL) and
-- `upsertClassJudgeAssignment` (class-scoped rows with class_id set). Both
-- are invoked by club admins and trial secretaries for their own shows.
--
-- Fix: replace `judge_assignments_all` with a write policy that requires the
-- caller to be a club admin or trial secretary for the show's club, an
-- existing official on the show, or a site admin. SELECT remains public so
-- show detail pages can display the judge panel.
-- =============================================================================

DROP POLICY IF EXISTS "judge_assignments_all" ON public.judge_assignments;

CREATE POLICY "judge_assignments_write" ON public.judge_assignments
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = judge_assignments.show_id
        AND (
          public.is_club_admin(s.club_id)
          OR public.is_trial_secretary(s.club_id)
          OR public.is_show_official(s.id)
        )
    )
  )
  WITH CHECK (
    (SELECT public.is_site_admin())
    OR EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = judge_assignments.show_id
        AND (
          public.is_club_admin(s.club_id)
          OR public.is_trial_secretary(s.club_id)
          OR public.is_show_official(s.id)
        )
    )
  );

COMMENT ON POLICY "judge_assignments_write" ON public.judge_assignments IS
  'Only club admins, trial secretaries of the show''s club, existing show officials, and site admins may insert/update/delete judge assignments. SELECT remains public via judge_assignments_select.';
