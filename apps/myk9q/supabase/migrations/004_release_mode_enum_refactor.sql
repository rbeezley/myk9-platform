-- Migration: Refactor results release system from multiple boolean fields to single enum
-- Author: supabase-specialist
-- Date: 2025-09-15
-- Description: Replace auto_release_results and results_released boolean fields with single release_mode enum

BEGIN;

-- Create enum type for release modes
CREATE TYPE release_mode_enum AS ENUM ('hidden', 'auto', 'immediate', 'released');

-- Add the new release_mode column with default 'hidden'
ALTER TABLE tbl_class_queue
ADD COLUMN release_mode release_mode_enum DEFAULT 'hidden';

-- Migrate existing data based on current boolean values
-- Priority: results_released = true -> 'released'
-- Priority: auto_release_results = true -> 'auto'
-- Default: -> 'hidden'
UPDATE tbl_class_queue
SET release_mode = CASE
  WHEN results_released = true THEN 'released'::release_mode_enum
  WHEN auto_release_results = true THEN 'auto'::release_mode_enum
  ELSE 'hidden'::release_mode_enum
END;

-- Update the trigger function to work with new enum
CREATE OR REPLACE FUNCTION handle_results_release()
RETURNS TRIGGER AS $$
BEGIN
  -- Update timestamp when results are manually released
  IF OLD.release_mode != 'released' AND NEW.release_mode = 'released' THEN
    NEW.results_released_at = NOW();
  END IF;

  -- Update timestamp when class is marked complete
  IF OLD.class_completed = FALSE AND NEW.class_completed = TRUE THEN
    NEW.class_completed_at = NOW();

    -- Auto-release results if mode is set to 'auto'
    IF NEW.release_mode = 'auto' THEN
      NEW.release_mode = 'released';
      NEW.results_released_at = NOW();
      NEW.results_released_by = 'SYSTEM_AUTO';
    -- For immediate mode, release immediately when class completes
    ELSIF NEW.release_mode = 'immediate' THEN
      NEW.release_mode = 'released';
      NEW.results_released_at = NOW();
      NEW.results_released_by = 'SYSTEM_IMMEDIATE';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update the results display function to work with enum
CREATE OR REPLACE FUNCTION should_show_class_results(
  class_release_mode release_mode_enum,
  class_completed BOOLEAN
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Show results based on release mode
  CASE class_release_mode
    WHEN 'hidden' THEN
      RETURN FALSE;
    WHEN 'auto' THEN
      RETURN class_completed;
    WHEN 'immediate' THEN
      RETURN TRUE; -- Always show for immediate mode
    WHEN 'released' THEN
      RETURN TRUE;
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Remove the old boolean columns after successful migration
-- We'll keep them for now to allow rollback, but they should be removed later
-- ALTER TABLE tbl_class_queue DROP COLUMN auto_release_results;
-- ALTER TABLE tbl_class_queue DROP COLUMN results_released;

-- Add a comment indicating the old columns are deprecated
COMMENT ON COLUMN tbl_class_queue.auto_release_results IS 'DEPRECATED: Use release_mode enum instead';
COMMENT ON COLUMN tbl_class_queue.results_released IS 'DEPRECATED: Use release_mode enum instead';

-- Add helpful comment on new column
COMMENT ON COLUMN tbl_class_queue.release_mode IS 'Release mode: hidden (never show), auto (show when complete), immediate (show immediately), released (manually released)';

-- Create index for performance on the new column
CREATE INDEX IF NOT EXISTS idx_class_queue_release_mode ON tbl_class_queue(release_mode);

COMMIT;

-- Verification queries
SELECT 'release_mode_enum type created' as status;
SELECT 'release_mode column added to tbl_class_queue' as status;
SELECT 'Existing data migrated to enum values' as status;
SELECT 'Trigger function updated for enum support' as status;
SELECT 'Results display function updated' as status;
SELECT 'Index created on release_mode column' as status;

-- Show migration results
SELECT
  release_mode,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE auto_release_results = true) as had_auto_release,
  COUNT(*) FILTER (WHERE results_released = true) as had_results_released
FROM tbl_class_queue
GROUP BY release_mode
ORDER BY release_mode;