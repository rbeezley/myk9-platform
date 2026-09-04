-- Reconcile the permission codes referenced by myK9Show with the canonical
-- permissions table. Previously CROSS JOIN ... WHERE p.code IN (...) grant
-- statements silently skipped codes that had never been inserted.
--
-- This migration deliberately defines the missing vocabulary only. Assigning
-- newly defined capabilities to live roles is a separate authorization
-- decision, especially for admin, deletion, and RBAC-management permissions.

BEGIN;

INSERT INTO public.permissions (code, name, description, category) VALUES
  ('admin:impersonate_user', 'Impersonate Users', 'Can act as another user for support and administration', 'admin'),
  ('admin:manage_users', 'Manage Users', 'Can manage platform user accounts', 'admin'),
  ('admin:view_audit', 'View Audit Log', 'Can view administrative audit records', 'admin'),
  ('admin:view_system_health', 'View System Health', 'Can view platform health information', 'admin'),
  ('check_in:manage_all', 'Manage All Check-in', 'Can manage check-in for all entries', 'check_in'),
  ('check_in:manage_own', 'Manage Own Check-in', 'Can manage check-in for assigned entries', 'check_in'),
  ('check_in:view_all', 'View All Check-in', 'Can view check-in for all entries', 'check_in'),
  ('club:manage', 'Manage Clubs', 'Can manage club administration', 'club'),
  ('dog:read_all', 'View All Dogs', 'Can view all dogs in the platform', 'dog'),
  ('registration:override_fees', 'Override Registration Fees', 'Can override registration fees', 'registration'),
  ('judge:enter_results', 'Enter Results', 'Can enter judging results', 'judge'),
  ('judge:manage_check_in', 'Manage Judge Check-in', 'Can manage check-in while judging', 'judge'),
  ('judge:sign_results', 'Sign Results', 'Can sign judging results', 'judge'),
  ('judge:view_assignments', 'View Judge Assignments', 'Can view judge assignments', 'judge'),
  ('judge:view_scoresheets', 'View Scoresheets', 'Can view judging scoresheets', 'judge'),
  ('secretary:assign_judges', 'Assign Judges', 'Can assign judges to shows', 'secretary'),
  ('secretary:broadcast_status', 'Broadcast Show Status', 'Can broadcast show-day status updates', 'secretary'),
  ('show:create', 'Create Shows', 'Can create shows', 'show'),
  ('show:delete', 'Delete Shows', 'Can delete shows', 'show'),
  ('show:read', 'View Shows', 'Can view shows', 'show'),
  ('show:update', 'Update Shows', 'Can modify shows', 'show'),
  ('show:manage_entries', 'Manage Show Entries', 'Can manage entries for shows', 'show'),
  ('system:admin', 'System Administration', 'Can administer the platform', 'system'),
  ('system:manage_rbac', 'Manage RBAC', 'Can manage roles and permissions', 'system'),
  ('user:manage_roles', 'Manage User Roles', 'Can assign and manage user roles', 'user')
ON CONFLICT (code) DO NOTHING;

COMMIT;
