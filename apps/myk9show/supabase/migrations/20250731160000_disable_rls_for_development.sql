-- Temporarily disable RLS on class_entry for development/testing
-- This allows full access for development and testing purposes

BEGIN;

-- =============================================================================
-- OPTION A: DISABLE RLS COMPLETELY (SIMPLEST FOR DEVELOPMENT)
-- =============================================================================

-- Disable RLS on class_entry table
ALTER TABLE class_entry DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies (they're not needed when RLS is disabled)
DROP POLICY IF EXISTS "Allow authenticated access to class entries" ON class_entry;
DROP POLICY IF EXISTS "Allow service role full access to class entries" ON class_entry;

-- Report the change
DO $$
BEGIN
    RAISE NOTICE '=== RLS DISABLED on class_entry table ===';
    RAISE NOTICE 'This allows full access for development and testing.';
    RAISE NOTICE 'Re-enable RLS for production deployment.';
END $$;

-- =============================================================================
-- VERIFY THE CHANGE
-- =============================================================================

-- Check RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN 'RLS ENABLED' 
    ELSE 'RLS DISABLED' 
  END as status
FROM pg_tables 
WHERE tablename = 'class_entry' AND schemaname = 'public';

-- Check policies (should be empty now)
SELECT 
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) = 0 THEN 'No policies (expected when RLS disabled)'
    ELSE CONCAT(COUNT(*)::text, ' policies found')
  END as policy_status
FROM pg_policies 
WHERE tablename = 'class_entry';

COMMIT;

-- =============================================================================
-- NOTES FOR PRODUCTION
-- =============================================================================

/*
TO RE-ENABLE RLS FOR PRODUCTION, run:

ALTER TABLE class_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own class entries" ON class_entry
  FOR ALL USING (
    entry_id IN (
      SELECT id FROM entry 
      WHERE created_by = auth.uid() 
         OR handler_id = auth.uid()
         OR dog_id IN (SELECT id FROM dog WHERE owner_id = auth.uid())
    )
  );

This approach:
1. Disables RLS for development/testing (allows all operations)
2. Provides production-ready policy for when you're ready to deploy
3. Maintains security model design for future use
*/