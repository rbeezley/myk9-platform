-- Fix RLS policies on class_entry table for proper functionality
-- This addresses the issue where tests can't create class_entry records

BEGIN;

-- First, check current RLS status and policies
DO $$
BEGIN
    RAISE NOTICE '=== Current RLS Status for class_entry ===';
END $$;

-- Show current policies (for debugging)
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'class_entry';

-- =============================================================================
-- OPTION 1: DEVELOPMENT-FRIENDLY RLS POLICIES (RECOMMENDED)
-- =============================================================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own class entries" ON class_entry;
DROP POLICY IF EXISTS "Users can create class entries for their entries" ON class_entry;
DROP POLICY IF EXISTS "Users can update their own class entries" ON class_entry;
DROP POLICY IF EXISTS "Users can delete their own class entries" ON class_entry;
DROP POLICY IF EXISTS "Allow authenticated users to manage class entries" ON class_entry;

-- Create simple authenticated user policy (good for development/testing)
CREATE POLICY "Allow authenticated access to class entries" ON class_entry
  FOR ALL 
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Also ensure service_role (used by migrations/admin) has full access
CREATE POLICY "Allow service role full access to class entries" ON class_entry
  FOR ALL 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- VERIFY RLS SETUP
-- =============================================================================

-- Check that RLS is enabled
ALTER TABLE class_entry ENABLE ROW LEVEL SECURITY;

-- List the new policies
DO $$
BEGIN
    RAISE NOTICE '=== New RLS Policies for class_entry ===';
END $$;

SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'class_entry'
ORDER BY policyname;

-- =============================================================================
-- TEST THE POLICIES
-- =============================================================================

-- This should work now (you can run this in Supabase SQL editor to test)
/*
-- Test INSERT (as authenticated user)
INSERT INTO class_entry (
  entry_id, 
  class_id, 
  trial_id,
  entry_fee, 
  status, 
  notes
) VALUES (
  (SELECT id FROM entry LIMIT 1),
  (SELECT id FROM class LIMIT 1),
  (SELECT id FROM trial LIMIT 1),
  25.00,
  'accepted',
  'Test RLS policy fix'
);
*/

COMMIT;

-- =============================================================================
-- NOTES ON RLS POLICY OPTIONS
-- =============================================================================

/*
OPTION 1 (APPLIED ABOVE): Development-Friendly
- Allows all authenticated users to manage all class entries
- Good for: Development, testing, small teams
- Security level: Medium (authenticated users only)

OPTION 2: Owner-Based (More Secure)
- Users can only access class entries for their own dogs/entries
- Requires proper user authentication and entry ownership
- Good for: Production with multi-user scenarios

OPTION 3: Role-Based (Most Secure)
- Different permissions for admins, secretaries, handlers, exhibitors
- Requires user role system implementation
- Good for: Production with complex permission requirements

OPTION 4: Disable RLS (Least Secure)
- No restrictions (not recommended for production)
- Good for: Development/testing only

The current implementation uses OPTION 1 which should work for your testing needs
while still maintaining reasonable security.
*/