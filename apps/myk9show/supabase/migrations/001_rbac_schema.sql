-- RBAC System Database Schema
-- Phase 2.1: Database-Driven Permissions
-- Created: December 2024

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Role definitions table
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false, -- System roles can't be deleted
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Permission definitions table
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'show:create'
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  resource VARCHAR(50) NOT NULL, -- e.g., 'show', 'dog', 'club'
  action VARCHAR(50) NOT NULL, -- e.g., 'create', 'read', 'update', 'delete'
  is_system BOOLEAN DEFAULT false, -- System permissions can't be deleted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Role-Permission mapping table
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);

-- User role assignments table (with scope support)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
  scope_type VARCHAR(50), -- 'global', 'club', 'show', null for global
  scope_id VARCHAR(100), -- ID of the scoped resource
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, role_id, scope_type, scope_id)
);

-- Permission change audit log
CREATE TABLE public.permission_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_type VARCHAR(50) NOT NULL, -- 'grant', 'revoke', 'create_role', etc.
  actor_id UUID REFERENCES auth.users(id),
  target_role_id UUID REFERENCES public.roles(id),
  target_permission_id UUID REFERENCES public.permissions(id),
  target_user_id UUID REFERENCES auth.users(id),
  scope_type VARCHAR(50),
  scope_id VARCHAR(100),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_roles_name ON public.roles(name);
CREATE INDEX idx_roles_is_system ON public.roles(is_system);
CREATE INDEX idx_permissions_name ON public.permissions(name);
CREATE INDEX idx_permissions_resource_action ON public.permissions(resource, action);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON public.user_roles(role_id);
CREATE INDEX idx_user_roles_scope ON public.user_roles(scope_type, scope_id);
CREATE INDEX idx_user_roles_active ON public.user_roles(is_active) WHERE is_active = true;
CREATE INDEX idx_role_permissions_role_id ON public.role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON public.role_permissions(permission_id);
CREATE INDEX idx_permission_audit_created_at ON public.permission_audit_log(created_at DESC);
CREATE INDEX idx_permission_audit_actor ON public.permission_audit_log(actor_id);
CREATE INDEX idx_permission_audit_target_user ON public.permission_audit_log(target_user_id);

-- Add updated_at trigger for roles table
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_roles_updated_at 
    BEFORE UPDATE ON public.roles 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for roles table
CREATE POLICY "Roles are viewable by authenticated users" ON public.roles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Roles can be managed by site admins" ON public.roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'site_admin'
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    )
  );

-- RLS Policies for permissions table
CREATE POLICY "Permissions are viewable by authenticated users" ON public.permissions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permissions can be managed by site admins" ON public.permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'site_admin'
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    )
  );

-- RLS Policies for role_permissions table
CREATE POLICY "Role permissions are viewable by authenticated users" ON public.role_permissions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Role permissions can be managed by site admins" ON public.role_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'site_admin'
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    )
  );

-- RLS Policies for user_roles table
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Site admins can view and manage all user roles" ON public.user_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'site_admin'
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    )
  );

-- RLS Policies for audit log
CREATE POLICY "Audit logs are viewable by site admins" ON public.permission_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'site_admin'
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    )
  );

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;