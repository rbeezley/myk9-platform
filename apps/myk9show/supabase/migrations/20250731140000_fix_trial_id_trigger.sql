-- Fix the trial_id trigger function to handle UUID properly
-- The issue is checking for empty string on a UUID field

BEGIN;

-- Drop the existing trigger
DROP TRIGGER IF EXISTS trigger_set_class_entry_trial_id ON class_entry;

-- Create a corrected function that only checks for NULL, not empty string
CREATE OR REPLACE FUNCTION set_class_entry_trial_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-populate trial_id from class if not provided (only check NULL for UUID)
  IF NEW.trial_id IS NULL THEN
    SELECT trial_id INTO NEW.trial_id
    FROM class
    WHERE id = NEW.class_id;
  END IF;
  
  -- Set updated_at
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER trigger_set_class_entry_trial_id
  BEFORE INSERT OR UPDATE ON class_entry
  FOR EACH ROW
  EXECUTE FUNCTION set_class_entry_trial_id();

COMMIT;

-- Test the fix
SELECT 'Trigger function updated successfully' as status;