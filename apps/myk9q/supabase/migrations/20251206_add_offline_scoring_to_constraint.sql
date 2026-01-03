-- ============================================================================
-- Migration: Add 'offline-scoring' to class_status CHECK constraint
-- ============================================================================
-- Purpose:
--   Add 'offline-scoring' as a valid class status value.
--   This status is used when a judge is scoring offline and the run order
--   data in the database may be stale.
-- Date: 2025-12-06
-- ============================================================================

-- Step 1: Drop the existing constraint
ALTER TABLE classes
DROP CONSTRAINT IF EXISTS classes_class_status_text_check;

-- Step 2: Add the new constraint with 'offline-scoring' included
ALTER TABLE classes
ADD CONSTRAINT classes_class_status_text_check
CHECK (class_status IN (
  'no-status',
  'setup',
  'briefing',
  'break',
  'start_time',
  'in_progress',
  'offline-scoring',
  'completed'
));

-- Step 3: Update column comment
COMMENT ON COLUMN classes.class_status IS
'Current status of the class: no-status (default), setup, briefing, break, start_time, in_progress, offline-scoring (judging offline), or completed';

-- Verify the change
SELECT 'Successfully added offline-scoring to classes.class_status constraint' as status;
