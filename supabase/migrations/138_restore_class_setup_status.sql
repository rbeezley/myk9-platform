-- Restore 'setup' as a valid class status.
-- Migration 072 removed it, but the Pipeline Kanban uses 'setup' as a distinct
-- column (ring crew setting up). Without it, dragging to Setup violates the
-- CHECK constraint and shows "Failed to move" to the user.

ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_status_check;

ALTER TABLE classes ADD CONSTRAINT classes_status_check
  CHECK (status IN ('upcoming', 'setup', 'in_progress', 'completed', 'cancelled'));

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (run manually if needed):
--   ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_status_check;
--   ALTER TABLE classes ADD CONSTRAINT classes_status_check
--     CHECK (status IN ('upcoming', 'in_progress', 'completed', 'cancelled'));
