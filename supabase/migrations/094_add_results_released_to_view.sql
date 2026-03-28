-- Migration 094: Add results_released_at to view_entry_with_results
-- Needed for manual_release visibility timing in the results control feature.

CREATE OR REPLACE VIEW view_entry_with_results AS
SELECT
  e.*,
  CASE
    WHEN e.is_scored = TRUE AND e.result_status = 'qualified' THEN 'Q'
    WHEN e.is_scored = TRUE AND e.result_status = 'nq' THEN 'NQ'
    WHEN e.is_scored = TRUE AND e.result_status = 'absent' THEN 'ABS'
    WHEN e.is_scored = TRUE AND e.result_status = 'excused' THEN 'EX'
    WHEN e.is_scored = TRUE AND e.result_status = 'withdrawn' THEN 'WD'
    ELSE 'pending'
  END as result_text,
  d.name as dog_name,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  c.name as class_name,
  c.level as class_level,
  c.element as class_element,
  c.results_released_at as class_results_released_at
FROM entries e
LEFT JOIN dogs d ON e.dog_id = d.id
LEFT JOIN classes c ON e.class_id = c.id;
