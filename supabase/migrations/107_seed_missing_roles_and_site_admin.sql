-- 107_seed_missing_roles_and_site_admin.sql
-- Fix: site_admin and secretary roles were never created.
-- Migration 066 deleted trial_secretary/platform_admin and mapped data to
-- site_admin/secretary, but never inserted those target roles.

BEGIN;

-- 1. Create missing roles
INSERT INTO roles (name, description, is_system)
VALUES
  ('site_admin', 'Full system access', TRUE),
  ('secretary', 'Manages entries, armbands, and results for assigned shows', TRUE)
ON CONFLICT (name) DO NOTHING;

-- 2. Grant site_admin to beezley@cox.net (Richard Beezley)
INSERT INTO user_roles (user_id, role_id, granted_at, is_active)
SELECT
  p.id,
  r.id,
  NOW(),
  TRUE
FROM people p
JOIN roles r ON r.name = 'site_admin'
WHERE p.email = 'beezley@cox.net'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role_id = r.id
  );

COMMIT;
