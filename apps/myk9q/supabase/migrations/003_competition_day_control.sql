-- Migration: Add per-class results release control to tbl_class_queue
-- This allows flexible control: automatic for regular shows, manual for special events like Nationals

-- Add results release fields to existing tbl_class_queue table
ALTER TABLE tbl_class_queue
ADD COLUMN IF NOT EXISTS results_released BOOLEAN DEFAULT NULL,  -- NULL = auto-release, TRUE/FALSE = manual control
ADD COLUMN IF NOT EXISTS results_released_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS results_released_by VARCHAR(100),
ADD COLUMN IF NOT EXISTS auto_release_results BOOLEAN DEFAULT TRUE,  -- TRUE = release when class completes, FALSE = manual only
ADD COLUMN IF NOT EXISTS class_completed BOOLEAN DEFAULT FALSE,      -- TRUE when all dogs in class have finished
ADD COLUMN IF NOT EXISTS class_completed_at TIMESTAMPTZ;

-- Set Nationals classes to manual control (auto_release_results = FALSE)
UPDATE tbl_class_queue
SET auto_release_results = FALSE,
    results_released = FALSE
WHERE mobile_app_lic_key = 'myK9Q1-d8609f3b-d3fd43aa-6323a604';

-- Set regular shows to automatic release (auto_release_results = TRUE, results_released = NULL)
UPDATE tbl_class_queue
SET auto_release_results = TRUE,
    results_released = NULL
WHERE mobile_app_lic_key != 'myK9Q1-d8609f3b-d3fd43aa-6323a604';

-- Create function to handle results release logic
CREATE OR REPLACE FUNCTION handle_results_release()
RETURNS TRIGGER AS $$
BEGIN
  -- Update timestamp when results are manually released
  IF OLD.results_released = FALSE AND NEW.results_released = TRUE THEN
    NEW.results_released_at = NOW();
  END IF;

  -- Update timestamp when class is marked complete
  IF OLD.class_completed = FALSE AND NEW.class_completed = TRUE THEN
    NEW.class_completed_at = NOW();

    -- Auto-release results if enabled for this class
    IF NEW.auto_release_results = TRUE THEN
      NEW.results_released = TRUE;
      NEW.results_released_at = NOW();
      NEW.results_released_by = 'SYSTEM_AUTO';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic results release
CREATE TRIGGER trigger_handle_results_release
  BEFORE UPDATE ON tbl_class_queue
  FOR EACH ROW
  EXECUTE FUNCTION handle_results_release();

-- Function to determine if results should be shown for a class
CREATE OR REPLACE FUNCTION should_show_class_results(
  class_auto_release BOOLEAN,
  class_results_released BOOLEAN,
  class_completed BOOLEAN
)
RETURNS BOOLEAN AS $$
BEGIN
  -- If auto-release is enabled, show results when class is completed
  IF class_auto_release = TRUE THEN
    RETURN class_completed;
  END IF;

  -- If manual control, show results only when explicitly released
  RETURN class_results_released = TRUE;
END;
$$ LANGUAGE plpgsql;

SELECT 'Per-class results release control added to tbl_class_queue successfully' as status;