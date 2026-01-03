-- RBAC System Seed Data
-- Phase 2.6: Seed script for existing role/permission data
-- Created: December 2024

-- Insert system roles
INSERT INTO public.roles (name, display_name, description, is_system) VALUES
  ('site_admin', 'Site Administrator', 'Full system access and administration capabilities', true),
  ('secretary', 'Show Secretary', 'Can manage shows, entries, and registrations', true),
  ('exhibitor', 'Exhibitor', 'Can register dogs and manage entries', true),
  ('judge', 'Judge', 'Can view assignments and submit results', true);

-- Insert system permissions
INSERT INTO public.permissions (name, display_name, description, resource, action, is_system) VALUES
  -- Admin permissions
  ('admin:manage', 'Manage Administration', 'Full administrative access', 'admin', 'manage', true),
  ('admin:view', 'View Admin Panel', 'Access to admin interface', 'admin', 'view', true),
  
  -- User management permissions
  ('user:create', 'Create Users', 'Can create new user accounts', 'user', 'create', true),
  ('user:read', 'View Users', 'Can view user information', 'user', 'read', true),
  ('user:update', 'Update Users', 'Can modify user accounts', 'user', 'update', true),
  ('user:delete', 'Delete Users', 'Can delete user accounts', 'user', 'delete', true),
  ('user:manage', 'Manage Users', 'Full user management capabilities', 'user', 'manage', true),
  
  -- Role and permission management
  ('role:create', 'Create Roles', 'Can create new roles', 'role', 'create', true),
  ('role:read', 'View Roles', 'Can view role information', 'role', 'read', true),
  ('role:update', 'Update Roles', 'Can modify role permissions', 'role', 'update', true),
  ('role:delete', 'Delete Roles', 'Can delete custom roles', 'role', 'delete', true),
  ('role:assign', 'Assign Roles', 'Can assign roles to users', 'role', 'assign', true),
  
  -- Show management permissions
  ('show:create', 'Create Shows', 'Can create new dog shows', 'show', 'create', true),
  ('show:read', 'View Shows', 'Can view show information', 'show', 'read', true),
  ('show:update', 'Update Shows', 'Can modify show details', 'show', 'update', true),
  ('show:delete', 'Delete Shows', 'Can delete shows', 'show', 'delete', true),
  ('show:manage', 'Manage Shows', 'Full show management capabilities', 'show', 'manage', true),
  
  -- Trial management permissions
  ('trial:create', 'Create Trials', 'Can create show trials', 'trial', 'create', true),
  ('trial:read', 'View Trials', 'Can view trial information', 'trial', 'read', true),
  ('trial:update', 'Update Trials', 'Can modify trial details', 'trial', 'update', true),
  ('trial:delete', 'Delete Trials', 'Can delete trials', 'trial', 'delete', true),
  ('trial:manage', 'Manage Trials', 'Full trial management capabilities', 'trial', 'manage', true),
  
  -- Class management permissions
  ('class:create', 'Create Classes', 'Can create competition classes', 'class', 'create', true),
  ('class:read', 'View Classes', 'Can view class information', 'class', 'read', true),
  ('class:update', 'Update Classes', 'Can modify class details', 'class', 'update', true),
  ('class:delete', 'Delete Classes', 'Can delete classes', 'class', 'delete', true),
  ('class:manage', 'Manage Classes', 'Full class management capabilities', 'class', 'manage', true),
  
  -- Entry management permissions
  ('entry:create', 'Create Entries', 'Can submit show entries', 'entry', 'create', true),
  ('entry:read', 'View Entries', 'Can view entry information', 'entry', 'read', true),
  ('entry:update', 'Update Entries', 'Can modify entries', 'entry', 'update', true),
  ('entry:delete', 'Delete Entries', 'Can delete entries', 'entry', 'delete', true),
  ('entry:manage', 'Manage Entries', 'Full entry management capabilities', 'entry', 'manage', true),
  
  -- Dog management permissions
  ('dog:create', 'Register Dogs', 'Can register new dogs', 'dog', 'create', true),
  ('dog:read', 'View Dogs', 'Can view dog information', 'dog', 'read', true),
  ('dog:update', 'Update Dogs', 'Can modify dog details', 'dog', 'update', true),
  ('dog:delete', 'Delete Dogs', 'Can delete dog records', 'dog', 'delete', true),
  ('dog:manage', 'Manage Dogs', 'Full dog management capabilities', 'dog', 'manage', true),
  
  -- People management permissions
  ('people:create', 'Add People', 'Can add new people records', 'people', 'create', true),
  ('people:read', 'View People', 'Can view people information', 'people', 'read', true),
  ('people:update', 'Update People', 'Can modify people details', 'people', 'update', true),
  ('people:delete', 'Delete People', 'Can delete people records', 'people', 'delete', true),
  ('people:manage', 'Manage People', 'Full people management capabilities', 'people', 'manage', true),
  
  -- Club management permissions
  ('club:create', 'Create Clubs', 'Can create new clubs', 'club', 'create', true),
  ('club:read', 'View Clubs', 'Can view club information', 'club', 'read', true),
  ('club:update', 'Update Clubs', 'Can modify club details', 'club', 'update', true),
  ('club:delete', 'Delete Clubs', 'Can delete clubs', 'club', 'delete', true),
  ('club:manage', 'Manage Clubs', 'Full club management capabilities', 'club', 'manage', true),
  
  -- Judge assignment permissions
  ('judge:assign', 'Assign Judges', 'Can assign judges to classes', 'judge', 'assign', true),
  ('judge:view', 'View Judge Assignments', 'Can view judge assignments', 'judge', 'view', true),
  ('judge:manage', 'Manage Judge Assignments', 'Full judge assignment capabilities', 'judge', 'manage', true),
  
  -- Report generation permissions
  ('report:generate', 'Generate Reports', 'Can generate and view reports', 'report', 'generate', true),
  ('report:export', 'Export Reports', 'Can export reports to various formats', 'report', 'export', true),
  ('report:manage', 'Manage Reports', 'Full report management capabilities', 'report', 'manage', true),
  
  -- Template management permissions
  ('template:create', 'Create Templates', 'Can create show templates', 'template', 'create', true),
  ('template:read', 'View Templates', 'Can view template information', 'template', 'read', true),
  ('template:update', 'Update Templates', 'Can modify templates', 'template', 'update', true),
  ('template:delete', 'Delete Templates', 'Can delete templates', 'template', 'delete', true),
  ('template:manage', 'Manage Templates', 'Full template management capabilities', 'template', 'manage', true);

-- Assign permissions to Site Admin role (gets all permissions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'site_admin';

-- Assign permissions to Secretary role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'secretary'
AND p.name IN (
  -- Show management
  'show:create', 'show:read', 'show:update', 'show:delete', 'show:manage',
  -- Trial management
  'trial:create', 'trial:read', 'trial:update', 'trial:delete', 'trial:manage',
  -- Class management
  'class:create', 'class:read', 'class:update', 'class:delete', 'class:manage',
  -- Entry management
  'entry:read', 'entry:update', 'entry:manage',
  -- People management (limited)
  'people:create', 'people:read', 'people:update',
  -- Club management (limited)
  'club:read', 'club:update',
  -- Judge assignment
  'judge:assign', 'judge:view', 'judge:manage',
  -- Report generation
  'report:generate', 'report:export',
  -- Template management
  'template:create', 'template:read', 'template:update', 'template:delete', 'template:manage',
  -- Dog viewing
  'dog:read'
);

-- Assign permissions to Exhibitor role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'exhibitor'
AND p.name IN (
  -- Entry management
  'entry:create', 'entry:read', 'entry:update', 'entry:delete',
  -- Dog management (own dogs only)
  'dog:create', 'dog:read', 'dog:update', 'dog:delete',
  -- People management (own profile only)
  'people:read', 'people:update',
  -- Show viewing
  'show:read',
  -- Trial viewing
  'trial:read',
  -- Class viewing
  'class:read',
  -- Club viewing
  'club:read',
  -- Template viewing
  'template:read'
);

-- Assign permissions to Judge role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'judge'
AND p.name IN (
  -- Judge assignments
  'judge:view',
  -- Show viewing
  'show:read',
  -- Trial viewing
  'trial:read',
  -- Class viewing
  'class:read',
  -- Entry viewing
  'entry:read',
  -- Dog viewing
  'dog:read',
  -- People viewing
  'people:read',
  -- Club viewing
  'club:read',
  -- Report generation
  'report:generate'
);

-- Create audit log entry for seed data creation
INSERT INTO public.permission_audit_log (action_type, details)
VALUES ('seed_data_created', '{"message": "Initial RBAC seed data created", "roles_created": 4, "permissions_created": 57}');