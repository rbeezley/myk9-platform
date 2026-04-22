-- Migration 147: Harden dogs_insert RLS policy
--
-- Background
-- ----------
-- Migration 016 set the dogs_insert policy to `WITH CHECK (true)`, meaning any
-- authenticated user could INSERT a row into `dogs` with *any* owner_id. This
-- allowed a logged-in user to create dogs owned by someone else (or by a
-- person record they don't control) — a privilege escalation path found by
-- the Add Dog wizard hardening pass.
--
-- Fix
-- ---
-- Restrict INSERT so the caller must be:
--   * the declared owner (owner_id matches their person record), OR
--   * the declared co-owner, OR
--   * a trial secretary operating on behalf of a club, OR
--   * a site/platform admin.
--
-- Also add a partial unique index on microchip_number so the same chip can't
-- be registered to multiple live dog records. NULL and soft-deleted rows are
-- excluded so legacy rows without chips keep working.

BEGIN;

DROP POLICY IF EXISTS "dogs_insert" ON dogs;

CREATE POLICY "dogs_insert" ON dogs
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT get_my_person_id())
    OR co_owner_id = (SELECT get_my_person_id())
    OR (SELECT is_trial_secretary())
    OR (SELECT is_site_admin())
  );

-- Microchip uniqueness: one live dog per chip number.
CREATE UNIQUE INDEX IF NOT EXISTS dogs_microchip_number_unique_live
  ON dogs (microchip_number)
  WHERE microchip_number IS NOT NULL
    AND deleted_at IS NULL;

COMMIT;
