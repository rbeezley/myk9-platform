-- Migration: Consolidate entry status into single field
-- This replaces check_in_status_text and is_in_ring with a single entry_status field

-- Step 1: Add new entry_status column
ALTER TABLE entries
ADD COLUMN entry_status TEXT DEFAULT 'none';

-- Step 2: Create index for performance
CREATE INDEX idx_entries_entry_status ON entries(entry_status);

-- Step 3: Migrate existing data
-- Priority: is_in_ring > check_in_status_text
UPDATE entries
SET entry_status =
  CASE
    -- Check if entry is in-ring (from results table)
    WHEN EXISTS (
      SELECT 1 FROM results
      WHERE results.entry_id = entries.id
        AND results.is_in_ring = true
        AND (results.is_scored = false OR results.is_scored IS NULL)
    ) THEN 'in-ring'

    -- Otherwise use check-in status
    WHEN check_in_status_text = 'checked-in' THEN 'checked-in'
    WHEN check_in_status_text = 'at-gate' THEN 'at-gate'
    WHEN check_in_status_text = 'come-to-gate' THEN 'come-to-gate'
    WHEN check_in_status_text = 'conflict' THEN 'conflict'
    WHEN check_in_status_text = 'pulled' THEN 'pulled'
    WHEN check_in_status_text = 'none' THEN 'none'

    -- Default to 'none' for any NULL or unrecognized values
    ELSE 'none'
  END;

-- Step 4: Add constraint to ensure valid values
ALTER TABLE entries
ADD CONSTRAINT entries_entry_status_check
CHECK (entry_status IN (
  'none',
  'checked-in',
  'at-gate',
  'come-to-gate',
  'conflict',
  'pulled',
  'in-ring',
  'completed'
));

-- Step 5: Make entry_status NOT NULL now that data is migrated
ALTER TABLE entries
ALTER COLUMN entry_status SET NOT NULL;

-- Step 6: Drop old check_in_status_text column (after verification)
-- UNCOMMENT AFTER VERIFYING MIGRATION:
-- ALTER TABLE entries DROP COLUMN check_in_status_text;

-- Step 7: Add comment for documentation
COMMENT ON COLUMN entries.entry_status IS
'Single source of truth for entry status. Values: none, checked-in, at-gate, come-to-gate, conflict, pulled, in-ring, completed. Scored status comes from results.is_scored.';

-- Step 8: Update the view to use new field
DROP VIEW IF EXISTS view_entry_class_join_normalized;

CREATE VIEW view_entry_class_join_normalized AS
SELECT
  e.id,
  e.armband_number,
  e.dog_call_name,
  e.dog_breed,
  e.handler_name,
  e.entry_status,  -- New field instead of check_in_status_text
  e.run_order,
  e.exhibitor_order,
  e.created_at,
  e.updated_at,
  c.id AS class_id,
  c.element,
  c.level,
  c.judge_name,
  c.section,
  c.class_status,
  c.self_checkin_enabled,
  c.time_limit_seconds,
  c.time_limit_area2_seconds,
  c.time_limit_area3_seconds,
  c.area_count,
  t.id AS trial_id,
  t.trial_number,
  t.trial_date,
  s.id AS show_id,
  s.license_key,
  s.show_name,
  r.id AS result_id,
  r.is_scored,
  r.is_in_ring,
  r.result_status,
  r.search_time_seconds,
  r.total_faults,
  r.final_placement,
  r.total_correct_finds,
  r.total_incorrect_finds,
  r.no_finish_count,
  r.points_earned,
  r.scoring_completed_at
FROM entries e
LEFT JOIN classes c ON e.class_id = c.id
LEFT JOIN trials t ON c.trial_id = t.id
LEFT JOIN shows s ON t.show_id = s.id
LEFT JOIN results r ON e.id = r.entry_id;

-- Grant permissions
GRANT SELECT ON view_entry_class_join_normalized TO anon, authenticated;
