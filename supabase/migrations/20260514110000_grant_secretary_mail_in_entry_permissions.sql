-- Grant secretaries the app-level permissions needed to process mail-in entries.
--
-- Secretaries already have RLS access to insert people and dogs for show work,
-- but the app-level RBAC permission rows for the registration workflow were
-- never seeded into the database. Without these rows the UI hides the
-- "Create New" path even though mail-in entry requires creating an offline
-- person/exhibitor record, then a dog, then the entry.

BEGIN;

INSERT INTO permissions (code, name, description, category) VALUES
  ('registration:view_all_dogs', 'View All Registration Dogs', 'Can search and view dogs during registration', 'registration'),
  ('registration:register_any', 'Register Any Dog', 'Can register dogs for another exhibitor', 'registration'),
  ('registration:create_exhibitor', 'Create Mail-In Exhibitors', 'Can create offline exhibitor/person records during registration', 'registration'),
  ('registration:assign_armbands', 'Assign Armbands', 'Can assign armband numbers during registration', 'registration'),
  ('registration:manage_status', 'Manage Registration Status', 'Can manage entry status during registration', 'registration'),
  ('registration:bulk_operations', 'Registration Bulk Operations', 'Can perform bulk registration actions', 'registration'),
  ('registration:mark_payment', 'Mark Registration Payment', 'Can mark mail-in payments received', 'registration'),
  ('registration:manage_payments', 'Manage Registration Payments', 'Can manage registration payment state', 'registration')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'secretary'
AND p.code IN (
  'dog:create',
  'dog:read',
  'dog:update',
  'people:create',
  'people:read',
  'people:update',
  'registration:view_all_dogs',
  'registration:register_any',
  'registration:create_exhibitor',
  'registration:assign_armbands',
  'registration:manage_status',
  'registration:bulk_operations',
  'registration:mark_payment',
  'registration:manage_payments'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
