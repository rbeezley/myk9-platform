-- Migration: Add actual_start_time and actual_end_time to trials table
-- Description: Track when first and last dog in trial are scored
-- Created: 2025-11-16

-- Add actual_start_time and actual_end_time columns to trials table
ALTER TABLE trials
ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS actual_end_time TIMESTAMP WITH TIME ZONE;

-- Add index for performance when querying by actual times
CREATE INDEX IF NOT EXISTS idx_trials_actual_start_time ON trials(actual_start_time) WHERE actual_start_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trials_actual_end_time ON trials(actual_end_time) WHERE actual_end_time IS NOT NULL;

-- Create trigger function to update trial actual_start_time when first dog is scored
CREATE OR REPLACE FUNCTION update_trial_actual_start_time()
RETURNS TRIGGER AS $$
DECLARE
  v_trial_id BIGINT;
BEGIN
  -- Only update if entry is being marked as scored (is_scored changes from false to true)
  IF NEW.is_scored = true AND (OLD.is_scored IS NULL OR OLD.is_scored = false) THEN
    -- Get trial_id from the class
    SELECT c.trial_id INTO v_trial_id
    FROM classes c
    WHERE c.id = NEW.class_id;

    -- Check if this is the first scored entry in the entire trial
    IF v_trial_id IS NOT NULL THEN
      UPDATE trials
      SET actual_start_time = NOW()
      WHERE id = v_trial_id
        AND actual_start_time IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function to update trial actual_end_time when last dog is scored
CREATE OR REPLACE FUNCTION update_trial_actual_end_time()
RETURNS TRIGGER AS $$
DECLARE
  v_trial_id BIGINT;
  total_entries INT;
  scored_entries INT;
BEGIN
  -- Only proceed if entry is being marked as scored
  IF NEW.is_scored = true AND (OLD.is_scored IS NULL OR OLD.is_scored = false) THEN
    -- Get trial_id from the class
    SELECT c.trial_id INTO v_trial_id
    FROM classes c
    WHERE c.id = NEW.class_id;

    IF v_trial_id IS NOT NULL THEN
      -- Count total entries and scored entries across ALL classes in the trial
      SELECT COUNT(*) INTO total_entries
      FROM entries e
      INNER JOIN classes c ON e.class_id = c.id
      WHERE c.trial_id = v_trial_id;

      SELECT COUNT(*) INTO scored_entries
      FROM entries e
      INNER JOIN classes c ON e.class_id = c.id
      WHERE c.trial_id = v_trial_id
        AND e.is_scored = true;

      -- If all entries in the trial are now scored, update actual_end_time
      IF scored_entries >= total_entries THEN
        UPDATE trials
        SET actual_end_time = NOW()
        WHERE id = v_trial_id
          AND actual_end_time IS NULL;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_update_trial_actual_start_time ON entries;
DROP TRIGGER IF EXISTS trigger_update_trial_actual_end_time ON entries;

-- Create trigger on entries table to update trial actual_start_time
CREATE TRIGGER trigger_update_trial_actual_start_time
AFTER UPDATE ON entries
FOR EACH ROW
EXECUTE FUNCTION update_trial_actual_start_time();

-- Create trigger on entries table to update trial actual_end_time
CREATE TRIGGER trigger_update_trial_actual_end_time
AFTER UPDATE ON entries
FOR EACH ROW
EXECUTE FUNCTION update_trial_actual_end_time();

-- Add comments for documentation
COMMENT ON COLUMN trials.actual_start_time IS 'Timestamp when first dog in trial was scored';
COMMENT ON COLUMN trials.actual_end_time IS 'Timestamp when last dog in trial was scored';
COMMENT ON FUNCTION update_trial_actual_start_time() IS 'Updates trial actual_start_time when first entry is scored';
COMMENT ON FUNCTION update_trial_actual_end_time() IS 'Updates trial actual_end_time when all entries are scored';
