-- Migration 017: RBAC Functions
-- =============================================================================
-- This migration adds the missing RBAC functions required by the PermissionChecker
--
-- Functions added:
-- 1. get_user_permissions(user_id, filter_scope_type, filter_scope_id) - Get all permissions for a user
-- 2. user_has_permission(user_id, permission_name, scope_type, scope_id) - Check if user has a permission
-- 3. get_user_roles(user_id) - Get all roles assigned to a user
-- 4. get_effective_permissions(user_id, filter_scope_type, filter_scope_id) - Get effective permissions with inheritance
-- =============================================================================

-- Drop ALL existing function overloads to recreate with new signatures
-- Include all possible signatures to prevent "Could not choose best candidate" errors
DROP FUNCTION IF EXISTS public.get_user_permissions(UUID);
DROP FUNCTION IF EXISTS public.get_user_permissions(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.user_has_permission(UUID, TEXT);
DROP FUNCTION IF EXISTS public.user_has_permission(UUID, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.get_user_roles(UUID);
DROP FUNCTION IF EXISTS public.get_effective_permissions(UUID);
DROP FUNCTION IF EXISTS public.get_effective_permissions(UUID, TEXT, UUID);

-- =============================================================================
-- FUNCTION 1: get_user_permissions
-- Returns all permissions for a user with optional scope filtering
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_permissions(
  user_id UUID,
  filter_scope_type TEXT DEFAULT NULL,
  filter_scope_id UUID DEFAULT NULL
)
RETURNS TABLE (
  permission_id UUID,
  permission_code TEXT,
  permission_name TEXT,
  description TEXT,
  category TEXT,
  role_id UUID,
  role_name TEXT,
  scope_type TEXT,
  scope_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    p.id as permission_id,
    p.code as permission_code,
    p.name as permission_name,
    p.description,
    p.category,
    r.id as role_id,
    r.name as role_name,
    CASE
      WHEN ur.show_id IS NOT NULL THEN 'show'
      WHEN ur.club_id IS NOT NULL THEN 'club'
      ELSE 'global'
    END as scope_type,
    COALESCE(ur.show_id, ur.club_id) as scope_id
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  JOIN public.people pe ON pe.id = ur.user_id
  WHERE pe.auth_user_id = get_user_permissions.user_id
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    -- Apply scope filters if provided
    AND (
      filter_scope_type IS NULL
      OR (
        filter_scope_type = 'show' AND ur.show_id = filter_scope_id
      )
      OR (
        filter_scope_type = 'club' AND ur.club_id = filter_scope_id
      )
      OR (
        filter_scope_type = 'global' AND ur.show_id IS NULL AND ur.club_id IS NULL
      )
    );
END;
$$;

COMMENT ON FUNCTION public.get_user_permissions(UUID, TEXT, UUID) IS
  'Returns all permissions for a user, optionally filtered by scope type and ID';

GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID, TEXT, UUID) TO anon;

-- =============================================================================
-- FUNCTION 2: user_has_permission
-- Checks if a user has a specific permission
-- =============================================================================
CREATE OR REPLACE FUNCTION public.user_has_permission(
  user_id UUID,
  permission_name TEXT,
  scope_type TEXT DEFAULT NULL,
  scope_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  has_perm BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    JOIN public.people pe ON pe.id = ur.user_id
    WHERE pe.auth_user_id = user_has_permission.user_id
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        p.code = permission_name
        OR p.name = permission_name
        -- Check for :manage permission which implies CRUD permissions
        OR (
          permission_name LIKE '%:create'
          AND p.code = REPLACE(permission_name, ':create', ':manage')
        )
        OR (
          permission_name LIKE '%:read'
          AND p.code = REPLACE(permission_name, ':read', ':manage')
        )
        OR (
          permission_name LIKE '%:update'
          AND p.code = REPLACE(permission_name, ':update', ':manage')
        )
        OR (
          permission_name LIKE '%:delete'
          AND p.code = REPLACE(permission_name, ':delete', ':manage')
        )
      )
      -- Apply scope filters
      AND (
        scope_type IS NULL
        OR (scope_type = 'show' AND ur.show_id = scope_id)
        OR (scope_type = 'club' AND ur.club_id = scope_id)
        OR (scope_type = 'global' AND ur.show_id IS NULL AND ur.club_id IS NULL)
        -- Global permissions apply to all scopes
        OR (ur.show_id IS NULL AND ur.club_id IS NULL)
      )
  ) INTO has_perm;

  RETURN has_perm;
END;
$$;

COMMENT ON FUNCTION public.user_has_permission(UUID, TEXT, TEXT, UUID) IS
  'Checks if a user has a specific permission, with optional scope filtering';

GRANT EXECUTE ON FUNCTION public.user_has_permission(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(UUID, TEXT, TEXT, UUID) TO anon;

-- =============================================================================
-- FUNCTION 3: get_user_roles
-- Returns all roles assigned to a user
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_roles(user_id UUID)
RETURNS TABLE (
  user_role_id UUID,
  role_id UUID,
  role_name TEXT,
  role_description TEXT,
  is_system BOOLEAN,
  scope_type TEXT,
  scope_id UUID,
  granted_by UUID,
  granted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ur.id as user_role_id,
    r.id as role_id,
    r.name as role_name,
    r.description as role_description,
    r.is_system,
    CASE
      WHEN ur.show_id IS NOT NULL THEN 'show'
      WHEN ur.club_id IS NOT NULL THEN 'club'
      ELSE 'global'
    END as scope_type,
    COALESCE(ur.show_id, ur.club_id) as scope_id,
    ur.granted_by,
    ur.granted_at,
    ur.expires_at,
    (ur.expires_at IS NULL OR ur.expires_at > NOW()) as is_active
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people pe ON pe.id = ur.user_id
  WHERE pe.auth_user_id = get_user_roles.user_id;
END;
$$;

COMMENT ON FUNCTION public.get_user_roles(UUID) IS
  'Returns all roles assigned to a user';

GRANT EXECUTE ON FUNCTION public.get_user_roles(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_roles(UUID) TO anon;

-- =============================================================================
-- FUNCTION 4: get_effective_permissions
-- Returns effective permissions for a user including inherited ones
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_effective_permissions(
  user_id UUID,
  filter_scope_type TEXT DEFAULT NULL,
  filter_scope_id UUID DEFAULT NULL
)
RETURNS TABLE (
  permission_name TEXT,
  permission_code TEXT,
  source_type TEXT,  -- 'direct' or 'inherited'
  source_role TEXT,
  scope_type TEXT,
  scope_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH user_permissions AS (
    -- Direct permissions from role_permissions
    SELECT DISTINCT
      p.name as perm_name,
      p.code as perm_code,
      'direct'::TEXT as src_type,
      r.name as src_role,
      CASE
        WHEN ur.show_id IS NOT NULL THEN 'show'
        WHEN ur.club_id IS NOT NULL THEN 'club'
        ELSE 'global'
      END as scp_type,
      COALESCE(ur.show_id, ur.club_id) as scp_id
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    JOIN public.people pe ON pe.id = ur.user_id
    WHERE pe.auth_user_id = get_effective_permissions.user_id
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  ),
  -- Expand :manage permissions to include CRUD
  expanded_permissions AS (
    SELECT * FROM user_permissions
    UNION ALL
    -- Generate CRUD permissions from :manage permissions
    SELECT
      REPLACE(up.perm_name, ':manage', ':' || action.name) as perm_name,
      REPLACE(up.perm_code, ':manage', ':' || action.name) as perm_code,
      'inherited'::TEXT as src_type,
      up.src_role || ' (via :manage)',
      up.scp_type,
      up.scp_id
    FROM user_permissions up
    CROSS JOIN (
      SELECT 'create' as name UNION ALL
      SELECT 'read' UNION ALL
      SELECT 'update' UNION ALL
      SELECT 'delete'
    ) action
    WHERE up.perm_code LIKE '%:manage'
  )
  SELECT DISTINCT
    ep.perm_name as permission_name,
    ep.perm_code as permission_code,
    ep.src_type as source_type,
    ep.src_role as source_role,
    ep.scp_type as scope_type,
    ep.scp_id as scope_id
  FROM expanded_permissions ep
  WHERE (
    filter_scope_type IS NULL
    OR ep.scp_type = filter_scope_type
  )
  AND (
    filter_scope_id IS NULL
    OR ep.scp_id = filter_scope_id
    OR ep.scp_id IS NULL  -- Global permissions apply everywhere
  );
END;
$$;

COMMENT ON FUNCTION public.get_effective_permissions(UUID, TEXT, UUID) IS
  'Returns effective permissions for a user including inherited ones from :manage permissions';

GRANT EXECUTE ON FUNCTION public.get_effective_permissions(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(UUID, TEXT, UUID) TO anon;

-- =============================================================================
-- Add expires_at column to user_roles if it doesn't exist
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_roles'
    AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.user_roles ADD COLUMN expires_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN public.user_roles.expires_at IS 'Optional expiration date for the role assignment';
  END IF;
END $$;

-- =============================================================================
-- Verification
-- =============================================================================
SELECT 'Migration 017: RBAC functions created successfully' as status;
