-- Add 'no_status' as explicit enum value for class_status column
-- This replaces the use of NULL to represent "no status" with an explicit string value
-- Benefits: Cleaner code, no null checks, explicit state, consistent with other statuses

-- Step 1: Drop the old constraint
ALTER TABLE classes
DROP CONSTRAINT IF EXISTS classes_class_status_text_check;

-- Step 2: Convert existing 'none' values to 'no-status'
-- (Matches entries.entry_status convention from migration 016)
UPDATE classes
SET class_status = 'no-status'
WHERE class_status = 'none';

-- Step 3: Also convert any NULL values (just in case)
UPDATE classes
SET class_status = 'no-status'
WHERE class_status IS NULL;

ALTER TABLE classes
ADD CONSTRAINT classes_class_status_text_check
CHECK (class_status IN (
  'no-status',
  'setup',
  'briefing',
  'break',
  'start_time',
  'in_progress',
  'completed'
));

-- Step 4: Set default value for new rows
ALTER TABLE classes
ALTER COLUMN class_status SET DEFAULT 'no-status';

-- Step 5: Make column NOT NULL (now safe since we have a default)
ALTER TABLE classes
ALTER COLUMN class_status SET NOT NULL;

-- Step 6: Update column comment
COMMENT ON COLUMN classes.class_status IS
'Current status of the class: no-status (default), setup, briefing, break, start_time, in_progress, or completed';

-- Verify the change
SELECT
  class_status,
  COUNT(*) as count
FROM classes
GROUP BY class_status
ORDER BY class_status;

SELECT 'Successfully added no_status to classes.class_status constraint' as status;
