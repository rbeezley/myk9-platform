\pset pager off

\echo 'Applied migration'
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version = '20260729160000';

\echo 'Post-change function security and predicates'
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  p.provolatile = 's' AS stable,
  p.proconfig,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  pg_get_functiondef(p.oid) ~* 'JOIN[[:space:]]+public\.people' AS joins_people,
  pg_get_functiondef(p.oid) ~* 'ur\.auth_user_id[[:space:]]*=' AS uses_role_auth_id
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_user_permissions',
    'get_user_roles',
    'get_effective_permissions',
    'user_has_permission'
  )
ORDER BY p.proname;

\echo 'Representative secretary/exhibitor result equivalence'
WITH representative_subjects AS (
  SELECT label, auth_user_id
  FROM (
    SELECT
      r.name AS label,
      ur.auth_user_id,
      ROW_NUMBER() OVER (PARTITION BY r.name ORDER BY ur.id) AS ordinal
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id IS NOT NULL
      AND ur.is_active = true
      AND r.name IN ('secretary', 'exhibitor')
  ) ranked
  WHERE ordinal = 1
),
actual_permissions AS (
  SELECT subject.label, TO_JSONB(result) AS row_value
  FROM representative_subjects subject
  CROSS JOIN LATERAL public.get_user_permissions(subject.auth_user_id) result
),
legacy_permissions AS (
  SELECT
    subject.label,
    JSONB_BUILD_OBJECT(
      'permission_id', p.id,
      'permission_code', p.code,
      'permission_name', p.name,
      'description', p.description,
      'category', p.category,
      'role_id', r.id,
      'role_name', r.name,
      'scope_type',
        CASE
          WHEN ur.show_id IS NOT NULL THEN 'show'
          WHEN ur.club_id IS NOT NULL THEN 'club'
          ELSE 'global'
        END,
      'scope_id', COALESCE(ur.show_id, ur.club_id)
    ) AS row_value
  FROM representative_subjects subject
  JOIN public.people person ON person.auth_user_id = subject.auth_user_id
  JOIN public.user_roles ur ON ur.user_id = person.id
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
),
actual_roles AS (
  SELECT subject.label, TO_JSONB(result) AS row_value
  FROM representative_subjects subject
  CROSS JOIN LATERAL public.get_user_roles(subject.auth_user_id) result
),
legacy_roles AS (
  SELECT
    subject.label,
    JSONB_BUILD_OBJECT(
      'user_role_id', ur.id,
      'role_id', r.id,
      'role_name', r.name,
      'role_description', r.description,
      'is_system', r.is_system,
      'scope_type',
        CASE
          WHEN ur.show_id IS NOT NULL THEN 'show'
          WHEN ur.club_id IS NOT NULL THEN 'club'
          ELSE 'global'
        END,
      'scope_id', COALESCE(ur.show_id, ur.club_id),
      'granted_by', ur.granted_by,
      'granted_at', ur.granted_at,
      'expires_at', ur.expires_at,
      'is_active',
        ur.is_active AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    ) AS row_value
  FROM representative_subjects subject
  JOIN public.people person ON person.auth_user_id = subject.auth_user_id
  JOIN public.user_roles ur ON ur.user_id = person.id
  JOIN public.roles r ON r.id = ur.role_id
),
legacy_user_permissions AS (
  SELECT DISTINCT
    subject.label,
    p.name AS permission_name,
    p.code AS permission_code,
    'direct'::TEXT AS source_type,
    r.name AS source_role,
    CASE
      WHEN ur.show_id IS NOT NULL THEN 'show'
      WHEN ur.club_id IS NOT NULL THEN 'club'
      ELSE 'global'
    END AS scope_type,
    COALESCE(ur.show_id, ur.club_id) AS scope_id
  FROM representative_subjects subject
  JOIN public.people person ON person.auth_user_id = subject.auth_user_id
  JOIN public.user_roles ur ON ur.user_id = person.id
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
),
legacy_effective_rows AS (
  SELECT * FROM legacy_user_permissions
  UNION ALL
  SELECT
    direct.label,
    REPLACE(direct.permission_name, ':manage', ':' || action.name),
    REPLACE(direct.permission_code, ':manage', ':' || action.name),
    'inherited'::TEXT,
    direct.source_role || ' (via :manage)',
    direct.scope_type,
    direct.scope_id
  FROM legacy_user_permissions direct
  CROSS JOIN (
    VALUES ('create'), ('read'), ('update'), ('delete')
  ) action(name)
  WHERE direct.permission_code LIKE '%:manage'
),
legacy_effective AS (
  SELECT DISTINCT
    label,
    JSONB_BUILD_OBJECT(
      'permission_name', permission_name,
      'permission_code', permission_code,
      'source_type', source_type,
      'source_role', source_role,
      'scope_type', scope_type,
      'scope_id', scope_id
    ) AS row_value
  FROM legacy_effective_rows
),
actual_effective AS (
  SELECT subject.label, TO_JSONB(result) AS row_value
  FROM representative_subjects subject
  CROSS JOIN LATERAL public.get_effective_permissions(subject.auth_user_id) result
),
permission_probes AS (
  SELECT DISTINCT
    subject.label,
    subject.auth_user_id,
    effective.permission_code,
    effective.scope_type,
    effective.scope_id
  FROM legacy_effective_rows effective
  JOIN representative_subjects subject ON subject.label = effective.label
  UNION ALL
  SELECT
    subject.label,
    subject.auth_user_id,
    'verification:missing',
    NULL,
    NULL
  FROM representative_subjects subject
),
actual_has_permission AS (
  SELECT
    probe.label,
    probe.permission_code,
    probe.scope_type,
    probe.scope_id,
    public.user_has_permission(
      probe.auth_user_id,
      probe.permission_code,
      probe.scope_type,
      probe.scope_id
    ) AS has_permission
  FROM permission_probes probe
),
legacy_has_permission AS (
  SELECT
    probe.label,
    probe.permission_code,
    probe.scope_type,
    probe.scope_id,
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      JOIN public.role_permissions rp ON rp.role_id = r.id
      JOIN public.permissions p ON p.id = rp.permission_id
      JOIN public.people person ON person.id = ur.user_id
      WHERE person.auth_user_id = probe.auth_user_id
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND (
          p.code = probe.permission_code
          OR p.name = probe.permission_code
          OR (
            probe.permission_code LIKE '%:create'
            AND p.code = REPLACE(probe.permission_code, ':create', ':manage')
          )
          OR (
            probe.permission_code LIKE '%:read'
            AND p.code = REPLACE(probe.permission_code, ':read', ':manage')
          )
          OR (
            probe.permission_code LIKE '%:update'
            AND p.code = REPLACE(probe.permission_code, ':update', ':manage')
          )
          OR (
            probe.permission_code LIKE '%:delete'
            AND p.code = REPLACE(probe.permission_code, ':delete', ':manage')
          )
        )
        AND (
          probe.scope_type IS NULL
          OR (probe.scope_type = 'show' AND ur.show_id = probe.scope_id)
          OR (probe.scope_type = 'club' AND ur.club_id = probe.scope_id)
          OR (
            probe.scope_type = 'global'
            AND ur.show_id IS NULL
            AND ur.club_id IS NULL
          )
          OR (ur.show_id IS NULL AND ur.club_id IS NULL)
        )
    ) AS has_permission
  FROM permission_probes probe
),
permission_diff AS (
  (SELECT * FROM actual_permissions EXCEPT SELECT * FROM legacy_permissions)
  UNION ALL
  (SELECT * FROM legacy_permissions EXCEPT SELECT * FROM actual_permissions)
),
role_diff AS (
  (SELECT * FROM actual_roles EXCEPT SELECT * FROM legacy_roles)
  UNION ALL
  (SELECT * FROM legacy_roles EXCEPT SELECT * FROM actual_roles)
),
effective_diff AS (
  (SELECT * FROM actual_effective EXCEPT SELECT * FROM legacy_effective)
  UNION ALL
  (SELECT * FROM legacy_effective EXCEPT SELECT * FROM actual_effective)
),
has_permission_diff AS (
  (SELECT * FROM actual_has_permission EXCEPT SELECT * FROM legacy_has_permission)
  UNION ALL
  (SELECT * FROM legacy_has_permission EXCEPT SELECT * FROM actual_has_permission)
)
SELECT
  (SELECT COUNT(*) FROM representative_subjects) AS representative_subjects,
  (SELECT COUNT(*) FROM actual_permissions) AS permission_rows,
  (SELECT COUNT(*) FROM permission_diff) AS permission_differences,
  (SELECT COUNT(*) FROM actual_roles) AS role_rows,
  (SELECT COUNT(*) FROM role_diff) AS role_differences,
  (SELECT COUNT(*) FROM actual_effective) AS effective_rows,
  (SELECT COUNT(*) FROM effective_diff) AS effective_differences,
  (SELECT COUNT(*) FROM permission_probes) AS permission_probes,
  (SELECT COUNT(*) FROM has_permission_diff) AS has_permission_differences;

\echo 'Representative post-change direct-auth plan'
EXPLAIN (ANALYZE, BUFFERS)
SELECT DISTINCT
  permission.id,
  role.id,
  COALESCE(user_role.show_id, user_role.club_id)
FROM public.user_roles user_role
JOIN public.roles role ON role.id = user_role.role_id
JOIN public.role_permissions role_permission ON role_permission.role_id = role.id
JOIN public.permissions permission ON permission.id = role_permission.permission_id
WHERE user_role.auth_user_id = (
  SELECT auth_user_id
  FROM public.user_roles
  WHERE auth_user_id IS NOT NULL
  LIMIT 1
)
  AND user_role.is_active = true
  AND (user_role.expires_at IS NULL OR user_role.expires_at > NOW());
