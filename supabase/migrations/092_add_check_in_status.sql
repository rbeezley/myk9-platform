-- Migration: Add check_in_status column for show-day entry tracking
-- Separate from entry_status (registration lifecycle) — these are independent axes.

-- Add check-in status column
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS check_in_status TEXT DEFAULT 'no-status';

-- Add CHECK constraint separately (allows IF NOT EXISTS on column)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entries_check_in_status_check'
  ) THEN
    ALTER TABLE entries
      ADD CONSTRAINT entries_check_in_status_check
      CHECK (check_in_status IN (
        'no-status', 'checked-in', 'conflict', 'pulled',
        'at-gate', 'come-to-gate', 'in-ring', 'completed'
      ));
  END IF;
END $$;

-- Index for filtered queries (class entries by check-in status)
CREATE INDEX IF NOT EXISTS entries_class_checkin_idx
  ON entries(class_id, check_in_status);

-- Enable realtime for entries table (idempotent — no-ops if already enabled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE entries;
  END IF;
END $$;

-- RLS: Staff (secretary, judge, steward, site_admin) can update check_in_status on any
-- entry in shows they have a role for. Exhibitors can only update their own entries.
CREATE POLICY "entries_checkin_update_staff" ON entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge', 'steward')
    )
  )
  WITH CHECK (true);

CREATE POLICY "entries_checkin_update_own" ON entries
  FOR UPDATE TO authenticated
  USING (
    handler_id = (SELECT id FROM people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    handler_id = (SELECT id FROM people WHERE auth_user_id = auth.uid())
  );
