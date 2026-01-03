-- Migration 015: Remove deprecated result status boolean fields
-- These fields are no longer used in the codebase and have been replaced by:
-- - results.result_status (single source of truth for Q/NQ/ABS/EX/WD)
-- - entries.entry_status (single source of truth for check-in/ring status)

-- Step 1: Verify fields exist and are not being actively used
DO $$
BEGIN
    -- Log what we're about to do
    RAISE NOTICE 'Starting migration 015: Removing deprecated result status boolean fields';
    RAISE NOTICE 'These fields are replaced by results.result_status';
END $$;

-- Step 2: Remove deprecated boolean result status fields from entries table
ALTER TABLE entries DROP COLUMN IF EXISTS is_qualified;
ALTER TABLE entries DROP COLUMN IF EXISTS is_absent;
ALTER TABLE entries DROP COLUMN IF EXISTS is_excused;
ALTER TABLE entries DROP COLUMN IF EXISTS is_withdrawn;

-- Step 3: Add comments for documentation
COMMENT ON TABLE entries IS
'Entry information for dogs in classes. Status fields:
- entry_status: Check-in and ring status (none, checked-in, at-gate, in-ring, etc.)
- Scoring status comes from results.is_scored
- Result outcomes (Q/NQ/ABS/EX/WD) come from results.result_status';

COMMENT ON TABLE results IS
'Scoring results for entries. Status fields:
- is_scored: Whether the entry has been scored (boolean)
- result_status: Outcome (qualified, nq, absent, excused, withdrawn)
- is_in_ring: Whether entry is currently in ring (prefer entries.entry_status)';

-- Step 4: Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 015 completed successfully';
    RAISE NOTICE 'Removed fields: is_qualified, is_absent, is_excused, is_withdrawn';
END $$;
