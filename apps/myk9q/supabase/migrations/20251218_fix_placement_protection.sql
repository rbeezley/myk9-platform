-- =====================================================
-- Migration: Fix Placement Protection Bug
-- =====================================================
-- Removes final_placement from protected scoring fields
-- because placements are calculated AFTER scoring completes
-- and need to be updatable by recalculate_class_placements().
--
-- Bug: The protect_scored_entries trigger was preventing
-- placement calculation from working on scored entries.
--
-- Date: 2025-12-18
-- =====================================================

CREATE OR REPLACE FUNCTION protect_scored_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Skip protection if entry is unlocked for editing
  IF OLD.score_unlocked = TRUE THEN
    -- Auto-relock after this update
    NEW.score_unlocked := FALSE;
    RETURN NEW;
  END IF;

  -- If entry is already scored, preserve all scoring fields
  -- NOTE: final_placement is NOT protected because it's calculated
  -- programmatically by recalculate_class_placements() AFTER scoring
  IF OLD.is_scored = TRUE THEN
    -- Core scoring status
    NEW.is_scored := OLD.is_scored;
    NEW.result_status := OLD.result_status;
    -- final_placement intentionally NOT protected (calculated field)

    -- Time fields
    NEW.search_time_seconds := OLD.search_time_seconds;
    NEW.area1_time_seconds := OLD.area1_time_seconds;
    NEW.area2_time_seconds := OLD.area2_time_seconds;
    NEW.area3_time_seconds := OLD.area3_time_seconds;
    NEW.area4_time_seconds := OLD.area4_time_seconds;

    -- Fault fields
    NEW.total_faults := OLD.total_faults;
    NEW.area1_faults := OLD.area1_faults;
    NEW.area2_faults := OLD.area2_faults;
    NEW.area3_faults := OLD.area3_faults;

    -- Find counts
    NEW.total_correct_finds := OLD.total_correct_finds;
    NEW.total_incorrect_finds := OLD.total_incorrect_finds;
    NEW.area1_correct := OLD.area1_correct;
    NEW.area1_incorrect := OLD.area1_incorrect;
    NEW.area2_correct := OLD.area2_correct;
    NEW.area2_incorrect := OLD.area2_incorrect;
    NEW.area3_correct := OLD.area3_correct;
    NEW.area3_incorrect := OLD.area3_incorrect;

    -- Score calculations
    NEW.total_score := OLD.total_score;
    NEW.points_earned := OLD.points_earned;
    NEW.points_possible := OLD.points_possible;
    NEW.bonus_points := OLD.bonus_points;
    NEW.penalty_points := OLD.penalty_points;

    -- Time limit tracking
    NEW.time_over_limit := OLD.time_over_limit;
    NEW.time_limit_exceeded_seconds := OLD.time_limit_exceeded_seconds;

    -- Judge data
    NEW.judge_notes := OLD.judge_notes;
    NEW.video_review_notes := OLD.video_review_notes;
    NEW.disqualification_reason := OLD.disqualification_reason;
    NEW.judge_signature := OLD.judge_signature;
    NEW.judge_signature_timestamp := OLD.judge_signature_timestamp;

    -- Scoring timestamps
    NEW.scoring_started_at := OLD.scoring_started_at;
    NEW.scoring_completed_at := OLD.scoring_completed_at;

    -- Log that protection was applied
    RAISE NOTICE 'Scoring fields protected for entry % (armband %)', OLD.id, OLD.armband_number;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION protect_scored_entries IS
'Silently preserves scoring fields when is_scored=true to prevent accidental overwrites from re-uploads.
NOTE: final_placement is NOT protected because it is calculated by recalculate_class_placements().
Set score_unlocked=true to allow admin corrections (auto-resets after update).';
