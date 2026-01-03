-- =====================================================================
-- Migration 035: Granular Result Visibility Control System
-- =====================================================================
-- Author: Claude
-- Date: 2025-11-02
-- Description: Implements cascading visibility control (Show → Trial → Class)
--              for result fields (placement, qualification, time, faults).
--              Judges and admins always see all results.
--              Stewards and exhibitors subject to configured visibility rules.
-- =====================================================================

BEGIN;

-- =====================================================================
-- ENUMS
-- =====================================================================

-- Result fields that can be controlled
CREATE TYPE result_field_enum AS ENUM (
  'placement',      -- Trophy/position number
  'qualification',  -- Q/NQ/Absent/etc.
  'time',          -- Search time in seconds
  'faults'         -- Fault count
);

-- When fields become visible to stewards/exhibitors
CREATE TYPE visibility_timing_enum AS ENUM (
  'immediate',       -- Show as soon as dog is scored
  'class_complete',  -- Show when class finishes (all dogs done)
  'manual_release'   -- Show only after admin clicks "Release Results"
);

-- Preset templates for quick setup
CREATE TYPE visibility_preset_enum AS ENUM (
  'open',      -- All fields immediate (except placement → class_complete)
  'standard',  -- Q/NQ immediate, others class_complete
  'review'     -- All fields manual_release
);

COMMENT ON TYPE visibility_timing_enum IS 'Controls when result fields become visible to stewards and exhibitors. Judges and admins always see all fields.';
COMMENT ON TYPE visibility_preset_enum IS 'Quick-apply templates: open (show all ASAP), standard (Q/NQ immediate, rest on complete), review (manual release)';

-- =====================================================================
-- SHOW-LEVEL DEFAULTS TABLE
-- =====================================================================

CREATE TABLE show_result_visibility_defaults (
  license_key TEXT PRIMARY KEY,
  preset_name visibility_preset_enum NOT NULL DEFAULT 'standard',

  -- Granular overrides (NULL = use preset defaults)
  placement_timing visibility_timing_enum,
  qualification_timing visibility_timing_enum,
  time_timing visibility_timing_enum,
  faults_timing visibility_timing_enum,

  -- Audit trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,

  -- Constraint: placement can never be 'immediate' (calculated only when class completes)
  CONSTRAINT placement_no_immediate
  CHECK (placement_timing IS NULL OR placement_timing != 'immediate')
);

COMMENT ON TABLE show_result_visibility_defaults IS 'Show-level visibility defaults. All trials and classes inherit these settings unless explicitly overridden.';
COMMENT ON COLUMN show_result_visibility_defaults.preset_name IS 'Quick preset applied to all fields. Individual field overrides take precedence.';
COMMENT ON COLUMN show_result_visibility_defaults.placement_timing IS 'Override for placement field. NULL means use preset default. Cannot be immediate.';

-- =====================================================================
-- TRIAL-LEVEL OVERRIDES TABLE
-- =====================================================================

CREATE TABLE trial_result_visibility_overrides (
  trial_id BIGINT PRIMARY KEY REFERENCES trials(id) ON DELETE CASCADE,
  preset_name visibility_preset_enum,

  -- Granular overrides
  placement_timing visibility_timing_enum,
  qualification_timing visibility_timing_enum,
  time_timing visibility_timing_enum,
  faults_timing visibility_timing_enum,

  -- Audit trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,

  CONSTRAINT trial_placement_no_immediate
  CHECK (placement_timing IS NULL OR placement_timing != 'immediate')
);

COMMENT ON TABLE trial_result_visibility_overrides IS 'Trial-level visibility overrides. Classes in this trial inherit these settings unless class has its own override.';

CREATE INDEX idx_trial_visibility ON trial_result_visibility_overrides(trial_id);

-- =====================================================================
-- CLASS-LEVEL OVERRIDES TABLE
-- =====================================================================

CREATE TABLE class_result_visibility_overrides (
  class_id BIGINT PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  preset_name visibility_preset_enum,

  -- Granular overrides
  placement_timing visibility_timing_enum,
  qualification_timing visibility_timing_enum,
  time_timing visibility_timing_enum,
  faults_timing visibility_timing_enum,

  -- Audit trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,

  CONSTRAINT class_placement_no_immediate
  CHECK (placement_timing IS NULL OR placement_timing != 'immediate')
);

COMMENT ON TABLE class_result_visibility_overrides IS 'Class-level visibility overrides. Highest precedence - overrides both trial and show settings.';

CREATE INDEX idx_class_visibility ON class_result_visibility_overrides(class_id);

-- =====================================================================
-- HELPER FUNCTION: RESOLVE PRESET TO FIELD TIMINGS
-- =====================================================================

CREATE OR REPLACE FUNCTION resolve_visibility_preset(
  preset visibility_preset_enum
) RETURNS TABLE (
  placement_timing visibility_timing_enum,
  qualification_timing visibility_timing_enum,
  time_timing visibility_timing_enum,
  faults_timing visibility_timing_enum
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Placement: Always class_complete or manual (never immediate)
    CASE preset
      WHEN 'open' THEN 'class_complete'::visibility_timing_enum
      WHEN 'standard' THEN 'class_complete'::visibility_timing_enum
      WHEN 'review' THEN 'manual_release'::visibility_timing_enum
    END AS placement_timing,

    -- Qualification: Immediate for open/standard, manual for review
    CASE preset
      WHEN 'open' THEN 'immediate'::visibility_timing_enum
      WHEN 'standard' THEN 'immediate'::visibility_timing_enum
      WHEN 'review' THEN 'manual_release'::visibility_timing_enum
    END AS qualification_timing,

    -- Time: Immediate for open, class_complete for standard, manual for review
    CASE preset
      WHEN 'open' THEN 'immediate'::visibility_timing_enum
      WHEN 'standard' THEN 'class_complete'::visibility_timing_enum
      WHEN 'review' THEN 'manual_release'::visibility_timing_enum
    END AS time_timing,

    -- Faults: Same as time
    CASE preset
      WHEN 'open' THEN 'immediate'::visibility_timing_enum
      WHEN 'standard' THEN 'class_complete'::visibility_timing_enum
      WHEN 'review' THEN 'manual_release'::visibility_timing_enum
    END AS faults_timing;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION resolve_visibility_preset IS 'Converts preset name to specific field timing values. Used by application layer for resolution.';

-- =====================================================================
-- DATA SEEDING: DEFAULT VALUES FOR EXISTING SHOWS
-- =====================================================================

-- Insert 'standard' preset as default for all existing shows
INSERT INTO show_result_visibility_defaults (license_key, preset_name, updated_by)
SELECT DISTINCT license_key, 'standard'::visibility_preset_enum, 'MIGRATION_035'
FROM shows
WHERE license_key IS NOT NULL
ON CONFLICT (license_key) DO NOTHING;

-- =====================================================================
-- VERIFICATION QUERIES
-- =====================================================================

DO $$
DECLARE
  show_count INTEGER;
  preset_distribution TEXT;
BEGIN
  -- Count seeded shows
  SELECT COUNT(*) INTO show_count FROM show_result_visibility_defaults;

  RAISE NOTICE '✓ Migration 035 completed successfully';
  RAISE NOTICE '✓ Created 3 enums: result_field_enum, visibility_timing_enum, visibility_preset_enum';
  RAISE NOTICE '✓ Created 3 tables: show_result_visibility_defaults, trial_result_visibility_overrides, class_result_visibility_overrides';
  RAISE NOTICE '✓ Created helper function: resolve_visibility_preset()';
  RAISE NOTICE '✓ Seeded % shows with ''standard'' preset', show_count;
  RAISE NOTICE '✓ Placement field protected with constraint (cannot be immediate)';
  RAISE NOTICE '';
  RAISE NOTICE 'Cascading hierarchy: Show → Trial → Class (lowest level wins)';
  RAISE NOTICE 'Role exemptions: Judges and admins always see all results';
END $$;

COMMIT;

-- =====================================================================
-- ROLLBACK INSTRUCTIONS
-- =====================================================================
-- To rollback this migration:
--
-- BEGIN;
-- DROP TABLE IF EXISTS class_result_visibility_overrides CASCADE;
-- DROP TABLE IF EXISTS trial_result_visibility_overrides CASCADE;
-- DROP TABLE IF EXISTS show_result_visibility_defaults CASCADE;
-- DROP FUNCTION IF EXISTS resolve_visibility_preset(visibility_preset_enum);
-- DROP TYPE IF EXISTS visibility_preset_enum;
-- DROP TYPE IF EXISTS visibility_timing_enum;
-- DROP TYPE IF EXISTS result_field_enum;
-- COMMIT;
