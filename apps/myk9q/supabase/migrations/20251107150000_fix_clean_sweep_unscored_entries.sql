-- Fix Clean Sweep Dogs view to calculate at SHOW level (not trial level)
-- A dog should only appear in clean sweep if:
-- 1. All their show entries have been scored (is_scored = true)
-- 2. ALL scored entries across ALL trials in the show are qualified

-- Drop existing view first (cannot change column type with CREATE OR REPLACE)
DROP VIEW IF EXISTS view_clean_sweep_dogs;

-- Recreate with correct structure
CREATE VIEW view_clean_sweep_dogs AS
WITH all_show_entries AS (
  -- Get count of ALL entries per dog in the ENTIRE show (across all trials)
  SELECT
    s.license_key,
    s.id as show_id,
    e.armband_number,
    e.dog_call_name,
    e.handler_name,
    e.dog_breed,
    COUNT(*) as total_entries_count,  -- Count all individual entries
    COUNT(DISTINCT c.element) as total_unique_elements
  FROM shows s
  JOIN trials t ON t.show_id = s.id
  JOIN classes c ON c.trial_id = t.id
  JOIN entries e ON e.class_id = c.id
  GROUP BY s.license_key, s.id, e.armband_number, e.dog_call_name, e.handler_name, e.dog_breed
),
scored_entries AS (
  -- Get count of scored and qualified entries across ALL trials
  SELECT
    license_key,
    show_id,
    armband_number,
    dog_call_name,
    handler_name,
    dog_breed,
    COUNT(*) as scored_entries_count,
    COUNT(DISTINCT element) as unique_elements_scored,
    COUNT(DISTINCT CASE WHEN result_status = 'qualified' THEN element END) as unique_elements_qualified,
    -- Get list of all elements (qualified or not)
    array_agg(DISTINCT element ORDER BY element) as elements_list,
    -- Also track if ANY entries are NQ/excused/absent
    bool_or(result_status IN ('nq', 'excused', 'absent', 'withdrawn')) as has_non_qualified
  FROM view_stats_summary
  GROUP BY license_key, show_id, armband_number, dog_call_name, handler_name, dog_breed
)
SELECT
  ae.license_key,
  ae.show_id,
  NULL::uuid as trial_id,  -- Clean sweep is show-level, not trial-level
  ae.armband_number,
  ae.dog_call_name,
  ae.handler_name,
  ae.dog_breed,
  se.unique_elements_scored as elements_entered,
  se.unique_elements_qualified as elements_qualified,
  se.elements_list,
  CASE
    -- Clean sweep only if:
    -- 1. All entries are scored (total count = scored count)
    -- 2. All unique elements are qualified
    -- 3. No entries have non-qualified status
    WHEN ae.total_entries_count = se.scored_entries_count
      AND se.unique_elements_scored = se.unique_elements_qualified
      AND NOT se.has_non_qualified
      AND ae.total_entries_count > 0
    THEN true
    ELSE false
  END as is_clean_sweep
FROM all_show_entries ae
JOIN scored_entries se ON
  ae.license_key = se.license_key
  AND ae.show_id = se.show_id
  AND ae.armband_number = se.armband_number
WHERE ae.total_entries_count = se.scored_entries_count  -- All entries must be scored
  AND se.unique_elements_scored = se.unique_elements_qualified  -- All unique elements qualified
  AND NOT se.has_non_qualified  -- No NQ/excused/absent entries
  AND ae.total_entries_count > 0;

-- Add comment explaining the logic
COMMENT ON VIEW view_clean_sweep_dogs IS 'Dogs with 100% qualification rate across ALL entered elements in the ENTIRE SHOW (across all trials). Only includes dogs where all entries have been scored and all are qualified.';
