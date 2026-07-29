\pset pager off
\echo 'RBAC row inventory'
SELECT 'roles' AS object, count(*) AS total FROM public.roles
UNION ALL
SELECT 'permissions', count(*) FROM public.permissions
UNION ALL
SELECT 'role_permissions', count(*) FROM public.role_permissions
UNION ALL
SELECT 'user_roles', count(*) FROM public.user_roles
UNION ALL
SELECT 'active_user_roles', count(*) FROM public.user_roles WHERE is_active
UNION ALL
SELECT 'user_roles_missing_auth_id', count(*)
FROM public.user_roles
WHERE auth_user_id IS NULL
ORDER BY object;

\echo 'Missing user_roles auth identity classification'
SELECT
  count(*) FILTER (WHERE person.auth_user_id IS NULL) AS person_has_no_auth_identity,
  count(*) FILTER (WHERE person.auth_user_id IS NOT NULL) AS denormalized_identity_drift
FROM public.user_roles user_role
JOIN public.people person ON person.id = user_role.user_id
WHERE user_role.auth_user_id IS NULL;

\echo 'RBAC auth-identity indexes'
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'user_roles'
  AND indexdef ILIKE '%auth_user_id%'
ORDER BY indexname;

\echo 'RBAC function security and predicate inventory'
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.proconfig,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  position('JOIN public.people' IN pg_get_functiondef(p.oid)) > 0 AS joins_people,
  position('ur.auth_user_id' IN pg_get_functiondef(p.oid)) > 0 AS uses_role_auth_id
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_user_permissions',
    'get_user_roles',
    'get_effective_permissions',
    'user_has_permission'
  )
ORDER BY p.proname, identity_arguments;

\echo 'Representative pre-change permission join plan'
EXPLAIN (ANALYZE, BUFFERS, COSTS, FORMAT TEXT)
SELECT DISTINCT
  permission.id,
  role.id,
  COALESCE(user_role.show_id, user_role.club_id)
FROM public.user_roles user_role
JOIN public.roles role ON role.id = user_role.role_id
JOIN public.role_permissions role_permission ON role_permission.role_id = role.id
JOIN public.permissions permission ON permission.id = role_permission.permission_id
JOIN public.people person ON person.id = user_role.user_id
WHERE person.auth_user_id = (
  SELECT auth_user_id
  FROM public.user_roles
  WHERE auth_user_id IS NOT NULL
  LIMIT 1
)
  AND user_role.is_active
  AND (user_role.expires_at IS NULL OR user_role.expires_at > NOW());
