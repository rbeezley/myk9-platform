-- Remove the old numeric check_in_status column from entries table
-- We now use check_in_status_text (text-based) instead

BEGIN;

-- Drop the numeric check_in_status column if it exists
ALTER TABLE IF EXISTS entries
  DROP COLUMN IF EXISTS check_in_status;

COMMIT;

-- Verify the column was removed
SELECT 'Numeric check_in_status column removed from entries table' as status;
