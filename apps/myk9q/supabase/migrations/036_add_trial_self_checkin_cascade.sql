-- Migration 036: Add trial-level self check-in cascade inheritance
-- This enables the same Show → Trial → Class hierarchy for self check-in
-- as we have for result visibility

-- ============================================================
-- STEP 1: Add self_checkin_enabled to trials table
-- ============================================================

ALTER TABLE trials
ADD COLUMN self_checkin_enabled BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN trials.self_checkin_enabled IS 'When NULL, inherits from show. When set, overrides show default for all classes in this trial.';

-- ============================================================
-- STEP 2: Add self_checkin_enabled to shows table (if not exists)
-- ============================================================

-- Check if column exists, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shows' AND column_name = 'self_checkin_enabled'
  ) THEN
    ALTER TABLE shows ADD COLUMN self_checkin_enabled BOOLEAN DEFAULT TRUE;
    COMMENT ON COLUMN shows.self_checkin_enabled IS 'Show-level default for self check-in. Classes inherit this unless overridden at trial or class level.';
  END IF;
END $$;

-- ============================================================
-- STEP 3: Update existing classes to preserve their current settings
-- ============================================================

-- Classes that currently have self_checkin_enabled = FALSE should keep that
-- Classes that have TRUE can inherit from trial/show (set to NULL)
-- This ensures no behavior changes for existing trials

UPDATE classes
SET self_checkin_enabled = NULL
WHERE self_checkin_enabled = TRUE;

-- Classes with FALSE will remain FALSE (explicit override)

COMMENT ON COLUMN classes.self_checkin_enabled IS 'When NULL, inherits from trial (or show if trial is NULL). When set, overrides trial/show defaults.';

-- ============================================================
-- STEP 4: Create helper function to resolve cascading self check-in
-- ============================================================

CREATE OR REPLACE FUNCTION get_effective_self_checkin(
  p_class_id BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
  v_class_setting BOOLEAN;
  v_trial_setting BOOLEAN;
  v_show_setting BOOLEAN;
  v_trial_id BIGINT;
  v_license_key TEXT;
BEGIN
  -- Get class settings
  SELECT
    c.self_checkin_enabled,
    c.trial_id,
    t.license_key
  INTO
    v_class_setting,
    v_trial_id,
    v_license_key
  FROM classes c
  JOIN trials t ON c.trial_id = t.id
  WHERE c.id = p_class_id;

  -- If class has explicit setting, use it
  IF v_class_setting IS NOT NULL THEN
    RETURN v_class_setting;
  END IF;

  -- Check trial setting
  SELECT self_checkin_enabled
  INTO v_trial_setting
  FROM trials
  WHERE id = v_trial_id;

  -- If trial has explicit setting, use it
  IF v_trial_setting IS NOT NULL THEN
    RETURN v_trial_setting;
  END IF;

  -- Fall back to show setting
  SELECT self_checkin_enabled
  INTO v_show_setting
  FROM shows
  WHERE license_key = v_license_key;

  -- Return show setting (default TRUE if NULL)
  RETURN COALESCE(v_show_setting, TRUE);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_effective_self_checkin IS 'Resolves the effective self check-in setting for a class using cascade: class → trial → show → default TRUE';

-- ============================================================
-- STEP 5: Add index for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_trials_self_checkin
ON trials(self_checkin_enabled)
WHERE self_checkin_enabled IS NOT NULL;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Verify the cascade works correctly
DO $$
DECLARE
  v_test_result TEXT;
BEGIN
  -- Test query to show cascade resolution
  SELECT INTO v_test_result
    string_agg(
      format(
        'Class %s: %s (class=%s, trial=%s, show=%s)',
        c.id,
        get_effective_self_checkin(c.id),
        COALESCE(c.self_checkin_enabled::TEXT, 'NULL'),
        COALESCE(t.self_checkin_enabled::TEXT, 'NULL'),
        COALESCE(s.self_checkin_enabled::TEXT, 'NULL')
      ),
      E'\n'
    )
  FROM classes c
  JOIN trials t ON c.trial_id = t.id
  JOIN shows s ON t.license_key = s.license_key
  LIMIT 5;

  RAISE NOTICE 'Sample cascade resolution:%', E'\n' || COALESCE(v_test_result, 'No classes found');
END $$;
