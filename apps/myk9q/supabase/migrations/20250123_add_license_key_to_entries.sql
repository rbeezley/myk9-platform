-- Migration: Add license_key to entries table for efficient real-time subscription filtering
-- Date: 2025-01-23
-- Purpose: Enable Supabase real-time subscriptions to filter by license_key without joins
-- Impact: Improves real-time update performance by avoiding cross-show event notifications

-- Step 1: Add license_key column to entries table
ALTER TABLE entries ADD COLUMN license_key VARCHAR(50);

-- Step 2: Create index for query performance (critical for real-time subscriptions)
CREATE INDEX idx_entries_license_key ON entries(license_key);

-- Step 3: Backfill existing entries with license_key from their associated show
UPDATE entries e
SET license_key = s.license_key
FROM classes c
JOIN trials t ON c.trial_id = t.id
JOIN shows s ON t.show_id = s.id
WHERE e.class_id = c.id;

-- Step 4: Create function to automatically populate license_key on INSERT or UPDATE
CREATE OR REPLACE FUNCTION set_entry_license_key()
RETURNS TRIGGER AS $$
BEGIN
  -- Lookup license_key from the class's show
  SELECT s.license_key INTO NEW.license_key
  FROM classes c
  JOIN trials t ON c.trial_id = t.id
  JOIN shows s ON t.show_id = s.id
  WHERE c.id = NEW.class_id;

  -- If lookup failed, raise an error (entry must belong to a valid class)
  IF NEW.license_key IS NULL THEN
    RAISE EXCEPTION 'Cannot determine license_key for entry with class_id=%', NEW.class_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger to call the function before INSERT or UPDATE
CREATE TRIGGER entry_license_key_trigger
BEFORE INSERT OR UPDATE ON entries
FOR EACH ROW
EXECUTE FUNCTION set_entry_license_key();

-- Step 6: Add comment explaining the denormalization
COMMENT ON COLUMN entries.license_key IS 'Denormalized from shows.license_key via classes->trials->shows join. Auto-populated by trigger for efficient real-time subscription filtering.';

-- Verification query (run this after migration to check it worked)
-- SELECT COUNT(*) as total_entries, COUNT(license_key) as entries_with_key FROM entries;
-- Expected: Both counts should be equal
