-- =============================================================================
-- Migration 135: Allow trial secretaries to create shows for their club
--
-- Context:
-- The Secretary Dashboard exposes a "New Show" button to users with the
-- `secretary` role, but the `shows_insert` RLS policy (migration 016) only
-- permits `is_club_admin(club_id)` or `is_platform_admin()`. This caused
-- INSERT requests from secretaries to fail with 42501 "new row violates
-- row-level security policy" — silently, because the UI runs an optimistic
-- update before the server confirms. Outcome: shows appear in the UI and
-- then vanish on reload (they never reach Postgres).
--
-- Fix: amend the shows_insert policy WITH CHECK clause to include
-- is_trial_secretary(club_id). A secretary scoped to club X can create
-- shows for club X. Also modernize to use is_site_admin() per the canonical
-- convention established in migration 124.
-- =============================================================================

DROP POLICY IF EXISTS "shows_insert" ON public.shows;

CREATE POLICY "shows_insert" ON public.shows
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_club_admin(club_id))
    OR (SELECT public.is_trial_secretary(club_id))
    OR (SELECT public.is_site_admin())
  );

COMMENT ON POLICY "shows_insert" ON public.shows IS
  'Club admins, trial secretaries (scoped to club), and site admins may create shows.';
