-- 067_seed_role_permissions.sql
-- Seed missing granular permissions and assign role_permissions for
-- exhibitor, secretary, judge, and club_admin roles.
--
-- Root cause: The permissions table only had :manage-level entries and
-- role_permissions only mapped to site_admin. The granular permissions
-- (dog:create, entry:create, etc.) and per-role assignments from the
-- original 002_rbac_seed_data.sql were never applied to this database.

BEGIN;

-- =============================================================================
-- 1. Insert missing granular permissions (ON CONFLICT to skip existing)
-- =============================================================================

INSERT INTO permissions (code, name, description, category) VALUES
  -- User management
  ('user:create', 'Create Users', 'Can create new user accounts', 'user'),
  ('user:read', 'View Users', 'Can view user information', 'user'),
  ('user:update', 'Update Users', 'Can modify user accounts', 'user'),
  ('user:delete', 'Delete Users', 'Can delete user accounts', 'user'),
  -- Role management
  ('role:create', 'Create Roles', 'Can create new roles', 'role'),
  ('role:read', 'View Roles', 'Can view role information', 'role'),
  ('role:update', 'Update Roles', 'Can modify role permissions', 'role'),
  ('role:delete', 'Delete Roles', 'Can delete custom roles', 'role'),
  ('role:assign', 'Assign Roles', 'Can assign roles to users', 'role'),
  -- Show (granular)
  ('show:manage', 'Manage Shows', 'Full show management', 'show'),
  -- Trial (granular)
  ('trial:create', 'Create Trials', 'Can create show trials', 'trial'),
  ('trial:read', 'View Trials', 'Can view trial information', 'trial'),
  ('trial:update', 'Update Trials', 'Can modify trial details', 'trial'),
  ('trial:delete', 'Delete Trials', 'Can delete trials', 'trial'),
  -- Class (granular)
  ('class:create', 'Create Classes', 'Can create competition classes', 'class'),
  ('class:read', 'View Classes', 'Can view class information', 'class'),
  ('class:update', 'Update Classes', 'Can modify class details', 'class'),
  ('class:delete', 'Delete Classes', 'Can delete classes', 'class'),
  -- Entry (granular)
  ('entry:create', 'Create Entries', 'Can submit show entries', 'entry'),
  ('entry:read', 'View Entries', 'Can view entry information', 'entry'),
  ('entry:update', 'Update Entries', 'Can modify entries', 'entry'),
  ('entry:delete', 'Delete Entries', 'Can delete entries', 'entry'),
  -- Dog (granular)
  ('dog:create', 'Register Dogs', 'Can register new dogs', 'dog'),
  ('dog:read', 'View Dogs', 'Can view dog information', 'dog'),
  ('dog:update', 'Update Dogs', 'Can modify dog details', 'dog'),
  ('dog:delete', 'Delete Dogs', 'Can delete dog records', 'dog'),
  -- People (granular)
  ('people:create', 'Add People', 'Can add new people records', 'people'),
  ('people:read', 'View People', 'Can view people information', 'people'),
  ('people:update', 'Update People', 'Can modify people details', 'people'),
  ('people:delete', 'Delete People', 'Can delete people records', 'people'),
  -- Club (granular)
  ('club:create', 'Create Clubs', 'Can create new clubs', 'club'),
  ('club:read', 'View Clubs', 'Can view club information', 'club'),
  ('club:update', 'Update Clubs', 'Can modify club details', 'club'),
  ('club:delete', 'Delete Clubs', 'Can delete clubs', 'club'),
  -- Judge assignments
  ('judge:assign', 'Assign Judges', 'Can assign judges to classes', 'judge'),
  ('judge:view', 'View Judge Assignments', 'Can view judge assignments', 'judge'),
  ('judge:manage', 'Manage Judges', 'Full judge assignment capabilities', 'judge'),
  -- Reports
  ('report:export', 'Export Reports', 'Can export reports to various formats', 'report'),
  ('report:manage', 'Manage Reports', 'Full report management capabilities', 'report'),
  -- Templates (granular)
  ('template:create', 'Create Templates', 'Can create show templates', 'template'),
  ('template:read', 'View Templates', 'Can view template information', 'template'),
  ('template:update', 'Update Templates', 'Can modify templates', 'template'),
  ('template:delete', 'Delete Templates', 'Can delete templates', 'template')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 2. Assign permissions to Exhibitor role
-- =============================================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'exhibitor'
AND p.code IN (
  'entry:create', 'entry:read', 'entry:update', 'entry:delete',
  'dog:create', 'dog:read', 'dog:update', 'dog:delete',
  'people:read', 'people:update',
  'show:read',
  'trial:read',
  'class:read',
  'club:read',
  'template:read'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- 3. Assign permissions to Secretary role
-- =============================================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'secretary'
AND p.code IN (
  'show:create', 'show:read', 'show:update', 'show:delete', 'show:manage',
  'trial:create', 'trial:read', 'trial:update', 'trial:delete', 'trial:manage',
  'class:create', 'class:read', 'class:update', 'class:delete', 'class:manage',
  'entry:read', 'entry:update', 'entry:manage',
  'people:create', 'people:read', 'people:update',
  'club:read', 'club:update',
  'judge:assign', 'judge:view', 'judge:manage',
  'report:generate', 'report:export',
  'template:create', 'template:read', 'template:update', 'template:delete', 'template:manage',
  'dog:read'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- 4. Assign permissions to Judge role
-- =============================================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'judge'
AND p.code IN (
  'judge:view',
  'show:read',
  'trial:read',
  'class:read',
  'entry:read',
  'dog:read',
  'people:read',
  'club:read',
  'report:generate'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- 5. Assign permissions to Club Admin role
-- =============================================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'club_admin'
AND p.code IN (
  'club:read', 'club:update', 'club:manage',
  'show:create', 'show:read', 'show:update', 'show:manage',
  'trial:create', 'trial:read', 'trial:update', 'trial:manage',
  'class:create', 'class:read', 'class:update', 'class:manage',
  'entry:read', 'entry:manage',
  'people:read', 'people:create',
  'judge:assign', 'judge:view',
  'report:generate', 'report:export',
  'template:create', 'template:read', 'template:update', 'template:manage',
  'dog:read'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- 6. Grant new granular permissions to site_admin too
--    (site_admin already has :manage which implies CRUD via the RPC,
--     but having explicit entries avoids edge cases)
-- =============================================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'site_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
