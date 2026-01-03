-- =====================================================================
-- Migration 038: Auto-Initialize Show Visibility Defaults
-- =====================================================================
-- Author: Claude
-- Date: 2025-11-03
-- Description: Automatically creates a row in show_result_visibility_defaults
--              when a new show is inserted, ensuring all shows have proper
--              visibility settings initialized with 'standard' preset.
-- =====================================================================

BEGIN;

-- =====================================================================
-- TRIGGER FUNCTION: Initialize visibility defaults for new shows
-- =====================================================================

CREATE OR REPLACE FUNCTION initialize_show_visibility_defaults()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert default visibility settings for the new show
  -- Uses 'standard' preset (Q/NQ immediate, rest on class complete)
  INSERT INTO show_result_visibility_defaults (
    license_key,
    preset_name,
    created_at,
    updated_at,
    updated_by
  ) VALUES (
    NEW.license_key,
    'standard',
    NOW(),
    NOW(),
    'System (Auto-initialized)'
  )
  ON CONFLICT (license_key) DO NOTHING;  -- Skip if already exists

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION initialize_show_visibility_defaults() IS
  'Automatically creates default visibility settings (standard preset) when a new show is inserted';

-- =====================================================================
-- TRIGGER: Auto-initialize on show insert
-- =====================================================================

CREATE TRIGGER trigger_initialize_show_visibility_defaults
  AFTER INSERT ON shows
  FOR EACH ROW
  EXECUTE FUNCTION initialize_show_visibility_defaults();

COMMENT ON TRIGGER trigger_initialize_show_visibility_defaults ON shows IS
  'Ensures every new show gets default visibility settings initialized automatically';

-- =====================================================================
-- BACKFILL: Initialize defaults for existing shows
-- =====================================================================

-- Add default visibility settings for any existing shows that don't have them
INSERT INTO show_result_visibility_defaults (
  license_key,
  preset_name,
  created_at,
  updated_at,
  updated_by
)
SELECT
  s.license_key,
  'standard',
  NOW(),
  NOW(),
  'System (Backfill)'
FROM shows s
LEFT JOIN show_result_visibility_defaults svd ON s.license_key = svd.license_key
WHERE svd.license_key IS NULL;

COMMIT;

-- =====================================================================
-- VERIFICATION QUERY (Run manually to verify)
-- =====================================================================
-- SELECT
--   s.license_key,
--   s.show_name,
--   svd.preset_name,
--   svd.updated_by
-- FROM shows s
-- LEFT JOIN show_result_visibility_defaults svd ON s.license_key = svd.license_key
-- ORDER BY s.created_at DESC;
