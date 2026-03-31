-- =============================================================================
-- Migration 097: Migrate show officials to user_roles & harden volunteer RLS
--
-- 1. Create is_show_secretary() and is_show_official() helper functions
-- 2. Migrate shows.secretary/chairman/chief_steward data into user_roles rows
-- 3. Drop the TEXT columns from shows
-- 4. Rewrite volunteer RLS policies to use helper functions with show scoping
--
-- ROLLBACK:
-- ALTER TABLE shows ADD COLUMN secretary TEXT, ADD COLUMN chairman TEXT, ADD COLUMN chief_steward TEXT;
-- UPDATE shows s SET secretary = p.id::text FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN people p ON p.id = ur.user_id WHERE r.name = 'secretary' AND ur.show_id = s.id AND ur.is_active = true;
-- UPDATE shows s SET chairman = p.id::text FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN people p ON p.id = ur.user_id WHERE r.name = 'chairman' AND ur.show_id = s.id AND ur.is_active = true;
-- UPDATE shows s SET chief_steward = p.id::text FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN people p ON p.id = ur.user_id WHERE r.name = 'steward' AND ur.show_id = s.id AND ur.is_active = true;
-- DROP FUNCTION IF EXISTS is_show_secretary(UUID);
-- DROP FUNCTION IF EXISTS is_show_official(UUID);
-- (Then restore original volunteer policies from migration 095)
-- =============================================================================

-- =============================================================================
-- 1. Helper functions
-- =============================================================================

CREATE OR REPLACE FUNCTION is_show_secretary(check_show_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        (r.name = 'secretary' AND ur.show_id = check_show_id)
        OR r.name = 'site_admin'
      )
  );
$$;

CREATE OR REPLACE FUNCTION is_show_official(check_show_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        (r.name IN ('secretary', 'chairman', 'steward') AND ur.show_id = check_show_id)
        OR r.name = 'site_admin'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION is_show_secretary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_show_official(UUID) TO authenticated;

-- =============================================================================
-- 2. Migrate existing show official data into user_roles
-- =============================================================================

-- Safe UUID cast helper — returns NULL for non-UUID text values
CREATE OR REPLACE FUNCTION pg_temp.safe_uuid(val TEXT)
RETURNS UUID
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN val::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

-- Secretary
INSERT INTO user_roles (user_id, role_id, show_id, is_active, granted_at)
SELECT
  pg_temp.safe_uuid(s.secretary),
  r.id,
  s.id,
  true,
  NOW()
FROM shows s
CROSS JOIN roles r
WHERE r.name = 'secretary'
  AND s.secretary IS NOT NULL
  AND s.secretary != ''
  AND s.deleted_at IS NULL
  AND pg_temp.safe_uuid(s.secretary) IS NOT NULL
  AND EXISTS (SELECT 1 FROM people p WHERE p.id = pg_temp.safe_uuid(s.secretary))
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = pg_temp.safe_uuid(s.secretary)
      AND ur.role_id = r.id
      AND ur.show_id = s.id
  );

-- Chairman
INSERT INTO user_roles (user_id, role_id, show_id, is_active, granted_at)
SELECT
  pg_temp.safe_uuid(s.chairman),
  r.id,
  s.id,
  true,
  NOW()
FROM shows s
CROSS JOIN roles r
WHERE r.name = 'chairman'
  AND s.chairman IS NOT NULL
  AND s.chairman != ''
  AND s.deleted_at IS NULL
  AND pg_temp.safe_uuid(s.chairman) IS NOT NULL
  AND EXISTS (SELECT 1 FROM people p WHERE p.id = pg_temp.safe_uuid(s.chairman))
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = pg_temp.safe_uuid(s.chairman)
      AND ur.role_id = r.id
      AND ur.show_id = s.id
  );

-- Chief Steward → steward role
INSERT INTO user_roles (user_id, role_id, show_id, is_active, granted_at)
SELECT
  pg_temp.safe_uuid(s.chief_steward),
  r.id,
  s.id,
  true,
  NOW()
FROM shows s
CROSS JOIN roles r
WHERE r.name = 'steward'
  AND s.chief_steward IS NOT NULL
  AND s.chief_steward != ''
  AND s.deleted_at IS NULL
  AND pg_temp.safe_uuid(s.chief_steward) IS NOT NULL
  AND EXISTS (SELECT 1 FROM people p WHERE p.id = pg_temp.safe_uuid(s.chief_steward))
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = pg_temp.safe_uuid(s.chief_steward)
      AND ur.role_id = r.id
      AND ur.show_id = s.id
  );

-- =============================================================================
-- 3. Drop TEXT columns from shows
-- =============================================================================

ALTER TABLE shows DROP COLUMN IF EXISTS secretary;
ALTER TABLE shows DROP COLUMN IF EXISTS chairman;
ALTER TABLE shows DROP COLUMN IF EXISTS chief_steward;

-- =============================================================================
-- 4. Rewrite volunteer RLS policies with show scoping
-- =============================================================================

DROP POLICY IF EXISTS "Secretary can manage volunteers" ON volunteers;
DROP POLICY IF EXISTS "Secretary can manage class assignments" ON volunteer_class_assignments;
DROP POLICY IF EXISTS "Secretary can manage general assignments" ON volunteer_general_assignments;

-- Volunteers: secretary must be assigned to this show.
-- Legacy myK9Q rows with NULL show_id fall back to global secretary/admin check.
CREATE POLICY "Secretary can manage volunteers"
  ON volunteers FOR ALL TO authenticated
  USING (
    CASE
      WHEN show_id IS NOT NULL THEN (SELECT public.is_show_secretary(show_id))
      ELSE (SELECT public.has_role('secretary')) OR (SELECT public.is_platform_admin())
    END
  );

-- Class assignments: scope through parent volunteer's show_id.
CREATE POLICY "Secretary can manage class assignments"
  ON volunteer_class_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.volunteers v
      WHERE v.id = volunteer_id
        AND CASE
          WHEN v.show_id IS NOT NULL THEN (SELECT public.is_show_secretary(v.show_id))
          ELSE (SELECT public.has_role('secretary')) OR (SELECT public.is_platform_admin())
        END
    )
  );

-- General assignments: scope through parent volunteer's show_id.
CREATE POLICY "Secretary can manage general assignments"
  ON volunteer_general_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.volunteers v
      WHERE v.id = volunteer_id
        AND CASE
          WHEN v.show_id IS NOT NULL THEN (SELECT public.is_show_secretary(v.show_id))
          ELSE (SELECT public.has_role('secretary')) OR (SELECT public.is_platform_admin())
        END
    )
  );

-- =============================================================================
-- 5. Index for show-scoped role lookups
-- =============================================================================

CREATE INDEX IF NOT EXISTS user_roles_show_role_idx
  ON user_roles(show_id, role_id)
  WHERE show_id IS NOT NULL AND is_active = true;

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 097: Officials migrated to user_roles, volunteer RLS hardened' as status;
