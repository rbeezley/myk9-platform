-- 141_add_admin_manage_permission.sql
-- Seed the admin:manage permission and grant it to site_admin.
--
-- Root cause: The UI uses `admin:manage` via IfAdmin/useIsAdmin to gate admin
-- surfaces (role management, admin cards, RBAC test page's role management
-- tab), but the permission was never added to the permissions table. Result:
-- even site_admin users were treated as "Regular User" by the UI.

BEGIN;

INSERT INTO permissions (code, name, description, category) VALUES
  ('admin:manage', 'Manage Admin', 'Full site-admin capabilities', 'admin')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'site_admin' AND p.code = 'admin:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
