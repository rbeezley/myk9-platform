-- Migration: Remove deprecated boolean columns after enum migration is confirmed working
-- Author: supabase-specialist
-- Date: 2025-09-15
-- Description: Remove auto_release_results and results_released columns after enum migration
-- WARNING: Only run this after confirming the enum migration is working properly!

BEGIN;

-- Verify that the new enum column exists and has data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tbl_class_queue' AND column_name = 'release_mode'
  ) THEN
    RAISE EXCEPTION 'release_mode column not found. Run migration 004 first.';
  END IF;

  -- Check that we have data in the new column
  IF NOT EXISTS (
    SELECT 1 FROM tbl_class_queue WHERE release_mode IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'release_mode column has no data. Migration may have failed.';
  END IF;
END $$;

-- Drop the old boolean columns
ALTER TABLE tbl_class_queue
DROP COLUMN IF EXISTS auto_release_results,
DROP COLUMN IF EXISTS results_released;

-- Update any views or functions that might reference the old columns
-- Note: We already updated the functions in migration 004, so this is just a safety check

COMMIT;

-- Verification
SELECT 'Old boolean columns removed successfully' as status;

-- Show current schema
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'tbl_class_queue'
  AND column_name LIKE '%release%'
ORDER BY column_name;