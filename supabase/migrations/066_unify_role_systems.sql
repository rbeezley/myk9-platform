-- 066_unify_role_systems.sql
-- Unify role systems: migrate people.roles → user_roles, then drop column

BEGIN;

-- 1. Seed missing roles
INSERT INTO roles (name, description, is_system)
VALUES
  ('chairman', 'Show chairman; named role for future use', TRUE),
  ('steward', 'Ring steward at shows', TRUE)
ON CONFLICT (name) DO NOTHING;

-- 2. Remove unused roles (CASCADE removes role_permissions + user_roles rows)
DELETE FROM roles WHERE name IN ('trial_secretary', 'platform_admin');

-- 3. Migrate existing people.roles data into user_roles
-- Map 'admin' → 'site_admin', skip unknown roles (handler, gate_steward, etc.)
-- Note: ON CONFLICT won't work for NULL club_id/show_id (NULL != NULL in Postgres),
-- so we use WHERE NOT EXISTS to prevent duplicates for global (unscoped) roles.
INSERT INTO user_roles (user_id, role_id, granted_at, is_active)
SELECT
  p.id,
  r.id,
  NOW(),
  TRUE
FROM people p,
  LATERAL unnest(p.roles) AS legacy_role
  JOIN roles r ON r.name = (
    CASE
      WHEN legacy_role = 'admin' THEN 'site_admin'
      ELSE legacy_role
    END
  )
WHERE p.roles IS NOT NULL
  AND array_length(p.roles, 1) > 0
  AND (
    CASE
      WHEN legacy_role = 'admin' THEN 'site_admin'
      ELSE legacy_role
    END
  ) IN ('site_admin', 'secretary', 'judge', 'club_admin', 'chairman', 'steward', 'exhibitor')
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role_id = r.id
      AND ur.club_id IS NULL
      AND ur.show_id IS NULL
  );

-- 4a. Drop RLS policies on judge_availability that reference people.roles
--     (must be done before dropping the column)
DROP POLICY IF EXISTS "Secretaries can view all availability" ON judge_availability;
DROP POLICY IF EXISTS "Admins can manage all availability" ON judge_availability;

-- 4b. Recreate those policies using user_roles instead of people.roles
CREATE POLICY "Secretaries can view all availability"
  ON judge_availability FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM people p
    JOIN user_roles ur ON ur.user_id = p.id
    JOIN roles r ON r.id = ur.role_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name IN ('secretary', 'site_admin')
      AND ur.is_active = TRUE
  ));

CREATE POLICY "Admins can manage all availability"
  ON judge_availability FOR ALL
  USING (is_platform_admin());

-- 4c. Drop the column
ALTER TABLE people DROP COLUMN roles;

-- 5. Replace get_admin_user_list() RPC to use user_roles instead of people.roles
CREATE OR REPLACE FUNCTION get_admin_user_list(show_deleted BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  status TEXT,
  roles TEXT[],
  profile_image TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_id UUID;
  caller_person_id UUID;
  is_admin BOOLEAN := FALSE;
BEGIN
  -- Get the calling user's auth ID
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find the caller's person record
  SELECT p.id INTO caller_person_id
  FROM people p
  WHERE p.auth_user_id = caller_id;

  IF caller_person_id IS NULL THEN
    RAISE EXCEPTION 'Person record not found';
  END IF;

  -- Check if caller is site_admin via user_roles
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles rl ON rl.id = ur.role_id
    WHERE ur.user_id = caller_person_id
      AND rl.name = 'site_admin'
      AND ur.is_active = TRUE
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Unauthorized: requires site_admin role';
  END IF;

  -- Return user list with roles aggregated from user_roles
  RETURN QUERY
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    p.status,
    COALESCE(
      (SELECT array_agg(rl.name ORDER BY rl.name)
       FROM user_roles ur
       JOIN roles rl ON rl.id = ur.role_id
       WHERE ur.user_id = p.id AND ur.is_active = TRUE),
      '{}'::TEXT[]
    ) AS roles,
    p.profile_image,
    p.deleted_at,
    p.deleted_by,
    p.created_at,
    p.updated_at,
    au.last_sign_in_at
  FROM people p
  LEFT JOIN auth.users au ON au.id = p.auth_user_id
  WHERE (show_deleted OR p.deleted_at IS NULL)
  ORDER BY p.last_name, p.first_name;
END;
$$;

COMMIT;
