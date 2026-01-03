-- =====================================================
-- Migration: Protect Scored Entries from Re-Upload
-- =====================================================
-- Prevents accidental overwrites of scoring data when
-- entries are re-uploaded from Microsoft Access.
--
-- Behavior: Silently preserves scoring fields while
-- allowing metadata updates (handler name, etc.)
--
-- Date: 2025-12-18
-- =====================================================

-- Add unlock column for admin corrections
ALTER TABLE entries ADD COLUMN IF NOT EXISTS score_unlocked BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN entries.score_unlocked IS 'When TRUE, allows scoring fields to be modified. Auto-resets to FALSE after update.';

-- Main protection trigger function
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
  IF OLD.is_scored = TRUE THEN
    -- Core scoring status
    NEW.is_scored := OLD.is_scored;
    NEW.result_status := OLD.result_status;
    NEW.final_placement := OLD.final_placement;

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

-- Create the trigger (BEFORE UPDATE so we can modify NEW)
DROP TRIGGER IF EXISTS trg_protect_scored_entries ON entries;
CREATE TRIGGER trg_protect_scored_entries
  BEFORE UPDATE ON entries
  FOR EACH ROW
  EXECUTE FUNCTION protect_scored_entries();

COMMENT ON FUNCTION protect_scored_entries IS
'Silently preserves scoring fields when is_scored=true to prevent accidental overwrites from re-uploads.
Set score_unlocked=true to allow admin corrections (auto-resets after update).';

-- =============================================================================
-- Helper function to unlock a single entry for editing
-- =============================================================================
CREATE OR REPLACE FUNCTION unlock_entry_for_edit(p_entry_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE entries
  SET score_unlocked = TRUE,
      updated_at = NOW()
  WHERE id = p_entry_id
    AND is_scored = TRUE;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION unlock_entry_for_edit IS
'Unlocks a single scored entry to allow corrections. The unlock auto-resets after the next update.';

-- =============================================================================
-- Helper function to unlock ALL scored entries in a class (for Access re-upload)
-- =============================================================================
CREATE OR REPLACE FUNCTION unlock_class_for_reupload(p_class_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE entries
  SET score_unlocked = TRUE,
      updated_at = NOW()
  WHERE class_id = p_class_id
    AND is_scored = TRUE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RAISE NOTICE 'Unlocked % scored entries in class % for re-upload', v_count, p_class_id;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION unlock_class_for_reupload IS
'Unlocks all scored entries in a class to allow re-upload from Access.
Call this before uploading if you intentionally want to overwrite scores.
Returns the number of entries unlocked. All entries auto-relock after the next update.';

-- =============================================================================
-- Verification Query (run after migration)
-- =============================================================================
-- SELECT
--   proname as function_name,
--   obj_description(oid, 'pg_proc') as description
-- FROM pg_proc
-- WHERE proname IN ('protect_scored_entries', 'unlock_entry_for_edit', 'unlock_class_for_reupload');
