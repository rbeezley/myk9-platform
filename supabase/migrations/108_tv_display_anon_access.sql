-- =============================================================================
-- Migration 108: TV display — anon access + realtime + stale status fixes
--
-- 1. Add anon SELECT on entries for the public TV display
-- 2. Fix shows_select, trials_select, classes_select RLS policies that still
--    reference 'accepting_entries' and 'closed' (renamed in migration 072)
-- 3. Enable Supabase Realtime for classes table (entries already enabled in 092)
-- 4. Set REPLICA IDENTITY FULL on entries so realtime filters on non-PK columns
--    (like show_id) work correctly
-- =============================================================================

-- 1. Anon SELECT on entries, scoped to non-draft shows
CREATE POLICY "entries_anon_select_for_tv" ON entries
  FOR SELECT TO anon
  USING (
    show_id IN (
      SELECT id FROM shows
      WHERE status IN ('published', 'upcoming', 'in_progress', 'completed')
      AND deleted_at IS NULL
    )
  );

-- 2a. Fix shows_select — add 'upcoming', remove stale 'accepting_entries'/'closed'
DROP POLICY IF EXISTS "shows_select" ON shows;
CREATE POLICY "shows_select" ON shows
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (SELECT is_platform_admin())
    )
  );

-- 2b. Fix trials_select — same stale status issue
DROP POLICY IF EXISTS "trials_select" ON trials;
CREATE POLICY "trials_select" ON trials
  FOR SELECT USING (
    show_id IN (
      SELECT id FROM shows
      WHERE (
        status IN ('published', 'upcoming', 'in_progress', 'completed')
        AND deleted_at IS NULL
      )
      OR (SELECT is_club_admin(club_id))
      OR (SELECT is_trial_secretary(club_id))
      OR (SELECT is_platform_admin())
    )
  );

-- 2c. Fix classes_select — same stale status issue
DROP POLICY IF EXISTS "classes_select" ON classes;
CREATE POLICY "classes_select" ON classes
  FOR SELECT USING (
    deleted_at IS NULL
    AND trial_id IN (
      SELECT t.id FROM trials t
      JOIN shows s ON s.id = t.show_id
      WHERE (
        s.status IN ('published', 'upcoming', 'in_progress', 'completed')
        AND s.deleted_at IS NULL
      )
      OR (SELECT is_club_admin(s.club_id))
      OR (SELECT is_trial_secretary(s.club_id))
      OR (SELECT is_platform_admin())
    )
  );

-- 3. Enable Supabase Realtime for classes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'classes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE classes;
  END IF;
END $$;

-- 4. Set REPLICA IDENTITY FULL on entries so realtime filters on show_id work
ALTER TABLE entries REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
