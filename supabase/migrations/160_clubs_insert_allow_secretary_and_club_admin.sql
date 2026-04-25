-- Migration 160: Allow secretary and club_admin to insert clubs
--
-- Background
-- ----------
-- Migration 016 locked clubs_insert to is_platform_admin() / is_site_admin()
-- only. The Add Club button in BrowseClubsPage is shown to every
-- authenticated user, so non-site-admins (secretaries, club admins) clicking
-- Add Club hit a silent RLS failure: the UI optimistically navigates to the
-- new club detail page, but the row never persists.
--
-- Mirrors the pattern from migration 148 (dogs_insert): keep the existing
-- site_admin grant and add is_trial_secretary() and is_club_admin().
--
-- Both helpers (per migration 102) return true only for callers with an
-- active user_roles row of the matching role, so this does not open a wider
-- hole than these roles already have for related entities (dogs, people,
-- shows, etc.).

BEGIN;

DROP POLICY IF EXISTS "clubs_insert" ON clubs;

CREATE POLICY "clubs_insert" ON clubs
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT is_trial_secretary())
    OR (SELECT is_club_admin())
    OR (SELECT is_site_admin())
  );

COMMIT;
