-- =============================================================================
-- Migration 011: Fix Exhibitor Profile RLS and Add Missing Functions
-- =============================================================================
-- Fixes:
-- 1. Adds INSERT policy for exhibitor_profiles so existing users can create profiles
-- 2. Adds get_user_permissions function for RBAC system
-- =============================================================================

-- =============================================================================
-- FIX: Add INSERT policy for exhibitor_profiles
-- =============================================================================
-- Existing users who don't have a profile (created before the auth trigger)
-- need to be able to create their own profile

CREATE POLICY "users_insert_own_profile" ON exhibitor_profiles
  FOR INSERT WITH CHECK (auth_user_id = auth.uid());

-- =============================================================================
-- ADD: get_user_permissions function for RBAC system
-- =============================================================================
-- Returns all permissions for a given user based on their roles

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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID) TO authenticated;

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 011: Fixed exhibitor profile RLS and added get_user_permissions' as status;
