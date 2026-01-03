-- ROLLBACK: Merge results table into entries table
-- Use this script to reverse migration 039 if needed
--
-- WHEN TO USE:
-- - Migration failed during execution
-- - Code deployment has issues
-- - Need to restore original schema for any reason
--
-- SAFETY: This script recreates the results table and foreign keys

BEGIN;

-- ============================================================================
-- STEP 1: Recreate results table with original schema
-- ============================================================================

CREATE TABLE IF NOT EXISTS results (
  id BIGSERIAL PRIMARY KEY,
  entry_id BIGINT UNIQUE,
  ring_entry_time TIMESTAMPTZ,
  ring_exit_time TIMESTAMPTZ,
  scoring_started_at TIMESTAMPTZ,
  scoring_completed_at TIMESTAMPTZ,
  disqualification_reason TEXT,
  judge_notes TEXT,
  video_review_notes TEXT,
  judge_signature TEXT,
  judge_signature_timestamp TIMESTAMPTZ,
  is_in_ring BOOLEAN DEFAULT FALSE,
  is_scored BOOLEAN DEFAULT FALSE,
  result_status TEXT DEFAULT 'pending'
    CHECK (result_status IN ('pending', 'qualified', 'nq', 'absent', 'excused', 'withdrawn')),
  final_placement INTEGER DEFAULT 0 CHECK (final_placement >= 0),
  search_time_seconds NUMERIC DEFAULT 0,
  area1_time_seconds NUMERIC DEFAULT 0,
  area2_time_seconds NUMERIC DEFAULT 0,
  area3_time_seconds NUMERIC DEFAULT 0,
  area4_time_seconds NUMERIC DEFAULT 0,
  total_correct_finds INTEGER DEFAULT 0,
  total_incorrect_finds INTEGER DEFAULT 0,
  total_faults INTEGER DEFAULT 0,
  no_finish_count INTEGER DEFAULT 0,
  area1_correct INTEGER DEFAULT 0,
  area1_incorrect INTEGER DEFAULT 0,
  area1_faults INTEGER DEFAULT 0,
  area2_correct INTEGER DEFAULT 0,
  area2_incorrect INTEGER DEFAULT 0,
  area2_faults INTEGER DEFAULT 0,
  area3_correct INTEGER DEFAULT 0,
  area3_incorrect INTEGER DEFAULT 0,
  area3_faults INTEGER DEFAULT 0,
  total_score NUMERIC DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  points_possible INTEGER DEFAULT 0,
  has_video_review BOOLEAN DEFAULT FALSE,
  bonus_points INTEGER DEFAULT 0,
  penalty_points INTEGER DEFAULT 0,
  time_over_limit BOOLEAN DEFAULT FALSE,
  time_limit_exceeded_seconds NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE results IS 'Scoring results for entries (restored from rollback)';

-- ============================================================================
-- STEP 2: Copy data from entries back to results
-- ============================================================================

INSERT INTO results (
  entry_id,
  ring_entry_time,
  ring_exit_time,
  scoring_started_at,
  scoring_completed_at,
  disqualification_reason,
  judge_notes,
  video_review_notes,
  judge_signature,
  judge_signature_timestamp,
  is_in_ring,
  is_scored,
  result_status,
  final_placement,
  search_time_seconds,
  area1_time_seconds,
  area2_time_seconds,
  area3_time_seconds,
  area4_time_seconds,
  total_correct_finds,
  total_incorrect_finds,
  total_faults,
  no_finish_count,
  area1_correct,
  area1_incorrect,
  area1_faults,
  area2_correct,
  area2_incorrect,
  area2_faults,
  area3_correct,
  area3_incorrect,
  area3_faults,
  total_score,
  points_earned,
  points_possible,
  has_video_review,
  bonus_points,
  penalty_points,
  time_over_limit,
  time_limit_exceeded_seconds
)
SELECT
  id as entry_id,
  ring_entry_time,
  ring_exit_time,
  scoring_started_at,
  scoring_completed_at,
  disqualification_reason,
  judge_notes,
  video_review_notes,
  judge_signature,
  judge_signature_timestamp,
  is_in_ring,
  is_scored,
  result_status,
  final_placement,
  search_time_seconds,
  area1_time_seconds,
  area2_time_seconds,
  area3_time_seconds,
  area4_time_seconds,
  total_correct_finds,
  total_incorrect_finds,
  total_faults,
  no_finish_count,
  area1_correct,
  area1_incorrect,
  area1_faults,
  area2_correct,
  area2_incorrect,
  area2_faults,
  area3_correct,
  area3_incorrect,
  area3_faults,
  total_score,
  points_earned,
  points_possible,
  has_video_review,
  bonus_points,
  penalty_points,
  time_over_limit,
  time_limit_exceeded_seconds
FROM entries
WHERE is_scored = TRUE;

-- Verify rollback
DO $$
DECLARE
  results_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO results_count FROM results;
  RAISE NOTICE 'Rollback verification: % results restored', results_count;
END $$;

-- ============================================================================
-- STEP 3: Recreate foreign key from results to entries
-- ============================================================================

ALTER TABLE results
  ADD CONSTRAINT entry_results_class_entry_id_fkey
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE;

-- ============================================================================
-- STEP 4: Update nationals tables to point back to results
-- ============================================================================

-- Drop constraints pointing to entries
ALTER TABLE nationals_scores
  DROP CONSTRAINT IF EXISTS nationals_scores_entry_id_fkey;

ALTER TABLE nationals_rankings
  DROP CONSTRAINT IF EXISTS nationals_rankings_entry_id_fkey;

ALTER TABLE nationals_advancement
  DROP CONSTRAINT IF EXISTS nationals_advancement_entry_id_fkey;

-- Re-add constraints pointing to results.entry_id
-- (These tables store entry_id which matches both entries.id and results.entry_id)

-- ============================================================================
-- STEP 5: Restore original view_entry_with_results
-- ============================================================================

DROP VIEW IF EXISTS view_entry_with_results;

CREATE OR REPLACE VIEW view_entry_with_results AS
SELECT
  -- All entry columns
  e.*,

  -- All result columns (from results table)
  r.is_scored,
  r.result_status,
  r.final_placement,
  r.search_time_seconds,
  r.ring_entry_time,
  r.ring_exit_time,
  r.scoring_started_at,
  r.scoring_completed_at,
  r.total_correct_finds,
  r.total_incorrect_finds,
  r.total_faults,
  r.area1_time_seconds,
  r.area2_time_seconds,
  r.area3_time_seconds,
  r.area4_time_seconds,
  r.no_finish_count,
  r.area1_correct,
  r.area1_incorrect,
  r.area1_faults,
  r.area2_correct,
  r.area2_incorrect,
  r.area2_faults,
  r.area3_correct,
  r.area3_incorrect,
  r.area3_faults,
  r.total_score,
  r.points_earned,
  r.points_possible,
  r.has_video_review,
  r.bonus_points,
  r.penalty_points,
  r.time_over_limit,
  r.time_limit_exceeded_seconds,
  r.disqualification_reason,
  r.judge_notes,
  r.video_review_notes,
  r.judge_signature,
  r.judge_signature_timestamp,

  -- Computed convenience field
  CASE
    WHEN r.is_scored = TRUE AND r.result_status = 'qualified' THEN 'Q'
    WHEN r.is_scored = TRUE AND r.result_status = 'nq' THEN 'NQ'
    WHEN r.is_scored = TRUE AND r.result_status = 'absent' THEN 'ABS'
    WHEN r.is_scored = TRUE AND r.result_status = 'excused' THEN 'EX'
    WHEN r.is_scored = TRUE AND r.result_status = 'withdrawn' THEN 'WD'
    ELSE 'pending'
  END as result_text
FROM entries e
LEFT JOIN results r ON e.id = r.entry_id;

COMMENT ON VIEW view_entry_with_results IS 'Entries pre-joined with results (original schema restored)';

-- ============================================================================
-- STEP 6: Remove result columns from entries table
-- ============================================================================
-- These columns were added by migration 039, now removing them

ALTER TABLE entries
  DROP COLUMN IF EXISTS ring_entry_time,
  DROP COLUMN IF EXISTS ring_exit_time,
  DROP COLUMN IF EXISTS scoring_started_at,
  DROP COLUMN IF EXISTS scoring_completed_at,
  DROP COLUMN IF EXISTS disqualification_reason,
  DROP COLUMN IF EXISTS judge_notes,
  DROP COLUMN IF EXISTS video_review_notes,
  DROP COLUMN IF EXISTS judge_signature,
  DROP COLUMN IF EXISTS judge_signature_timestamp,
  DROP COLUMN IF EXISTS is_in_ring,
  DROP COLUMN IF EXISTS is_scored,
  DROP COLUMN IF EXISTS result_status,
  DROP COLUMN IF EXISTS final_placement,
  DROP COLUMN IF EXISTS search_time_seconds,
  DROP COLUMN IF EXISTS area1_time_seconds,
  DROP COLUMN IF EXISTS area2_time_seconds,
  DROP COLUMN IF EXISTS area3_time_seconds,
  DROP COLUMN IF EXISTS area4_time_seconds,
  DROP COLUMN IF EXISTS total_correct_finds,
  DROP COLUMN IF EXISTS total_incorrect_finds,
  DROP COLUMN IF EXISTS total_faults,
  DROP COLUMN IF EXISTS no_finish_count,
  DROP COLUMN IF EXISTS area1_correct,
  DROP COLUMN IF EXISTS area1_incorrect,
  DROP COLUMN IF EXISTS area1_faults,
  DROP COLUMN IF EXISTS area2_correct,
  DROP COLUMN IF EXISTS area2_incorrect,
  DROP COLUMN IF EXISTS area2_faults,
  DROP COLUMN IF EXISTS area3_correct,
  DROP COLUMN IF EXISTS area3_incorrect,
  DROP COLUMN IF EXISTS area3_faults,
  DROP COLUMN IF EXISTS total_score,
  DROP COLUMN IF EXISTS points_earned,
  DROP COLUMN IF EXISTS points_possible,
  DROP COLUMN IF EXISTS has_video_review,
  DROP COLUMN IF EXISTS bonus_points,
  DROP COLUMN IF EXISTS penalty_points,
  DROP COLUMN IF EXISTS time_over_limit,
  DROP COLUMN IF EXISTS time_limit_exceeded_seconds;

-- ============================================================================
-- STEP 7: Drop indexes created by migration 039
-- ============================================================================

DROP INDEX IF EXISTS idx_entries_is_scored;
DROP INDEX IF EXISTS idx_entries_result_status;
DROP INDEX IF EXISTS idx_entries_final_placement;
DROP INDEX IF EXISTS idx_entries_class_scored;

-- Restore original table comment
COMMENT ON TABLE entries IS 'Entry information for dogs in classes. Status fields:\n- entry_status: Check-in and ring status (none, checked-in, at-gate, in-ring, etc.)\n- Scoring status comes from results.is_scored\n- Result outcomes (Q/NQ/ABS/EX/WD) come from results.result_status';

COMMIT;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
SELECT
  'Migration 039 successfully rolled back' as status,
  'Results table has been restored with original schema' as result,
  'You can now deploy the previous code version' as next_step;
