-- Migration: Entry Table Cleanup - Remove legacy columns after refactoring
-- Author: Supabase Specialist  
-- Date: 2025-01-31
-- Description: Cleanup migration to remove legacy columns from entry table
--              This should only be run AFTER the application has been updated
--              to use the new class_entry table structure

-- WARNING: This migration removes columns from the entry table
-- Make sure you have:
-- 1. Updated all application code to use class_entry table
-- 2. Tested thoroughly with the new structure  
-- 3. Verified all features work correctly
-- 4. Created a database backup

BEGIN;

-- =============================================================================
-- STEP 1: SAFETY CHECKS
-- =============================================================================

-- Function to check if it's safe to remove legacy columns
CREATE OR REPLACE FUNCTION check_cleanup_safety()
RETURNS TABLE(
  check_name TEXT,
  status TEXT,
  details TEXT,
  recommendation TEXT
) AS $$
BEGIN
  -- Check if class_entry table has been populated
  RETURN QUERY
  SELECT 
    'Class Entry Population'::TEXT,
    CASE 
      WHEN COUNT(*) > 0 THEN 'OK'
      ELSE 'ERROR'
    END::TEXT,
    format('Found %s class_entry records', COUNT(*))::TEXT,
    CASE 
      WHEN COUNT(*) > 0 THEN 'Safe to proceed'
      ELSE 'DO NOT RUN - Populate class_entry table first'
    END::TEXT
  FROM class_entry;
  
  -- Check if there are entries with class-specific data that haven't been migrated
  RETURN QUERY
  SELECT 
    'Unmigrated Entry Data'::TEXT,
    CASE 
      WHEN COUNT(*) = 0 THEN 'OK'
      ELSE 'WARNING'
    END::TEXT,
    format('Found %s entries with class data but no class_entry records', COUNT(*))::TEXT,
    CASE 
      WHEN COUNT(*) = 0 THEN 'Safe to proceed'
      ELSE 'Consider running migrate_entry_data_to_class_entry() first'
    END::TEXT
  FROM entry e
  WHERE (e.armband IS NOT NULL OR e.run_order IS NOT NULL OR e.jump_height IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM class_entry ce WHERE ce.entry_id = e.id
  );
  
  -- Check if total_fees have been calculated
  RETURN QUERY
  SELECT 
    'Total Fees Calculation'::TEXT,
    CASE 
      WHEN COUNT(*) = 0 THEN 'OK'
      ELSE 'WARNING'
    END::TEXT,
    format('Found %s entries with NULL total_fees', COUNT(*))::TEXT,
    CASE 
      WHEN COUNT(*) = 0 THEN 'Safe to proceed'
      ELSE 'Consider recalculating total_fees first'
    END::TEXT
  FROM entry e
  WHERE e.total_fees IS NULL
  AND EXISTS (SELECT 1 FROM class_entry ce WHERE ce.entry_id = e.id);
  
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- STEP 2: PRE-CLEANUP VALIDATION
-- =============================================================================

-- Show safety check results
-- Uncomment the line below to see safety check results before running cleanup
-- SELECT * FROM check_cleanup_safety();

-- =============================================================================
-- STEP 3: BACKUP LEGACY DATA (OPTIONAL)
-- =============================================================================

-- Create a backup table with legacy data before removal
CREATE TABLE IF NOT EXISTS entry_legacy_backup AS
SELECT 
  id,
  class_id,
  armband,
  run_order, 
  jump_height,
  entry_fee,
  preferred_judge,
  status as legacy_status,
  created_at as backup_created_at
FROM entry
WHERE (
  class_id IS NOT NULL OR
  armband IS NOT NULL OR 
  run_order IS NOT NULL OR
  jump_height IS NOT NULL OR
  entry_fee IS NOT NULL OR
  preferred_judge IS NOT NULL
);

-- Add comment to backup table
COMMENT ON TABLE entry_legacy_backup IS 'Backup of legacy entry table data before cleanup migration';

-- =============================================================================
-- STEP 4: REMOVE LEGACY COLUMNS FROM ENTRY TABLE
-- =============================================================================

-- Remove class-specific columns that are now in class_entry table
ALTER TABLE entry 
DROP COLUMN IF EXISTS class_id,
DROP COLUMN IF EXISTS armband,
DROP COLUMN IF EXISTS run_order,
DROP COLUMN IF EXISTS jump_height,
DROP COLUMN IF EXISTS entry_fee,
DROP COLUMN IF EXISTS preferred_judge;

-- Note: Keep the 'status' column for now as it might be used for overall entry status
-- It can be removed later if entry_status fully replaces it

-- =============================================================================
-- STEP 5: ADD CONSTRAINTS TO ENSURE DATA QUALITY
-- =============================================================================

-- Ensure entry_status is not null
UPDATE entry SET entry_status = 'draft' WHERE entry_status IS NULL;
ALTER TABLE entry ALTER COLUMN entry_status SET NOT NULL;

-- Ensure total_fees is not null and non-negative
UPDATE entry SET total_fees = 0.00 WHERE total_fees IS NULL;
ALTER TABLE entry ALTER COLUMN total_fees SET NOT NULL;
ALTER TABLE entry ADD CONSTRAINT entry_total_fees_non_negative CHECK (total_fees >= 0);

-- =============================================================================
-- STEP 6: UPDATE INDEXES AFTER COLUMN REMOVAL
-- =============================================================================

-- Remove indexes that referenced dropped columns
DROP INDEX IF EXISTS idx_entry_class_id;
DROP INDEX IF EXISTS idx_entry_armband;
DROP INDEX IF EXISTS idx_entry_run_order;
DROP INDEX IF EXISTS idx_entry_jump_height;
DROP INDEX IF EXISTS idx_entry_entry_fee;
DROP INDEX IF EXISTS idx_entry_preferred_judge;

-- Add any missing indexes for remaining columns
CREATE INDEX IF NOT EXISTS idx_entry_dog_id ON entry(dog_id);
CREATE INDEX IF NOT EXISTS idx_entry_show_id ON entry(show_id);
CREATE INDEX IF NOT EXISTS idx_entry_handler_id ON entry(handler_id);
CREATE INDEX IF NOT EXISTS idx_entry_payment_status ON entry(payment_status);
CREATE INDEX IF NOT EXISTS idx_entry_submitted_at ON entry(submitted_at DESC);

-- =============================================================================
-- STEP 7: UPDATE HELPER FUNCTIONS
-- =============================================================================

-- Update the validation function to reflect the new structure
CREATE OR REPLACE FUNCTION validate_entry_cleanup()
RETURNS TABLE(
  validation_check TEXT,
  status TEXT,
  count_value BIGINT,
  details TEXT
) AS $$
BEGIN
  -- Check that legacy columns have been removed
  RETURN QUERY
  SELECT 
    'Legacy Columns Removed'::TEXT,
    CASE 
      WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'entry' 
        AND column_name IN ('class_id', 'armband', 'run_order', 'jump_height', 'entry_fee', 'preferred_judge')
      ) THEN 'OK'
      ELSE 'ERROR'
    END::TEXT,
    (
      SELECT COUNT(*)::BIGINT FROM information_schema.columns 
      WHERE table_name = 'entry' 
      AND column_name IN ('class_id', 'armband', 'run_order', 'jump_height', 'entry_fee', 'preferred_judge')
    ),
    'Legacy columns should be removed from entry table'::TEXT;
  
  -- Check backup table was created
  RETURN QUERY
  SELECT 
    'Backup Table Created'::TEXT,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'entry_legacy_backup'
      ) THEN 'OK'
      ELSE 'WARNING'
    END::TEXT,
    (
      SELECT COUNT(*)::BIGINT FROM entry_legacy_backup
    ),
    'Legacy data backed up before cleanup'::TEXT;
  
  -- Check entry data integrity
  RETURN QUERY
  SELECT 
    'Entry Data Integrity'::TEXT,
    CASE 
      WHEN COUNT(*) = 0 THEN 'OK'
      ELSE 'ERROR'
    END::TEXT,
    COUNT(*)::BIGINT,
    'Entries with NULL required fields'::TEXT
  FROM entry
  WHERE entry_status IS NULL OR total_fees IS NULL;
  
  -- Check class_entry relationships
  RETURN QUERY
  SELECT 
    'Class Entry Relationships'::TEXT,
    'INFO'::TEXT,
    COUNT(*)::BIGINT,
    'Total class entries linked to entries'::TEXT
  FROM class_entry ce
  JOIN entry e ON ce.entry_id = e.id;
  
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION validate_entry_cleanup() IS 'Validates the entry table cleanup migration';

-- =============================================================================
-- STEP 8: UPDATE VIEW FOR BACKWARD COMPATIBILITY
-- =============================================================================

-- Update the backward compatibility view since some columns no longer exist
CREATE OR REPLACE VIEW entry_with_class_details AS
SELECT 
  e.id,
  e.dog_id,
  e.show_id,
  e.handler,
  e.handler_id,
  e.payment_status,
  e.special_requests,
  e.move_up_requested,
  e.submitted_at,
  e.entry_status,
  e.total_fees,
  e.status, -- Keep legacy status if it still exists
  e.created_at,
  e.updated_at,
  e.created_by,
  e.updated_by,
  e.deleted_at,
  -- Class entry details (now the source of truth for these fields)
  ce.id as class_entry_id,
  ce.class_id,
  ce.trial_id,
  ce.armband,
  ce.run_order,
  ce.jump_height,
  ce.entry_fee,
  ce.preferred_judge,
  ce.status as class_status
FROM entry e
LEFT JOIN class_entry ce ON e.id = ce.entry_id AND ce.deleted_at IS NULL;

-- =============================================================================
-- STEP 9: CLEANUP UNUSED FUNCTIONS
-- =============================================================================

-- Remove the migration function as it's no longer needed
DROP FUNCTION IF EXISTS migrate_entry_data_to_class_entry();

-- Remove the safety check function as it's no longer needed after cleanup
-- DROP FUNCTION IF EXISTS check_cleanup_safety(); -- Keep for documentation

-- =============================================================================
-- STEP 10: FINAL GRANTS AND PERMISSIONS
-- =============================================================================

-- Ensure permissions are still correct after changes
GRANT SELECT ON entry_legacy_backup TO authenticated;
GRANT EXECUTE ON FUNCTION validate_entry_cleanup() TO authenticated;

COMMIT;

-- =============================================================================
-- POST-CLEANUP VALIDATION
-- =============================================================================

-- Run validation after cleanup
-- SELECT * FROM validate_entry_cleanup();

-- =============================================================================
-- CLEANUP NOTES
-- =============================================================================

-- This cleanup migration:
-- 1. Removes legacy columns from the entry table that are now in class_entry
-- 2. Creates a backup table with the legacy data before removal
-- 3. Adds proper constraints to ensure data quality
-- 4. Updates indexes for optimal performance
-- 5. Updates the backward compatibility view
-- 6. Provides validation functions to ensure cleanup was successful

-- After running this migration:
-- 1. The entry table will only contain entry-level data
-- 2. All class-specific data will be in the class_entry table  
-- 3. The total_fees field will be automatically maintained by triggers
-- 4. The entry_with_class_details view provides backward compatibility
-- 5. Legacy data is preserved in entry_legacy_backup table

-- The new structure follows the e-commerce pattern:
-- - entry: Order-level information (customer, payment, submission)
-- - class_entry: OrderItem-level information (specific class details, fees)

-- This provides:
-- - Better normalization and data integrity
-- - Support for multiple classes per entry
-- - Clearer separation of concerns
-- - Automatic fee calculation
-- - Comprehensive audit trail