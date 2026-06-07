-- Realtime publication fix: add show_announcements and shows to supabase_realtime.
--
-- Context (see docs/realtime-publication-audit.md):
--   Supabase Realtime streams postgres_changes by tailing the WAL through the
--   `supabase_realtime` publication. A table that is NOT a member produces no
--   stream, so .on('postgres_changes', { table }) silently delivers nothing.
--
--   Both of these tables already have LIVE subscribers that were silently no-op:
--     - show_announcements  → announcementStore (mounted via useAnnouncementSubscription
--                             in App.tsx) — in-app realtime announcement feed + toasts.
--                             (Push notifications are unaffected: they ride a DB
--                              trigger → webhook, independent of postgres_changes.)
--     - shows               → useRealTimeUpdates (BrowseShowsPage, show-management
--                             pages via useShowRealTimeUpdates).
--
--   RLS already permits authenticated SELECT on both (verified against pg_policies),
--   so Realtime will deliver to subscribers once the tables are published.
--
-- Idempotent: ADD TABLE is guarded so re-running (or running against a DB where the
-- dashboard already added the table) is a no-op rather than an error.

-- 1. show_announcements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'show_announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE show_announcements;
  END IF;
END $$;

-- announcementStore subscribes with `filter: show_id=eq.<id>` on INSERT/UPDATE/DELETE.
-- INSERT/UPDATE always carry the full new row, but DELETE only carries the columns
-- in the old tuple. Under REPLICA IDENTITY DEFAULT that is just the PK, so the
-- show_id filter would never match a DELETE and the live list would keep a deleted
-- announcement. REPLICA IDENTITY FULL logs the full old row so the filter works.
-- (Same reasoning as migration 108 for `entries`.) Announcements are low-volume,
-- so the extra WAL is negligible.
ALTER TABLE show_announcements REPLICA IDENTITY FULL;

-- 2. shows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'shows'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE shows;
  END IF;
END $$;

-- NOTE: `shows` is intentionally left at REPLICA IDENTITY DEFAULT. Its subscribers
-- filter only on the PK (`id=eq.<id>` in useShowRealTimeUpdates) or use no filter
-- (useRealTimeUpdates), and the unfiltered DELETE path triggers a full reload rather
-- than reading old-row columns — so FULL is unnecessary and would add WAL overhead on
-- a hotter table than announcements.

NOTIFY pgrst, 'reload schema';
