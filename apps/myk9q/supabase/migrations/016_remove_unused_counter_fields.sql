-- Migration 016: Remove unused denormalized counter fields
-- These fields are denormalized aggregates that are:
-- 1. Not actively used in the codebase (only in type definitions)
-- 2. Can get out of sync with actual data
-- 3. Should be calculated on-demand with queries
--
-- NOTE: Access database fields (access_*_id) are KEPT for legacy data imports
-- NOTE: classes.total_entry_count and completed_entry_count are KEPT (used by TV display)

-- Step 1: Log what we're doing
DO $$
BEGIN
    RAISE NOTICE 'Starting migration 016: Removing unused denormalized counter fields';
    RAISE NOTICE 'These fields are not actively queried and should be calculated on-demand';
END $$;

-- Step 2: Drop dependent view first
DROP VIEW IF EXISTS view_trial_summary_normalized;

-- Step 3: Remove unused counter fields from trials table
ALTER TABLE trials DROP COLUMN IF EXISTS total_class_count;
ALTER TABLE trials DROP COLUMN IF EXISTS completed_class_count;
ALTER TABLE trials DROP COLUMN IF EXISTS pending_class_count;
ALTER TABLE trials DROP COLUMN IF EXISTS total_entry_count;
ALTER TABLE trials DROP COLUMN IF EXISTS completed_entry_count;
ALTER TABLE trials DROP COLUMN IF EXISTS pending_entry_count;

-- Step 4: Remove ALL counter fields from classes table
-- NOTE: TV display has been updated to calculate counts on-demand (like ClassList does)
ALTER TABLE classes DROP COLUMN IF EXISTS total_entry_count;
ALTER TABLE classes DROP COLUMN IF EXISTS completed_entry_count;
ALTER TABLE classes DROP COLUMN IF EXISTS pending_entry_count;
ALTER TABLE classes DROP COLUMN IF EXISTS absent_entry_count;
ALTER TABLE classes DROP COLUMN IF EXISTS qualified_entry_count;
ALTER TABLE classes DROP COLUMN IF EXISTS nq_entry_count;
ALTER TABLE classes DROP COLUMN IF EXISTS excused_entry_count;
ALTER TABLE classes DROP COLUMN IF EXISTS in_progress_count;

-- Step 5: Recreate view_trial_summary_normalized WITHOUT counter fields
CREATE VIEW view_trial_summary_normalized AS
SELECT
  t.id AS trial_id,
  t.show_id,
  t.trial_name,
  t.trial_date,
  t.trial_number,
  t.trial_type,
  s.show_name,
  s.club_name,
  s.license_key
FROM trials t
JOIN shows s ON t.show_id = s.id
ORDER BY t.trial_date, t.trial_number;

-- Grant permissions on recreated view
GRANT SELECT ON view_trial_summary_normalized TO anon, authenticated;

-- Step 6: Add table-level comments
COMMENT ON TABLE trials IS
'Trial/day information within a show. Counter fields removed - calculate counts on-demand using queries against classes and entries tables.';

COMMENT ON TABLE classes IS
'Class definitions within trials. All counter fields removed - calculate counts on-demand using queries against entries and results tables. See useTVData.ts and ClassList.tsx for examples.';

-- Step 7: Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 016 completed successfully';
    RAISE NOTICE 'Removed 6 counter fields from trials table';
    RAISE NOTICE 'Removed 8 counter fields from classes table';
    RAISE NOTICE 'TV display (useTVData.ts) now calculates counts on-demand from actual entry data';
    RAISE NOTICE 'ClassList continues to calculate counts on-demand (already working correctly)';
    RAISE NOTICE 'Kept: All access_*_id fields (for legacy data imports)';
END $$;
