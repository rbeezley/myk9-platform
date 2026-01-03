-- 044_stats_views_and_indexes.sql
-- Performance indexes and optimized views for Stats feature

-- Add indexes for performance on stats queries
CREATE INDEX IF NOT EXISTS idx_entries_breed_scored
  ON entries(dog_breed, is_scored)
  WHERE is_scored = true;

CREATE INDEX IF NOT EXISTS idx_entries_time_qualified
  ON entries(search_time_seconds)
  WHERE result_status = 'qualified' AND search_time_seconds > 0;

CREATE INDEX IF NOT EXISTS idx_entries_class_scored
  ON entries(class_id, is_scored)
  WHERE is_scored = true;

CREATE INDEX IF NOT EXISTS idx_entries_result_status
  ON entries(result_status, is_scored)
  WHERE is_scored = true;

CREATE INDEX IF NOT EXISTS idx_classes_judge
  ON classes(judge_name);

CREATE INDEX IF NOT EXISTS idx_classes_trial
  ON classes(trial_id);

-- Create optimized view for stats queries
-- This view pre-joins all necessary data for stats calculations
CREATE OR REPLACE VIEW view_stats_summary AS
SELECT
  -- Show info
  s.id as show_id,
  s.show_name,
  s.license_key,

  -- Trial info
  t.id as trial_id,
  t.trial_date,
  t.trial_name,

  -- Class info
  c.id as class_id,
  c.element,
  c.level,
  c.judge_name,

  -- Entry info
  e.id as entry_id,
  e.armband_number,
  e.dog_call_name,
  e.dog_breed,
  e.handler_name,

  -- Scoring results
  e.result_status,
  e.is_scored,
  e.search_time_seconds,
  e.total_faults,
  e.final_placement,
  e.total_score as score,
  e.points_earned as qualifying_score,

  -- Computed fields for convenience
  CASE
    WHEN e.result_status = 'qualified' THEN 1
    ELSE 0
  END as is_qualified,

  CASE
    WHEN e.search_time_seconds > 0 THEN e.search_time_seconds
    ELSE NULL
  END as valid_time

FROM shows s
JOIN trials t ON t.show_id = s.id
JOIN classes c ON c.trial_id = t.id
JOIN entries e ON e.class_id = c.id
WHERE e.is_scored = true;

-- Create index on the view's common filters
CREATE INDEX IF NOT EXISTS idx_stats_summary_license
  ON entries(is_scored)
  WHERE is_scored = true;

-- Create view for breed statistics aggregation
-- Pre-aggregates stats by breed for faster queries
CREATE OR REPLACE VIEW view_breed_stats AS
SELECT
  license_key,
  show_id,
  trial_id,
  class_id,
  dog_breed,
  COUNT(*) as total_entries,
  SUM(CASE WHEN result_status = 'qualified' THEN 1 ELSE 0 END) as qualified_count,
  SUM(CASE WHEN result_status = 'nq' THEN 1 ELSE 0 END) as nq_count,
  SUM(CASE WHEN result_status = 'excused' THEN 1 ELSE 0 END) as excused_count,
  SUM(CASE WHEN result_status = 'absent' THEN 1 ELSE 0 END) as absent_count,
  SUM(CASE WHEN result_status = 'withdrawn' THEN 1 ELSE 0 END) as withdrawn_count,

  -- Calculate qualification rate
  CASE
    WHEN COUNT(*) > 0
    THEN ROUND(100.0 * SUM(CASE WHEN result_status = 'qualified' THEN 1 ELSE 0 END) / COUNT(*), 2)
    ELSE 0
  END as qualification_rate,

  -- Time statistics (only for qualified entries with valid times)
  MIN(CASE WHEN result_status = 'qualified' AND search_time_seconds > 0 THEN search_time_seconds END) as fastest_time,
  AVG(CASE WHEN result_status = 'qualified' AND search_time_seconds > 0 THEN search_time_seconds END) as avg_time,

  -- For median calculation in application layer
  array_agg(
    CASE WHEN result_status = 'qualified' AND search_time_seconds > 0
    THEN search_time_seconds
    END ORDER BY search_time_seconds
  ) FILTER (WHERE result_status = 'qualified' AND search_time_seconds > 0) as qualified_times_array

FROM view_stats_summary
GROUP BY license_key, show_id, trial_id, class_id, dog_breed;

-- Create view for judge statistics aggregation
CREATE OR REPLACE VIEW view_judge_stats AS
SELECT
  license_key,
  show_id,
  trial_id,
  judge_name,
  COUNT(DISTINCT class_id) as classes_judged,
  COUNT(*) as total_entries,
  SUM(CASE WHEN result_status = 'qualified' THEN 1 ELSE 0 END) as qualified_count,

  -- Calculate qualification rate
  CASE
    WHEN COUNT(*) > 0
    THEN ROUND(100.0 * SUM(CASE WHEN result_status = 'qualified' THEN 1 ELSE 0 END) / COUNT(*), 2)
    ELSE 0
  END as qualification_rate,

  -- Average time for qualified entries
  AVG(CASE WHEN result_status = 'qualified' AND search_time_seconds > 0 THEN search_time_seconds END) as avg_qualified_time

FROM view_stats_summary
GROUP BY license_key, show_id, trial_id, judge_name;

-- Create view for clean sweep dogs (100% qualification rate)
-- This identifies dogs that qualified in ALL elements they entered
CREATE OR REPLACE VIEW view_clean_sweep_dogs AS
WITH dog_stats AS (
  SELECT
    license_key,
    show_id,
    trial_id,
    armband_number,
    dog_call_name,
    handler_name,
    dog_breed,
    COUNT(DISTINCT element) as elements_entered,
    COUNT(DISTINCT CASE WHEN result_status = 'qualified' THEN element END) as elements_qualified,
    array_agg(DISTINCT element ORDER BY element) as elements_list
  FROM view_stats_summary
  GROUP BY license_key, show_id, trial_id, armband_number, dog_call_name, handler_name, dog_breed
)
SELECT
  *,
  CASE
    WHEN elements_entered = elements_qualified AND elements_entered > 0
    THEN true
    ELSE false
  END as is_clean_sweep
FROM dog_stats
WHERE elements_entered = elements_qualified
  AND elements_entered > 0;

-- Create view for fastest times with tie handling
CREATE OR REPLACE VIEW view_fastest_times AS
WITH ranked_times AS (
  SELECT
    license_key,
    show_id,
    trial_id,
    class_id,
    entry_id,
    armband_number,
    dog_call_name,
    dog_breed,
    handler_name,
    search_time_seconds,
    element,
    level,
    RANK() OVER (
      PARTITION BY license_key, show_id, trial_id, class_id
      ORDER BY search_time_seconds ASC
    ) as time_rank
  FROM view_stats_summary
  WHERE result_status = 'qualified'
    AND search_time_seconds > 0
)
SELECT *
FROM ranked_times
ORDER BY license_key, show_id, trial_id, class_id, time_rank, search_time_seconds;

-- Grant appropriate permissions
GRANT SELECT ON view_stats_summary TO authenticated;
GRANT SELECT ON view_breed_stats TO authenticated;
GRANT SELECT ON view_judge_stats TO authenticated;
GRANT SELECT ON view_clean_sweep_dogs TO authenticated;
GRANT SELECT ON view_fastest_times TO authenticated;

-- Add comment documentation
COMMENT ON VIEW view_stats_summary IS 'Optimized view for Stats feature - pre-joins all necessary data for statistics calculations';
COMMENT ON VIEW view_breed_stats IS 'Pre-aggregated statistics by breed for faster queries in Stats feature';
COMMENT ON VIEW view_judge_stats IS 'Pre-aggregated statistics by judge for Stats feature';
COMMENT ON VIEW view_clean_sweep_dogs IS 'Dogs with 100% qualification rate across all entered elements';
COMMENT ON VIEW view_fastest_times IS 'Fastest qualifying times with proper tie ranking';