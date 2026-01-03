-- Modify Clean Sweep to ignore unscored entries
-- A dog should appear in clean sweep if:
-- 1. They have at least one scored entry
-- 2. ALL scored entries are qualified (100% qualification rate)
-- 3. Unscored entries are ignored (not counted against them)

-- Drop existing view first
DROP VIEW IF EXISTS view_clean_sweep_dogs;

-- Recreate with relaxed scoring requirement
CREATE VIEW view_clean_sweep_dogs AS
WITH scored_entries_only AS (
  -- Only look at SCORED entries (ignore unscored)
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
    array_agg(DISTINCT element ORDER BY element) as elements_list,
    -- Check if ANY scored entries are NQ/excused/absent/withdrawn
    bool_or(result_status IN ('nq', 'excused', 'absent', 'withdrawn')) as has_non_qualified
  FROM view_stats_summary
  WHERE is_scored = true  -- Only consider scored entries
  GROUP BY license_key, show_id, armband_number, dog_call_name, handler_name, dog_breed
)
SELECT
  license_key,
  show_id,
  NULL::uuid as trial_id,  -- Clean sweep is show-level, not trial-level
  armband_number,
  dog_call_name,
  handler_name,
  dog_breed,
  unique_elements_scored as elements_entered,
  unique_elements_qualified as elements_qualified,
  elements_list,
  CASE
    -- Clean sweep if:
    -- 1. At least one scored entry exists
    -- 2. All unique elements scored are also qualified
    -- 3. No NQ/excused/absent/withdrawn entries
    WHEN scored_entries_count > 0
      AND unique_elements_scored = unique_elements_qualified
      AND NOT has_non_qualified
    THEN true
    ELSE false
  END as is_clean_sweep
FROM scored_entries_only
WHERE scored_entries_count > 0  -- Must have at least one scored entry
  AND unique_elements_scored = unique_elements_qualified  -- All elements qualified
  AND NOT has_non_qualified;  -- No NQ/excused/absent/withdrawn

-- Update comment to reflect new logic
COMMENT ON VIEW view_clean_sweep_dogs IS 'Dogs with 100% qualification rate across ALL SCORED entries in the ENTIRE SHOW (across all trials). Unscored entries are ignored. Only includes dogs where all scored entries are qualified.';
