-- =============================================================================
-- Migration 012: Fix Remaining Profile Issues
-- =============================================================================
-- Fixes:
-- 1. Ensure get_user_permissions function exists and is accessible
-- 2. Add unique constraint on exhibitor_profiles.auth_user_id to prevent duplicates
-- 3. Clean up any duplicate exhibitor_profiles if they exist
-- =============================================================================

-- =============================================================================
-- STEP 1: Recreate get_user_permissions function with proper grants
-- =============================================================================
-- Drop existing function if it exists (to ensure clean state)
DROP FUNCTION IF EXISTS public.get_user_permissions(UUID);

-- Create the function
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID)
RETURNS TABLE (
  permission_code TEXT,
  permission_name TEXT,
  category TEXT,
  role_name TEXT,
  club_id UUID,
  show_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    p.code as permission_code,
    p.name as permission_name,
    p.category,
    r.name as role_name,
    ur.club_id,
    ur.show_id
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  JOIN role_permissions rp ON rp.role_id = r.id
  JOIN permissions p ON p.id = rp.permission_id
  JOIN people pe ON pe.id = ur.user_id
  WHERE pe.auth_user_id = p_user_id
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO anon;

-- =============================================================================
-- STEP 2: Add unique constraint on auth_user_id if not exists
-- =============================================================================
-- This prevents duplicate exhibitor_profiles for the same user

DO $$
BEGIN
  -- Check if unique constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exhibitor_profiles_auth_user_id_key'
  ) THEN
    -- First, clean up any duplicates (keep the oldest one)
    DELETE FROM exhibitor_profiles ep1
    WHERE EXISTS (
      SELECT 1 FROM exhibitor_profiles ep2
      WHERE ep2.auth_user_id = ep1.auth_user_id
        AND ep2.created_at < ep1.created_at
    );

    -- Now add the unique constraint
    ALTER TABLE exhibitor_profiles
    ADD CONSTRAINT exhibitor_profiles_auth_user_id_key UNIQUE (auth_user_id);
  END IF;
END $$;

-- =============================================================================
-- STEP 3: Ensure people table has unique constraint on auth_user_id
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'people_auth_user_id_key'
  ) THEN
    -- Clean up any duplicate people records (keep the oldest one)
    DELETE FROM people p1
    WHERE p1.auth_user_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM people p2
        WHERE p2.auth_user_id = p1.auth_user_id
          AND p2.created_at < p1.created_at
      );

    -- Add unique constraint
    ALTER TABLE people
    ADD CONSTRAINT people_auth_user_id_key UNIQUE (auth_user_id);
  END IF;
END $$;

-- =============================================================================
-- STEP 4: Ensure RLS policies allow reading own profile correctly
-- =============================================================================
-- Drop and recreate the SELECT policy to ensure it's correct
DROP POLICY IF EXISTS "users_view_own_profile" ON exhibitor_profiles;

CREATE POLICY "users_view_own_profile" ON exhibitor_profiles
  FOR SELECT USING (auth_user_id = auth.uid());

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 012: Fixed remaining profile issues' as status;
