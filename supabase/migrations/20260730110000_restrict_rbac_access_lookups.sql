BEGIN;

-- Rollback: recreate these functions from
-- 20260729160000_optimize_rbac_auth_lookup.sql, then reapply the
-- authenticated-only revokes from 20260613100000_security_revoke_anon_grants.sql.

-- The complete-access RPCs are authenticated-only, but their SECURITY DEFINER
-- bodies must also authorize the target user_id. Site admins retain the
-- deliberate ability to inspect another user's access context.
CREATE OR REPLACE FUNCTION private.can_inspect_rbac_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
      auth.uid() IS NOT NULL
      AND p_user_id IS NOT DISTINCT FROM (SELECT auth.uid())
    )
    OR (SELECT public.is_site_admin());
$$;

COMMENT ON FUNCTION private.can_inspect_rbac_user(UUID) IS
  'Allows self access-context lookups and deliberate site-admin inspection of another user.';

REVOKE ALL ON FUNCTION private.can_inspect_rbac_user(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_inspect_rbac_user(UUID)
  FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_permissions(
  user_id UUID,
  filter_scope_type TEXT DEFAULT NULL,
  filter_scope_id UUID DEFAULT NULL
)
RETURNS TABLE (
  permission_id UUID,
  permission_code TEXT,
  permission_name TEXT,
  description TEXT,
  category TEXT,
  role_id UUID,
  role_name TEXT,
  scope_type TEXT,
  scope_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT private.can_inspect_rbac_user(user_id) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    p.id AS permission_id,
    p.code AS permission_code,
    p.name AS permission_name,
    p.description,
    p.category,
    r.id AS role_id,
    r.name AS role_name,
    CASE
      WHEN ur.show_id IS NOT NULL THEN 'show'
      WHEN ur.club_id IS NOT NULL THEN 'club'
      ELSE 'global'
    END AS scope_type,
    COALESCE(ur.show_id, ur.club_id) AS scope_id
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.auth_user_id = get_user_permissions.user_id
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND (
      filter_scope_type IS NULL
      OR (filter_scope_type = 'show' AND ur.show_id = filter_scope_id)
      OR (filter_scope_type = 'club' AND ur.club_id = filter_scope_id)
      OR (
        filter_scope_type = 'global'
        AND ur.show_id IS NULL
        AND ur.club_id IS NULL
      )
    );
END;
$$;

COMMENT ON FUNCTION public.get_user_permissions(UUID, TEXT, UUID) IS
  'Raises 42501 when user_id is not the caller or a site-admin inspection target.';

CREATE OR REPLACE FUNCTION public.user_has_permission(
  user_id UUID,
  permission_name TEXT,
  scope_type TEXT DEFAULT NULL,
  scope_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  has_perm BOOLEAN;
BEGIN
  IF NOT private.can_inspect_rbac_user(user_id) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.auth_user_id = user_has_permission.user_id
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        p.code = permission_name
        OR p.name = permission_name
        OR (
          permission_name LIKE '%:create'
          AND p.code = REPLACE(permission_name, ':create', ':manage')
        )
        OR (
          permission_name LIKE '%:read'
          AND p.code = REPLACE(permission_name, ':read', ':manage')
        )
        OR (
          permission_name LIKE '%:update'
          AND p.code = REPLACE(permission_name, ':update', ':manage')
        )
        OR (
          permission_name LIKE '%:delete'
          AND p.code = REPLACE(permission_name, ':delete', ':manage')
        )
      )
      AND (
        scope_type IS NULL
        OR (scope_type = 'show' AND ur.show_id = scope_id)
        OR (scope_type = 'club' AND ur.club_id = scope_id)
        OR (scope_type = 'global' AND ur.show_id IS NULL AND ur.club_id IS NULL)
        OR (ur.show_id IS NULL AND ur.club_id IS NULL)
      )
  ) INTO has_perm;

  RETURN has_perm;
END;
$$;

COMMENT ON FUNCTION public.user_has_permission(UUID, TEXT, TEXT, UUID) IS
  'Raises 42501 for non-self targets; do not call from RLS policies with another user_id.';

CREATE OR REPLACE FUNCTION public.get_user_roles(user_id UUID)
RETURNS TABLE (
  user_role_id UUID,
  role_id UUID,
  role_name TEXT,
  role_description TEXT,
  is_system BOOLEAN,
  scope_type TEXT,
  scope_id UUID,
  granted_by UUID,
  granted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT private.can_inspect_rbac_user(user_id) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ur.id AS user_role_id,
    r.id AS role_id,
    r.name AS role_name,
    r.description AS role_description,
    r.is_system,
    CASE
      WHEN ur.show_id IS NOT NULL THEN 'show'
      WHEN ur.club_id IS NOT NULL THEN 'club'
      ELSE 'global'
    END AS scope_type,
    COALESCE(ur.show_id, ur.club_id) AS scope_id,
    ur.granted_by,
    ur.granted_at,
    ur.expires_at,
    ur.is_active AND (ur.expires_at IS NULL OR ur.expires_at > NOW()) AS is_active
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.auth_user_id = get_user_roles.user_id;
END;
$$;

COMMENT ON FUNCTION public.get_user_roles(UUID) IS
  'Raises 42501 when user_id is not the caller or a site-admin inspection target.';

CREATE OR REPLACE FUNCTION public.get_effective_permissions(
  user_id UUID,
  filter_scope_type TEXT DEFAULT NULL,
  filter_scope_id UUID DEFAULT NULL
)
RETURNS TABLE (
  permission_name TEXT,
  permission_code TEXT,
  source_type TEXT,
  source_role TEXT,
  scope_type TEXT,
  scope_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT private.can_inspect_rbac_user(user_id) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH user_permissions AS (
    SELECT DISTINCT
      p.name AS perm_name,
      p.code AS perm_code,
      'direct'::TEXT AS src_type,
      r.name AS src_role,
      CASE
        WHEN ur.show_id IS NOT NULL THEN 'show'
        WHEN ur.club_id IS NOT NULL THEN 'club'
        ELSE 'global'
      END AS scp_type,
      COALESCE(ur.show_id, ur.club_id) AS scp_id
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.auth_user_id = get_effective_permissions.user_id
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  ),
  expanded_permissions AS (
    SELECT * FROM user_permissions
    UNION ALL
    SELECT
      REPLACE(up.perm_name, ':manage', ':' || action.name) AS perm_name,
      REPLACE(up.perm_code, ':manage', ':' || action.name) AS perm_code,
      'inherited'::TEXT AS src_type,
      up.src_role || ' (via :manage)',
      up.scp_type,
      up.scp_id
    FROM user_permissions up
    CROSS JOIN (
      SELECT 'create' AS name
      UNION ALL
      SELECT 'read'
      UNION ALL
      SELECT 'update'
      UNION ALL
      SELECT 'delete'
    ) action
    WHERE up.perm_code LIKE '%:manage'
  )
  SELECT DISTINCT
    ep.perm_name AS permission_name,
    ep.perm_code AS permission_code,
    ep.src_type AS source_type,
    ep.src_role AS source_role,
    ep.scp_type AS scope_type,
    ep.scp_id AS scope_id
  FROM expanded_permissions ep
  WHERE (
    filter_scope_type IS NULL
    OR ep.scp_type = filter_scope_type
  )
  AND (
    filter_scope_id IS NULL
    OR ep.scp_id = filter_scope_id
    OR ep.scp_id IS NULL
  );
END;
$$;

COMMENT ON FUNCTION public.get_effective_permissions(UUID, TEXT, UUID) IS
  'Raises 42501 when user_id is not the caller or a site-admin inspection target.';

REVOKE ALL ON FUNCTION public.get_user_permissions(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_permissions(UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_permission(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_permission(UUID, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_has_permission(UUID, TEXT, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_roles(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_roles(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_effective_permissions(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_effective_permissions(UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(UUID, TEXT, UUID) TO authenticated;

COMMIT;
