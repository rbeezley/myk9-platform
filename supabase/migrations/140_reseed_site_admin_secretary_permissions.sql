-- 140_reseed_site_admin_secretary_permissions.sql
-- Re-apply role_permissions seed for site_admin and secretary.
--
-- Root cause: Migration 067 seeded role_permissions before the current
-- site_admin (created 2026-04-02) and secretary (created 2026-04-02) role
-- rows existed. Its INSERTs matched on role name but filtered by role_id, so
-- zero rows were inserted for these roles. Result: site_admin had NO mapped
-- permissions, so PermissionGuard and hasPermission returned false for every
-- permission — breaking /admin/rbac-test and any other UI that checks
-- admin:manage, show:create, etc.
--
-- This migration re-runs sections 3 and 6 of migration 067 idempotently.

BEGIN;

-- Grant every permission to site_admin.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'site_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant secretary's intended permission set.
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

COMMIT;
