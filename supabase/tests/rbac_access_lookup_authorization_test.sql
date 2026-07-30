-- Behavioral authorization test for
-- 20260730110000_restrict_rbac_access_lookups.sql.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rbac_access_lookup_authorization_test.sql
-- All fixtures roll back.

BEGIN;

-- Seed unlinked people first so the auth trigger adopts these fixed records.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  (
    '00000000-0000-0000-0000-00000000a101',
    'RBAC', 'Lookup Admin', 'rbac-lookup-admin@example.test', NULL
  ),
  (
    '00000000-0000-0000-0000-00000000a102',
    'RBAC', 'Lookup Target', 'rbac-lookup-target@example.test', NULL
  );

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  (
    '00000000-0000-0000-0000-00000000a001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'rbac-lookup-admin@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  ),
  (
    '00000000-0000-0000-0000-00000000a002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'rbac-lookup-target@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  );

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-00000000a101',
  id,
  true,
  '00000000-0000-0000-0000-00000000a001'
FROM public.roles
WHERE name = 'site_admin';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_auth_id CONSTANT uuid := '00000000-0000-0000-0000-00000000a001';
  target_auth_id CONSTANT uuid := '00000000-0000-0000-0000-00000000a002';
  permission_result boolean;
  error_message text;
BEGIN
  -- A normal authenticated caller may inspect its own access context.
  PERFORM set_config('request.jwt.claim.sub', target_auth_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', target_auth_id, 'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
    true
  );
  PERFORM 1 FROM public.get_user_permissions(target_auth_id, NULL, NULL);
  PERFORM 1 FROM public.get_user_roles(target_auth_id);
  PERFORM 1 FROM public.get_effective_permissions(target_auth_id, NULL, NULL);
  SELECT public.user_has_permission(target_auth_id, '__rbac_lookup_missing_permission__')
    INTO permission_result;
  IF permission_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL self permission lookup returned %', permission_result;
  END IF;

  -- A non-admin caller cannot inspect another user's access context.
  PERFORM set_config('request.jwt.claim.sub', target_auth_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', target_auth_id, 'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
    true
  );

  BEGIN
    PERFORM 1 FROM public.get_user_permissions(admin_auth_id, NULL, NULL);
    RAISE EXCEPTION 'FAIL get_user_permissions allowed cross-user lookup';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
    IF error_message <> 'Permission denied' THEN
      RAISE EXCEPTION 'FAIL get_user_permissions raised unexpected error: %', error_message;
    END IF;
  END;

  BEGIN
    PERFORM 1 FROM public.get_user_roles(admin_auth_id);
    RAISE EXCEPTION 'FAIL get_user_roles allowed cross-user lookup';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
    IF error_message <> 'Permission denied' THEN
      RAISE EXCEPTION 'FAIL get_user_roles raised unexpected error: %', error_message;
    END IF;
  END;

  BEGIN
    PERFORM 1 FROM public.get_effective_permissions(admin_auth_id, NULL, NULL);
    RAISE EXCEPTION 'FAIL get_effective_permissions allowed cross-user lookup';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
    IF error_message <> 'Permission denied' THEN
      RAISE EXCEPTION 'FAIL get_effective_permissions raised unexpected error: %', error_message;
    END IF;
  END;

  BEGIN
    SELECT public.user_has_permission(admin_auth_id, '__rbac_lookup_missing_permission__')
      INTO permission_result;
    RAISE EXCEPTION 'FAIL user_has_permission allowed cross-user lookup';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
    IF error_message <> 'Permission denied' THEN
      RAISE EXCEPTION 'FAIL user_has_permission raised unexpected error: %', error_message;
    END IF;
  END;

  -- A site admin may inspect another user's access context.
  PERFORM set_config('request.jwt.claim.sub', admin_auth_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_auth_id, 'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
    true
  );
  PERFORM 1 FROM public.get_user_permissions(target_auth_id, NULL, NULL);
  PERFORM 1 FROM public.get_user_roles(target_auth_id);
  PERFORM 1 FROM public.get_effective_permissions(target_auth_id, NULL, NULL);
  SELECT public.user_has_permission(target_auth_id, '__rbac_lookup_missing_permission__')
    INTO permission_result;
  IF permission_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL site-admin permission lookup returned %', permission_result;
  END IF;

  RAISE NOTICE 'PASS self, non-admin cross-user denial, and site-admin cross-user access for all four RBAC RPCs';
END;
$$;

ROLLBACK;
