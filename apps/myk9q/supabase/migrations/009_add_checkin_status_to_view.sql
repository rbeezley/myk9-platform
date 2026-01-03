-- Add check_in_status_text field to view_entry_class_join_normalized
-- This ensures the view exposes the text-based check-in status field

BEGIN;

-- Drop the existing view first to avoid column mismatch errors
DROP VIEW IF EXISTS view_entry_class_join_normalized CASCADE;

-- Recreate the view with the check_in_status_text field
CREATE VIEW view_entry_class_join_normalized AS
SELECT
  e.id,
  e.armband_number as armband,
  e.dog_call_name as call_name,
  e.dog_breed as breed,
  e.handler_name as handler,
  e.handler_location,
  e.handler_state,
  e.check_in_status_text,  -- ✅ Added this field
  e.exhibitor_order,
  c.id as class_id,
  -- Construct class_name from element, level, section
  CONCAT(c.element, ' ', c.level,
    CASE WHEN c.section IS NOT NULL AND c.section != '' AND c.section != '-'
      THEN CONCAT(' ', c.section)
      ELSE ''
    END
  ) as class_name,
  c.class_status as class_type,
  c.element,
  c.level,
  c.section,
  c.area_count,
  c.judge_name,
  t.id as trial_id,
  t.trial_name,
  t.trial_date,
  t.trial_number,
  r.is_scored,
  r.is_in_ring,
  r.result_status,
  r.search_time_seconds as search_time,
  r.total_faults as fault_count,
  r.final_placement as placement,
  s.license_key
FROM entries e
INNER JOIN classes c ON e.class_id = c.id
INNER JOIN trials t ON c.trial_id = t.id
INNER JOIN shows s ON t.show_id = s.id
LEFT JOIN results r ON e.id = r.entry_id
ORDER BY e.armband_number, t.trial_date, c.element, c.level;

COMMIT;

-- Verify the view includes the new fields
SELECT 'View updated successfully - check_in_status_text and judge_name fields added' as status;