-- =============================================================================
-- Migration 108: Allow anonymous read access for TV display
--
-- The TV run order display at /tv/:showId is a public, unauthenticated page.
-- It needs anon SELECT on entries (scoped to active shows) and the shows
-- RLS policy needs updated status values (migration 072 renamed statuses
-- but the policy was never updated).
-- =============================================================================

-- 1. Add anon SELECT on entries, scoped to non-draft shows
CREATE POLICY "entries_anon_select_for_tv" ON entries
  FOR SELECT TO anon
  USING (
    show_id IN (
      SELECT id FROM shows
      WHERE status IN ('published', 'upcoming', 'in_progress', 'completed')
      AND deleted_at IS NULL
    )
  );

-- 2. Fix shows_select policy — migration 072 renamed 'accepting_entries' → 'published'
--    and 'closed' → 'upcoming', but the RLS policy was never updated.
DROP POLICY IF EXISTS "shows_select" ON shows;
CREATE POLICY "shows_select" ON shows
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (SELECT is_platform_admin())
    )
  );

NOTIFY pgrst, 'reload schema';
