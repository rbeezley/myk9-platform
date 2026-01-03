-- RBAC System Database Functions
-- Phase 2.4: Database functions for permission checks
-- Created: December 2024

-- Function to check if a user has a specific permission
CREATE OR REPLACE FUNCTION public.user_has_permission(
  user_id UUID,
  permission_name TEXT,
  scope_type TEXT DEFAULT NULL,
  scope_id TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = user_has_permission.user_id
      AND p.name = permission_name
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        -- Global permission (no scope restrictions)
        (ur.scope_type IS NULL)
        OR 
        -- Scoped permission matches request
        (ur.scope_type = user_has_permission.scope_type AND ur.scope_id = user_has_permission.scope_id)
        OR
        -- Admin permissions override scope restrictions
        EXISTS (
          SELECT 1
          FROM public.user_roles ur2
          JOIN public.role_permissions rp2 ON ur2.role_id = rp2.role_id
          JOIN public.permissions p2 ON rp2.permission_id = p2.id
          WHERE ur2.user_id = user_has_permission.user_id
            AND p2.name = 'admin:manage'
            AND ur2.is_active = true
            AND (ur2.expires_at IS NULL OR ur2.expires_at > NOW())
        )
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all permissions for a user
CREATE OR REPLACE FUNCTION public.get_user_permissions(
  user_id UUID,
  filter_scope_type TEXT DEFAULT NULL,
  filter_scope_id TEXT DEFAULT NULL
) RETURNS TABLE (
  permission_name TEXT,
  permission_display_name TEXT,
  resource TEXT,
  action TEXT,
  role_name TEXT,
  role_display_name TEXT,
  scope_type TEXT,
  scope_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    p.name::TEXT as permission_name,
    p.display_name::TEXT as permission_display_name,
    p.resource::TEXT,
    p.action::TEXT,
    r.name::TEXT as role_name,
    r.display_name::TEXT as role_display_name,
    ur.scope_type::TEXT,
    ur.scope_id::TEXT
  FROM public.user_roles ur
  JOIN public.roles r ON ur.role_id = r.id
  JOIN public.role_permissions rp ON r.id = rp.role_id
  JOIN public.permissions p ON rp.permission_id = p.id
  WHERE ur.user_id = get_user_permissions.user_id
    AND ur.is_active = true
    AND r.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND (
      get_user_permissions.filter_scope_type IS NULL
      OR ur.scope_type IS NULL
      OR (ur.scope_type = get_user_permissions.filter_scope_type AND ur.scope_id = get_user_permissions.filter_scope_id)
    )
  ORDER BY p.resource, p.action, r.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all roles for a user
CREATE OR REPLACE FUNCTION public.get_user_roles(
  user_id UUID
) RETURNS TABLE (
  role_id UUID,
  role_name TEXT,
  role_display_name TEXT,
  scope_type TEXT,
  scope_id TEXT,
  assigned_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id as role_id,
    r.name::TEXT as role_name,
    r.display_name::TEXT as role_display_name,
    ur.scope_type::TEXT,
    ur.scope_id::TEXT,
    ur.assigned_at,
    ur.expires_at,
    ur.is_active
  FROM public.user_roles ur
  JOIN public.roles r ON ur.role_id = r.id
  WHERE ur.user_id = get_user_roles.user_id
  ORDER BY ur.assigned_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to assign a role to a user
CREATE OR REPLACE FUNCTION public.assign_user_role(
  target_user_id UUID,
  role_name TEXT,
  scope_type TEXT DEFAULT NULL,
  scope_id TEXT DEFAULT NULL,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  assigned_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  role_record RECORD;
  assignment_id UUID;
BEGIN
  -- Get the role ID
  SELECT id, name, display_name INTO role_record
  FROM public.roles
  WHERE name = role_name AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role % not found or not active', role_name;
  END IF;
  
  -- Insert the user role assignment
  INSERT INTO public.user_roles (user_id, role_id, scope_type, scope_id, expires_at, assigned_by)
  VALUES (target_user_id, role_record.id, scope_type, scope_id, expires_at, assigned_by_user_id)
  ON CONFLICT (user_id, role_id, scope_type, scope_id) 
  DO UPDATE SET 
    is_active = true,
    expires_at = EXCLUDED.expires_at,
    assigned_at = NOW(),
    assigned_by = EXCLUDED.assigned_by
  RETURNING id INTO assignment_id;
  
  -- Log the assignment
  INSERT INTO public.permission_audit_log (
    action_type, 
    actor_id, 
    target_user_id, 
    target_role_id,
    scope_type,
    scope_id,
    details
  ) VALUES (
    'role_assigned',
    assigned_by_user_id,
    target_user_id,
    role_record.id,
    scope_type,
    scope_id,
    jsonb_build_object(
      'role_name', role_name,
      'expires_at', expires_at
    )
  );
  
  RETURN assignment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke a role from a user
CREATE OR REPLACE FUNCTION public.revoke_user_role(
  target_user_id UUID,
  role_name TEXT,
  scope_type TEXT DEFAULT NULL,
  scope_id TEXT DEFAULT NULL,
  revoked_by_user_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  role_record RECORD;
  affected_rows INTEGER;
BEGIN
  -- Get the role ID
  SELECT id, name, display_name INTO role_record
  FROM public.roles
  WHERE name = role_name;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role % not found', role_name;
  END IF;
  
  -- Update the user role assignment to inactive
  UPDATE public.user_roles
  SET is_active = false
  WHERE user_id = target_user_id
    AND role_id = role_record.id
    AND (scope_type IS NULL OR scope_type = revoke_user_role.scope_type)
    AND (scope_id IS NULL OR scope_id = revoke_user_role.scope_id);
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  
  IF affected_rows > 0 THEN
    -- Log the revocation
    INSERT INTO public.permission_audit_log (
      action_type, 
      actor_id, 
      target_user_id, 
      target_role_id,
      scope_type,
      scope_id,
      details
    ) VALUES (
      'role_revoked',
      revoked_by_user_id,
      target_user_id,
      role_record.id,
      scope_type,
      scope_id,
      jsonb_build_object('role_name', role_name)
    );
    
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is site admin
CREATE OR REPLACE FUNCTION public.is_site_admin(
  user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.user_has_permission(user_id, 'admin:manage');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get permission hierarchy (for inheritance)
CREATE OR REPLACE FUNCTION public.get_effective_permissions(
  user_id UUID,
  filter_scope_type TEXT DEFAULT NULL,
  filter_scope_id TEXT DEFAULT NULL
) RETURNS TABLE (permission_name TEXT) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE permission_hierarchy AS (
    -- Base permissions
    SELECT DISTINCT p.name as permission_name
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = get_effective_permissions.user_id
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        ur.scope_type IS NULL
        OR (ur.scope_type = get_effective_permissions.filter_scope_type AND ur.scope_id = get_effective_permissions.filter_scope_id)
      )
    
    UNION ALL
    
    -- Inherited permissions (manage implies all CRUD operations)
    SELECT DISTINCT 
      CASE 
        WHEN ph.permission_name LIKE '%:manage' THEN 
          REPLACE(ph.permission_name, ':manage', ':create')
        ELSE ph.permission_name
      END
    FROM permission_hierarchy ph
    WHERE ph.permission_name LIKE '%:manage'
    
    UNION ALL
    
    SELECT DISTINCT 
      CASE 
        WHEN ph.permission_name LIKE '%:manage' THEN 
          REPLACE(ph.permission_name, ':manage', ':read')
        ELSE ph.permission_name
      END
    FROM permission_hierarchy ph
    WHERE ph.permission_name LIKE '%:manage'
    
    UNION ALL
    
    SELECT DISTINCT 
      CASE 
        WHEN ph.permission_name LIKE '%:manage' THEN 
          REPLACE(ph.permission_name, ':manage', ':update')
        ELSE ph.permission_name
      END
    FROM permission_hierarchy ph
    WHERE ph.permission_name LIKE '%:manage'
    
    UNION ALL
    
    SELECT DISTINCT 
      CASE 
        WHEN ph.permission_name LIKE '%:manage' THEN 
          REPLACE(ph.permission_name, ':manage', ':delete')
        ELSE ph.permission_name
      END
    FROM permission_hierarchy ph
    WHERE ph.permission_name LIKE '%:manage'
  )
  SELECT DISTINCT ph.permission_name::TEXT
  FROM permission_hierarchy ph
  ORDER BY ph.permission_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.user_has_permission(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_roles(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_user_role(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_role(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_site_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(UUID, TEXT, TEXT) TO authenticated;