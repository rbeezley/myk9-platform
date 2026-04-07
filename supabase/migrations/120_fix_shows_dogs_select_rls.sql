-- Migration 120: Fix shows and dogs SELECT RLS policies
--
-- Shows: Add secretary/admin visibility for draft shows.
-- Previously only published/upcoming/in_progress/completed were visible
-- to non-admin users. Secretaries need to see drafts they're managing.
--
-- Dogs: Restrict to own dogs for regular users. Previously any
-- authenticated user could see all non-deleted dogs. Exhibitors
-- should only see dogs they own or co-own. Secretaries, judges,
-- and platform admins retain full visibility.
--
-- Depends on: migration 108 (current shows_select), migration 016 (current dogs_select)
-- Rollback: restore policies from migrations 108 and 016

-- === SHOWS ===
DROP POLICY IF EXISTS "shows_select" ON shows;

CREATE POLICY "shows_select" ON shows
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (SELECT is_trial_secretary())
      OR (SELECT is_platform_admin())
    )
  );

-- === DOGS ===
DROP POLICY IF EXISTS "dogs_select" ON dogs;

CREATE POLICY "dogs_select" ON dogs
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      owner_id = (SELECT get_my_person_id())
      OR co_owner_id = (SELECT get_my_person_id())
      OR (SELECT is_trial_secretary())
      OR (SELECT has_role('judge'))
      OR (SELECT is_platform_admin())
    )
  );

-- Rollback:
-- DROP POLICY IF EXISTS "shows_select" ON shows;
-- CREATE POLICY "shows_select" ON shows FOR SELECT USING (
--   deleted_at IS NULL AND (
--     status IN ('published', 'upcoming', 'in_progress', 'completed')
--     OR (SELECT is_platform_admin())
--   )
-- );
-- DROP POLICY IF EXISTS "dogs_select" ON dogs;
-- CREATE POLICY "dogs_select" ON dogs FOR SELECT USING (
--   deleted_at IS NULL OR (SELECT is_platform_admin())
-- );
