-- Create RBAC System Migration
-- Addresses missing RBAC tables and functions causing Browse Shows loading issues

-- Create role table
CREATE TABLE IF NOT EXISTS public.role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create user_role junction table  
CREATE TABLE IF NOT EXISTS public.user_role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.role(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  assigned_by UUID REFERENCES public.user(id),
  UNIQUE(user_id, role_id)
);

-- Legacy user_roles table for compatibility
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create permission table
CREATE TABLE IF NOT EXISTS public.permission (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  resource_type TEXT,
  action TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create role_permission junction table
CREATE TABLE IF NOT EXISTS public.role_permission (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.role(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permission(id) ON DELETE CASCADE,
  scope_type TEXT DEFAULT 'global',
  scope_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(role_id, permission_id, scope_type, scope_id)
);

-- Create user_permission table for direct user permissions
CREATE TABLE IF NOT EXISTS public.user_permission (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permission(id) ON DELETE CASCADE,
  scope_type TEXT DEFAULT 'global',
  scope_id TEXT,
  is_active BOOLEAN DEFAULT true,
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  granted_by UUID REFERENCES public.user(id),
  UNIQUE(user_id, permission_id, scope_type, scope_id)
);

-- Create get_user_permissions function
CREATE OR REPLACE FUNCTION public.get_user_permissions(
  p_user_id UUID,
  p_scope_type TEXT DEFAULT 'global',
  p_scope_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  permission_name TEXT,
  permission_display_name TEXT,
  resource_type TEXT,
  action TEXT,
  scope_type TEXT,
  scope_id TEXT,
  source TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return permissions from role assignments
  RETURN QUERY
  SELECT 
    p.name as permission_name,
    p.display_name as permission_display_name,
    p.resource_type,
    p.action,
    rp.scope_type,
    rp.scope_id,
    'role'::TEXT as source
  FROM public.permission p
  JOIN public.role_permission rp ON p.id = rp.permission_id
  JOIN public.role r ON rp.role_id = r.id
  JOIN public.user_role ur ON r.id = ur.role_id
  WHERE ur.user_id = p_user_id
    AND ur.is_active = true
    AND r.is_active = true
    AND rp.is_active = true
    AND p.is_active = true
    AND (p_scope_type IS NULL OR rp.scope_type = p_scope_type)
    AND (p_scope_id IS NULL OR rp.scope_id = p_scope_id OR rp.scope_id IS NULL);

  -- Return direct user permissions
  RETURN QUERY
  SELECT 
    p.name as permission_name,
    p.display_name as permission_display_name,
    p.resource_type,
    p.action,
    up.scope_type,
    up.scope_id,
    'user'::TEXT as source
  FROM public.permission p
  JOIN public.user_permission up ON p.id = up.permission_id
  WHERE up.user_id = p_user_id
    AND up.is_active = true
    AND p.is_active = true
    AND (p_scope_type IS NULL OR up.scope_type = p_scope_type)
    AND (p_scope_id IS NULL OR up.scope_id = p_scope_id OR up.scope_id IS NULL);
END;
$$;

-- Insert default roles
INSERT INTO public.role (name, display_name, description) VALUES
  ('exhibitor', 'Exhibitor', 'Dog show exhibitor with entry and viewing permissions'),
  ('secretary', 'Secretary', 'Show secretary with management permissions'),
  ('judge', 'Judge', 'Show judge with judging permissions'),
  ('club_admin', 'Club Admin', 'Club administrator with club management permissions'),
  ('site_admin', 'Site Admin', 'Site administrator with full system permissions')
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions
INSERT INTO public.permission (name, display_name, description, resource_type, action) VALUES
  ('show.view', 'View Shows', 'View show information', 'show', 'view'),
  ('show.create', 'Create Shows', 'Create new shows', 'show', 'create'),
  ('show.update', 'Update Shows', 'Update show information', 'show', 'update'),
  ('show.delete', 'Delete Shows', 'Delete shows', 'show', 'delete'),
  ('entry.view', 'View Entries', 'View entry information', 'entry', 'view'),
  ('entry.create', 'Create Entries', 'Create new entries', 'entry', 'create'),
  ('entry.update', 'Update Entries', 'Update entry information', 'entry', 'update'),
  ('entry.delete', 'Delete Entries', 'Delete entries', 'entry', 'delete'),
  ('judge.view_assignments', 'View Judge Assignments', 'View judging assignments', 'judge', 'view_assignments'),
  ('judge.enter_results', 'Enter Results', 'Enter judging results', 'judge', 'enter_results')
ON CONFLICT (name) DO NOTHING;

-- Grant basic permissions to roles
DO $$
DECLARE 
  exhibitor_role_id UUID;
  secretary_role_id UUID;
  judge_role_id UUID;
  club_admin_role_id UUID;
  site_admin_role_id UUID;
BEGIN
  -- Get role IDs
  SELECT id INTO exhibitor_role_id FROM public.role WHERE name = 'exhibitor';
  SELECT id INTO secretary_role_id FROM public.role WHERE name = 'secretary';
  SELECT id INTO judge_role_id FROM public.role WHERE name = 'judge';
  SELECT id INTO club_admin_role_id FROM public.role WHERE name = 'club_admin';
  SELECT id INTO site_admin_role_id FROM public.role WHERE name = 'site_admin';

  -- Exhibitor permissions
  INSERT INTO public.role_permission (role_id, permission_id) 
  SELECT exhibitor_role_id, id FROM public.permission 
  WHERE name IN ('show.view', 'entry.view', 'entry.create', 'entry.update')
  ON CONFLICT DO NOTHING;

  -- Secretary permissions (includes exhibitor permissions)
  INSERT INTO public.role_permission (role_id, permission_id)
  SELECT secretary_role_id, id FROM public.permission 
  WHERE name IN ('show.view', 'show.create', 'show.update', 'entry.view', 'entry.create', 'entry.update', 'entry.delete')
  ON CONFLICT DO NOTHING;

  -- Judge permissions
  INSERT INTO public.role_permission (role_id, permission_id)
  SELECT judge_role_id, id FROM public.permission 
  WHERE name IN ('show.view', 'judge.view_assignments', 'judge.enter_results')
  ON CONFLICT DO NOTHING;

  -- Club admin permissions (includes secretary permissions)
  INSERT INTO public.role_permission (role_id, permission_id)
  SELECT club_admin_role_id, id FROM public.permission 
  WHERE name IN ('show.view', 'show.create', 'show.update', 'show.delete', 'entry.view', 'entry.create', 'entry.update', 'entry.delete')
  ON CONFLICT DO NOTHING;

  -- Site admin permissions (all permissions)
  INSERT INTO public.role_permission (role_id, permission_id)
  SELECT site_admin_role_id, id FROM public.permission
  ON CONFLICT DO NOTHING;
END $$;

-- Grant permissions for RBAC system access
GRANT SELECT ON public.role TO authenticated, anon;
GRANT SELECT ON public.user_role TO authenticated, anon;
GRANT SELECT ON public.user_roles TO authenticated, anon;
GRANT SELECT ON public.permission TO authenticated, anon;
GRANT SELECT ON public.role_permission TO authenticated, anon;
GRANT SELECT ON public.user_permission TO authenticated, anon;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID, TEXT, TEXT) TO authenticated, anon;

-- Add comments for documentation
COMMENT ON TABLE public.role IS 'System roles for RBAC';
COMMENT ON TABLE public.user_role IS 'User role assignments';
COMMENT ON TABLE public.user_roles IS 'Legacy user roles table for compatibility';
COMMENT ON TABLE public.permission IS 'System permissions';
COMMENT ON TABLE public.role_permission IS 'Role permission assignments';
COMMENT ON TABLE public.user_permission IS 'Direct user permission assignments';
COMMENT ON FUNCTION public.get_user_permissions(UUID, TEXT, TEXT) IS 'Get all permissions for a user from roles and direct assignments';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_role_user_id ON public.user_role(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_role_role_id ON public.user_role(role_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_role_permission_role_id ON public.role_permission(role_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_permission_user_id ON public.user_permission(user_id) WHERE is_active = true;