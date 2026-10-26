-- MYK9-1409: create_role_with_permissions and update_role_with_permissions write a role's
-- permission set in one transaction. Proves the authorization and re-auth order, that a
-- refused or unknown code writes nothing (so a failed create can be retried under the same
-- name), that a save leaves exactly the requested set, and that the internal helper is not
-- callable by a client. All fixtures roll back. Runs only in CI (no local container runtime).

BEGIN;

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000140911', 'Site', 'Admin', '00000000-0000-0000-0000-000000140921'),
  ('00000000-0000-0000-0000-000000140912', 'Plain', 'Exhibitor', '00000000-0000-0000-0000-000000140922');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000140911', id, NULL, true,
       '00000000-0000-0000-0000-000000140921'
FROM public.roles WHERE name = 'site_admin';

INSERT INTO public.permissions (code, name)
VALUES ('myk9_1409:a', 'Test A'), ('myk9_1409:b', 'Test B'), ('myk9_1409:c', 'Test C');

CREATE TEMP TABLE myk9_1409_role ON COMMIT DROP AS SELECT NULL::uuid AS id;
GRANT ALL ON myk9_1409_role TO authenticated;

-- 1. A non-admin is refused with 42501, before any re-auth prompt.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000140922', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000140922', 'role', 'authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM public.create_role_with_permissions('myk9-1409-crew', ARRAY['myk9_1409:a']);
    RAISE EXCEPTION 'FAIL an exhibitor created a role';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS create_role_with_permissions refuses a non-admin with 42501';
  END;
  BEGIN
    PERFORM public.update_role_with_permissions(
      (SELECT id FROM public.roles WHERE name = 'judge'), NULL, false, ARRAY['myk9_1409:a']);
    RAISE EXCEPTION 'FAIL an exhibitor edited a role';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS update_role_with_permissions refuses a non-admin with 42501';
  END;
END;
$$;

-- 2. A site admin on a stale session is asked for the password.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000140921', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000140921', 'role', 'authenticated',
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'password', 'timestamp', extract(epoch FROM now())::bigint - 14 * 86400))
)::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM public.create_role_with_permissions('myk9-1409-crew', ARRAY['myk9_1409:a']);
    RAISE EXCEPTION 'FAIL a role was created on a 14-day-old sign-in';
  EXCEPTION WHEN SQLSTATE 'MKAUT' THEN
    RAISE NOTICE 'PASS create_role_with_permissions asks for the password on a stale session';
  END;
END;
$$;

SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000140921', 'role', 'authenticated',
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'password', 'timestamp', extract(epoch FROM now())::bigint - 10))
)::text, true);

-- 3. An unknown code creates nothing, so the same name can be saved again.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    PERFORM public.create_role_with_permissions(
      'myk9-1409-crew', ARRAY['myk9_1409:a', 'myk9_1409:nope']);
    RAISE EXCEPTION 'FAIL an unknown code was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS an unknown code is refused with 22023';
  END;

  v_result := public.create_role_with_permissions(
    'myk9-1409-crew', ARRAY['myk9_1409:b', 'myk9_1409:a', 'myk9_1409:b'], 'Ring crew');
  IF v_result -> 'permission_codes' IS DISTINCT FROM '["myk9_1409:b", "myk9_1409:a"]'::jsonb THEN
    RAISE EXCEPTION 'FAIL create returned codes %', v_result -> 'permission_codes';
  END IF;
  UPDATE myk9_1409_role SET id = (v_result -> 'role' ->> 'id')::uuid;
  RAISE NOTICE 'PASS a refused create is retryable and returns the codes written, deduplicated';
END;
$$;

-- 4. Updates leave exactly the requested set; a refused update changes nothing.
DO $$
DECLARE
  v_role uuid := (SELECT id FROM myk9_1409_role);
  v_result jsonb;
  v_codes text[];
BEGIN
  v_result := public.update_role_with_permissions(
    v_role, NULL, false, ARRAY['myk9_1409:b', 'myk9_1409:c']);
  SELECT array_agg(p.code ORDER BY p.code) INTO v_codes
    FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id
   WHERE rp.role_id = v_role;
  IF v_codes IS DISTINCT FROM ARRAY['myk9_1409:b', 'myk9_1409:c'] THEN
    RAISE EXCEPTION 'FAIL update left %', v_codes;
  END IF;

  BEGIN
    PERFORM public.update_role_with_permissions(v_role, NULL, false, ARRAY['myk9_1409:nope']);
    RAISE EXCEPTION 'FAIL an unknown code was accepted on update';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  BEGIN
    PERFORM public.update_role_with_permissions(v_role, NULL, false, ARRAY[NULL::text]);
    RAISE EXCEPTION 'FAIL a NULL code was accepted on update';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  IF (SELECT count(*) FROM public.role_permissions WHERE role_id = v_role) <> 2 THEN
    RAISE EXCEPTION 'FAIL a refused update changed the permission set';
  END IF;

  v_result := public.update_role_with_permissions(v_role, 'New description', true, NULL);
  IF v_result ->> 'permission_codes' IS NOT NULL
     OR v_result -> 'role' ->> 'description' <> 'New description'
     OR (SELECT count(*) FROM public.role_permissions WHERE role_id = v_role) <> 2 THEN
    RAISE EXCEPTION 'FAIL a description-only update touched permissions or lost the description';
  END IF;

  PERFORM public.update_role_with_permissions(v_role, NULL, false, ARRAY[]::text[]);
  IF EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = v_role) THEN
    RAISE EXCEPTION 'FAIL an explicit empty set kept permissions';
  END IF;
  RAISE NOTICE 'PASS update leaves exactly the requested set and a refused update writes nothing';
END;
$$;

-- 5. The internal helper is not callable by a client.
DO $$
BEGIN
  BEGIN
    PERFORM public.replace_role_permission_codes(
      (SELECT id FROM myk9_1409_role), ARRAY['myk9_1409:a']);
    RAISE EXCEPTION 'FAIL a client called replace_role_permission_codes directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS replace_role_permission_codes is not granted to clients';
  END;
END;
$$;

RESET ROLE;

ROLLBACK;
