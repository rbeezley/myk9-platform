-- Migration 148: Allow club_admin to insert dogs (mail-in entries)
--
-- Background
-- ----------
-- Migration 147 locked the `dogs_insert` RLS policy to:
--   * owner / co-owner themselves, OR
--   * trial_secretary (any club), OR
--   * site_admin
--
-- That missed club_admin, even though the Add Dog wizard exposes the owner
-- picker to the CLUB_ADMIN role for exactly the same mail-in-entry workflow
-- secretaries use. Without this, club admins entering mail-in paper entries
-- would hit a 42501 RLS violation when creating a new dog record on the
-- owner's behalf.
--
-- Fix
-- ---
-- Add `is_club_admin()` to the policy. `is_club_admin()` (migration 102) is
-- already scoped — it only returns true for callers with an active
-- `club_admin` user_role, so this does not open a wider hole than secretaries
-- already have.

BEGIN;

DROP POLICY IF EXISTS "dogs_insert" ON dogs;

CREATE POLICY "dogs_insert" ON dogs
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT get_my_person_id())
    OR co_owner_id = (SELECT get_my_person_id())
    OR (SELECT is_trial_secretary())
    OR (SELECT is_club_admin())
    OR (SELECT is_site_admin())
  );

COMMIT;
