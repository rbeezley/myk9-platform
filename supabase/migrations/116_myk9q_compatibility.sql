-- =============================================================================
-- Migration 116: myK9Q Compatibility
-- =============================================================================
-- Adds missing columns, expands constraints, and creates compatibility views
-- to allow myK9Q (ringside app) to run against the unified platform database.
--
-- Reference: docs/plan-myk9q-db-alignment.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Section 1: Add missing columns to `classes`
-- ---------------------------------------------------------------------------

ALTER TABLE classes ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS judge_name TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS time_limit_area2_seconds INTEGER;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS time_limit_area3_seconds INTEGER;

-- ---------------------------------------------------------------------------
-- Section 2: Add missing columns to `sport_class_rules`
-- ---------------------------------------------------------------------------

ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS has_30_second_warning BOOLEAN DEFAULT TRUE;
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS time_type TEXT DEFAULT 'fixed'
  CHECK (time_type IN ('fixed', 'range', 'dictated'));
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS warning_notes TEXT;
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS max_time_seconds_area2 INTEGER;
ALTER TABLE sport_class_rules ADD COLUMN IF NOT EXISTS max_time_seconds_area3 INTEGER;

-- ---------------------------------------------------------------------------
-- Section 2b: Expand entry_status CHECK constraint for myK9Q values
-- ---------------------------------------------------------------------------

ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_entry_status_check;
ALTER TABLE entries ADD CONSTRAINT entries_entry_status_check CHECK (entry_status IN (
  'no-status', 'draft', 'submitted', 'paid', 'confirmed',
  'checked-in', 'at-gate', 'in-ring', 'competing', 'completed',
  'withdrawn', 'scratched', 'absent'
));

-- ---------------------------------------------------------------------------
-- Section 3: Create `view_myk9q_entries` view
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW view_myk9q_entries AS
SELECT
  e.id,
  e.armband::INTEGER as armband,
  e.handler as handler,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  e.entry_status,
  e.run_order as run_order,
  e.created_at,
  e.updated_at,
  e.is_scored,
  e.is_in_ring,
  e.result_status,
  e.search_time_seconds,
  e.total_faults,
  e.final_placement,
  e.total_correct_finds,
  e.total_incorrect_finds,
  e.no_finish_count,
  e.points_earned,
  e.scoring_completed_at,
  c.id AS class_id,
  c.element,
  c.level,
  c.judge_name,
  c.section,
  c.status AS class_status,
  c.time_limit_seconds,
  c.time_limit_area2_seconds,
  c.time_limit_area3_seconds,
  c.num_areas AS area_count,
  c.is_scoring_finalized,
  c.results_released_at,
  t.id AS trial_id,
  t.trial_number,
  t.date AS trial_date,
  s.id AS show_id,
  s.license_key,
  s.name AS show_name
FROM entries e
LEFT JOIN dogs d ON e.dog_id = d.id
LEFT JOIN classes c ON e.class_id = c.id
LEFT JOIN trials t ON e.trial_id = t.id
LEFT JOIN shows s ON e.show_id = s.id;

GRANT SELECT ON view_myk9q_entries TO anon, authenticated;
COMMENT ON VIEW view_myk9q_entries IS 'Pre-joined entry view for myK9Q. Aliases platform columns to myK9Q interface names.';

-- ---------------------------------------------------------------------------
-- Section 4: Stats views (adapted from legacy myK9Q migration 044)
-- ---------------------------------------------------------------------------

-- 4a. view_stats_summary
CREATE OR REPLACE VIEW view_stats_summary AS
SELECT
  s.id as show_id,
  s.name as show_name,
  s.license_key,
  t.id as trial_id,
  t.date as trial_date,
  t.name as trial_name,
  c.id as class_id,
  c.element,
  c.level,
  c.judge_name,
  e.id as entry_id,
  e.armband::INTEGER as armband_number,
  d.call_name as dog_call_name,
  d.breed as dog_breed,
  e.handler as handler_name,
  e.result_status,
  e.is_scored,
  e.search_time_seconds,
  e.total_faults,
  e.final_placement,
  e.total_score as score,
  e.points_earned as qualifying_score,
  CASE WHEN e.result_status = 'qualified' THEN 1 ELSE 0 END as is_qualified,
  CASE WHEN e.search_time_seconds > 0 THEN e.search_time_seconds ELSE NULL END as valid_time
FROM shows s
JOIN trials t ON t.show_id = s.id
JOIN classes c ON c.trial_id = t.id
JOIN entries e ON e.class_id = c.id
LEFT JOIN dogs d ON e.dog_id = d.id
WHERE e.is_scored = true;

GRANT SELECT ON view_stats_summary TO authenticated;
COMMENT ON VIEW view_stats_summary IS 'Flattened scored entries with show/trial/class context for stats aggregation.';

-- 4b. view_breed_stats
CREATE OR REPLACE VIEW view_breed_stats AS
SELECT
  license_key, show_id, trial_id, class_id, dog_breed,
  COUNT(*) as total_entries,
  SUM(CASE WHEN result_status = 'qualified' THEN 1 ELSE 0 END) as qualified_count,
  SUM(CASE WHEN result_status = 'nq' THEN 1 ELSE 0 END) as nq_count,
  SUM(CASE WHEN result_status = 'excused' THEN 1 ELSE 0 END) as excused_count,
  SUM(CASE WHEN result_status = 'absent' THEN 1 ELSE 0 END) as absent_count,
  SUM(CASE WHEN result_status = 'withdrawn' THEN 1 ELSE 0 END) as withdrawn_count,
  CASE
    WHEN COUNT(*) > 0
    THEN ROUND(100.0 * SUM(CASE WHEN result_status = 'qualified' THEN 1 ELSE 0 END) / COUNT(*), 2)
    ELSE 0
  END as qualification_rate,
  MIN(CASE WHEN result_status = 'qualified' AND search_time_seconds > 0 THEN search_time_seconds END) as fastest_time,
  AVG(CASE WHEN result_status = 'qualified' AND search_time_seconds > 0 THEN search_time_seconds END) as avg_time,
  array_agg(
    CASE WHEN result_status = 'qualified' AND search_time_seconds > 0 THEN search_time_seconds END
    ORDER BY search_time_seconds
  ) FILTER (WHERE result_status = 'qualified' AND search_time_seconds > 0) as qualified_times_array
FROM view_stats_summary
GROUP BY license_key, show_id, trial_id, class_id, dog_breed;

GRANT SELECT ON view_breed_stats TO authenticated;
COMMENT ON VIEW view_breed_stats IS 'Qualification and time statistics grouped by breed, class, and trial.';

-- 4c. view_judge_stats
CREATE OR REPLACE VIEW view_judge_stats AS
SELECT
  license_key, show_id, trial_id, judge_name,
  COUNT(DISTINCT class_id) as classes_judged,
  COUNT(*) as total_entries,
  SUM(CASE WHEN result_status = 'qualified' THEN 1 ELSE 0 END) as qualified_count,
  CASE
    WHEN COUNT(*) > 0
    THEN ROUND(100.0 * SUM(CASE WHEN result_status = 'qualified' THEN 1 ELSE 0 END) / COUNT(*), 2)
    ELSE 0
  END as qualification_rate,
  AVG(CASE WHEN result_status = 'qualified' AND search_time_seconds > 0 THEN search_time_seconds END) as avg_qualified_time
FROM view_stats_summary
GROUP BY license_key, show_id, trial_id, judge_name;

GRANT SELECT ON view_judge_stats TO authenticated;
COMMENT ON VIEW view_judge_stats IS 'Qualification rates and average times grouped by judge, trial, and show.';

-- 4d. view_clean_sweep_dogs
CREATE OR REPLACE VIEW view_clean_sweep_dogs AS
WITH dog_stats AS (
  SELECT
    license_key, show_id, trial_id,
    armband_number, dog_call_name, handler_name, dog_breed,
    COUNT(DISTINCT element) as elements_entered,
    COUNT(DISTINCT CASE WHEN result_status = 'qualified' THEN element END) as elements_qualified,
    array_agg(DISTINCT element ORDER BY element) as elements_list
  FROM view_stats_summary
  GROUP BY license_key, show_id, trial_id, armband_number, dog_call_name, handler_name, dog_breed
)
SELECT *,
  CASE WHEN elements_entered = elements_qualified AND elements_entered > 0 THEN true ELSE false END as is_clean_sweep
FROM dog_stats
WHERE elements_entered = elements_qualified AND elements_entered > 0;

GRANT SELECT ON view_clean_sweep_dogs TO authenticated;
COMMENT ON VIEW view_clean_sweep_dogs IS 'Dogs that qualified in every element they entered within a trial (clean sweep).';

-- 4e. view_fastest_times
CREATE OR REPLACE VIEW view_fastest_times AS
WITH ranked_times AS (
  SELECT
    license_key, show_id, trial_id, class_id, entry_id,
    armband_number, dog_call_name, dog_breed, handler_name,
    search_time_seconds, element, level,
    RANK() OVER (
      PARTITION BY license_key, show_id, trial_id, class_id
      ORDER BY search_time_seconds ASC
    ) as time_rank
  FROM view_stats_summary
  WHERE result_status = 'qualified' AND search_time_seconds > 0
)
SELECT * FROM ranked_times
ORDER BY license_key, show_id, trial_id, class_id, time_rank, search_time_seconds;

GRANT SELECT ON view_fastest_times TO authenticated;
COMMENT ON VIEW view_fastest_times IS 'Qualified times ranked fastest-to-slowest within each class and trial.';

-- ---------------------------------------------------------------------------
-- Section 5: Performance indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_entries_breed_scored
  ON entries(dog_id, is_scored) WHERE is_scored = true;
CREATE INDEX IF NOT EXISTS idx_entries_time_qualified
  ON entries(search_time_seconds)
  WHERE result_status = 'qualified' AND search_time_seconds > 0;

-- ---------------------------------------------------------------------------
-- Section 6: Completion
-- ---------------------------------------------------------------------------

SELECT 'Migration 116: myK9Q compatibility complete' as status;
