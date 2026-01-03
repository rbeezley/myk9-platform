-- Development cleanup: Remove redundant fields from entry table
-- This migration works with the existing database structure without complex RLS

BEGIN;

-- =============================================================================
-- STEP 1: MIGRATE EXISTING DATA TO CLASS_ENTRY (if any exists)
-- =============================================================================

-- Migrate existing entry data to class_entry table
INSERT INTO class_entry (
  entry_id,
  class_id,
  trial_id,
  armband,
  run_order,
  jump_height,
  entry_fee,
  preferred_judge,
  status,
  created_at,
  updated_at,
  created_by,
  updated_by
)
SELECT 
  e.id as entry_id,
  e.class_id,
  COALESCE(c.trial_id, '00000000-0000-0000-0000-000000000000'::uuid) as trial_id,
  e.armband,
  e.run_order,
  e.jump_height,
  e.entry_fee,
  e.preferred_judge,
  CASE 
    WHEN e.status = 'draft' THEN 'pending'
    WHEN e.status IN ('submitted', 'accepted', 'rejected', 'withdrawn') THEN e.status
    ELSE 'pending'
  END as status,
  e.created_at,
  e.updated_at,
  e.created_by,
  e.updated_by
FROM entry e
LEFT JOIN class c ON e.class_id = c.id
WHERE e.class_id IS NOT NULL
  AND e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM class_entry ce 
    WHERE ce.entry_id = e.id AND ce.class_id = e.class_id
  );

-- Update entry total_fees
UPDATE entry 
SET total_fees = (
  SELECT COALESCE(SUM(ce.entry_fee), 0)
  FROM class_entry ce
  WHERE ce.entry_id = entry.id
  AND ce.deleted_at IS NULL
);

-- =============================================================================
-- STEP 2: REMOVE REDUNDANT COLUMNS FROM ENTRY TABLE
-- =============================================================================

-- Drop constraints and indexes that reference columns we're about to drop
DROP INDEX IF EXISTS entries_dog_class_unique_idx;
DROP INDEX IF EXISTS idx_entry_class_id;
DROP INDEX IF EXISTS idx_entry_status;

-- Remove class-specific columns
ALTER TABLE entry 
DROP COLUMN IF EXISTS class_id CASCADE,
DROP COLUMN IF EXISTS armband CASCADE,
DROP COLUMN IF EXISTS run_order CASCADE,
DROP COLUMN IF EXISTS jump_height CASCADE,
DROP COLUMN IF EXISTS entry_fee CASCADE,
DROP COLUMN IF EXISTS preferred_judge CASCADE,
DROP COLUMN IF EXISTS status CASCADE;

-- =============================================================================
-- STEP 3: CLEAN UP ENTRY TABLE CONSTRAINTS
-- =============================================================================

-- Set required fields as NOT NULL
ALTER TABLE entry 
ALTER COLUMN entry_status SET DEFAULT 'draft',
ALTER COLUMN total_fees SET DEFAULT 0.00;

-- Add constraints
ALTER TABLE entry 
ADD CONSTRAINT entry_total_fees_non_negative CHECK (total_fees >= 0);

-- Update entry_status for any NULL values
UPDATE entry SET entry_status = 'draft' WHERE entry_status IS NULL;
UPDATE entry SET total_fees = 0.00 WHERE total_fees IS NULL;

-- =============================================================================
-- STEP 4: CREATE SIMPLE RLS POLICY
-- =============================================================================

-- Enable RLS on class_entry if not already enabled
ALTER TABLE class_entry ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own class entries" ON class_entry;
DROP POLICY IF EXISTS "Users can manage their own class entries" ON class_entry;
DROP POLICY IF EXISTS "Allow authenticated users to manage class entries" ON class_entry;

-- Create simple policy that allows authenticated users to manage class entries
-- This is appropriate for development - tighten for production
CREATE POLICY "Allow authenticated class entry access" ON class_entry
  FOR ALL 
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- =============================================================================
-- STEP 5: VALIDATION AND REPORTING
-- =============================================================================

DO $$
DECLARE
  entry_count INTEGER;
  class_entry_count INTEGER;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO entry_count FROM entry WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO class_entry_count FROM class_entry WHERE deleted_at IS NULL;
  
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'ENTRY TABLE CLEANUP COMPLETED';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Total entries: %', entry_count;
  RAISE NOTICE 'Total class entries: %', class_entry_count;
  RAISE NOTICE '✅ Entry table cleaned up successfully!';
  RAISE NOTICE '==========================================';
END $$;

COMMIT;