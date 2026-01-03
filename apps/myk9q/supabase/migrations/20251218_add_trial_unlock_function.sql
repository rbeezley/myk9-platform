-- =====================================================
-- Migration: Add Trial-Level Unlock Function
-- =====================================================
-- Adds function to unlock all scored entries in a trial
-- for re-upload from Microsoft Access.
--
-- This complements the class-level unlock function from
-- 20251218_protect_scored_entries.sql
--
-- Date: 2025-12-18
-- =====================================================

-- Helper function to unlock ALL scored entries in a TRIAL
CREATE OR REPLACE FUNCTION unlock_trial_for_reupload(p_trial_id BIGINT)
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
  WHERE class_id IN (
    SELECT id FROM classes WHERE trial_id = p_trial_id
  )
  AND is_scored = TRUE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RAISE NOTICE 'Unlocked % scored entries in trial % for re-upload', v_count, p_trial_id;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION unlock_trial_for_reupload IS
'Unlocks all scored entries across all classes in a trial to allow re-upload from Access.
Call this before uploading if you intentionally want to overwrite all scores in the trial.
Returns the number of entries unlocked. All entries auto-relock after the next update.';

-- =============================================================================
-- Verification Query (run after migration)
-- =============================================================================
-- SELECT
--   proname as function_name,
--   obj_description(oid, 'pg_proc') as description
-- FROM pg_proc
-- WHERE proname = 'unlock_trial_for_reupload';
