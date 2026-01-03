-- Migration: Add actual_start_time and actual_end_time to classes table
-- Description: Track when first and last dog in class are scored
-- Created: 2025-11-16

-- Add actual_start_time and actual_end_time columns to classes table
ALTER TABLE classes
ADD COLUMN actual_start_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN actual_end_time TIMESTAMP WITH TIME ZONE;

-- Add index for performance when querying by actual times
CREATE INDEX idx_classes_actual_start_time ON classes(actual_start_time) WHERE actual_start_time IS NOT NULL;
CREATE INDEX idx_classes_actual_end_time ON classes(actual_end_time) WHERE actual_end_time IS NOT NULL;

-- Create trigger function to update actual_start_time when first dog is scored
CREATE OR REPLACE FUNCTION update_class_actual_start_time()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if entry is being marked as scored (is_scored changes from false to true)
  IF NEW.is_scored = true AND (OLD.is_scored IS NULL OR OLD.is_scored = false) THEN
    -- Check if this is the first scored entry in the class
    UPDATE classes
    SET actual_start_time = NOW()
    WHERE id = NEW.class_id
      AND actual_start_time IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function to update actual_end_time when last dog is scored
CREATE OR REPLACE FUNCTION update_class_actual_end_time()
RETURNS TRIGGER AS $$
DECLARE
  total_entries INT;
  scored_entries INT;
BEGIN
  -- Only proceed if entry is being marked as scored
  IF NEW.is_scored = true AND (OLD.is_scored IS NULL OR OLD.is_scored = false) THEN
    -- Count total entries and scored entries in the class
    SELECT COUNT(*) INTO total_entries
    FROM entries
    WHERE class_id = NEW.class_id;

    SELECT COUNT(*) INTO scored_entries
    FROM entries
    WHERE class_id = NEW.class_id
      AND is_scored = true;

    -- If all entries are now scored, update actual_end_time
    IF scored_entries >= total_entries THEN
      UPDATE classes
      SET actual_end_time = NOW()
      WHERE id = NEW.class_id
        AND actual_end_time IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on entries table to update actual_start_time
CREATE TRIGGER trigger_update_class_actual_start_time
AFTER UPDATE ON entries
FOR EACH ROW
EXECUTE FUNCTION update_class_actual_start_time();

-- Create trigger on entries table to update actual_end_time
CREATE TRIGGER trigger_update_class_actual_end_time
AFTER UPDATE ON entries
FOR EACH ROW
EXECUTE FUNCTION update_class_actual_end_time();

-- Add comments for documentation
COMMENT ON COLUMN classes.actual_start_time IS 'Timestamp when first dog in class was scored';
COMMENT ON COLUMN classes.actual_end_time IS 'Timestamp when last dog in class was scored';
COMMENT ON FUNCTION update_class_actual_start_time() IS 'Updates actual_start_time when first entry is scored';
COMMENT ON FUNCTION update_class_actual_end_time() IS 'Updates actual_end_time when all entries are scored';
