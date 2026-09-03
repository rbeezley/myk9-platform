-- MYK9-354 behavioral contract: only secretaries and site admins may replace
-- judge qualifications. An ordinary authenticated user cannot use the RPC to
-- create or delete credential rows for their own person.
-- All fixtures roll back.

BEGIN;

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000354001', 'MYK9-354', 'Ordinary', 'myk9-354-ordinary@example.test', NULL),
  ('00000000-0000-0000-0000-000000354002', 'MYK9-354', 'Secretary', 'myk9-354-secretary@example.test', NULL),
  ('00000000-0000-0000-0000-000000354003', 'MYK9-354', 'Admin', 'myk9-354-admin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000354101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-354-ordinary@example.test', '', now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000354102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-354-secretary@example.test', '', now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000354103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-354-admin@example.test', '', now(), now(), '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000354001'::uuid, '00000000-0000-0000-0000-000000354101'::uuid),
  ('00000000-0000-0000-0000-000000354002'::uuid, '00000000-0000-0000-0000-000000354102'::uuid),
  ('00000000-0000-0000-0000-000000354003'::uuid, '00000000-0000-0000-0000-000000354103'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT fixture.person_id, roles.id, true, fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000354002'::uuid, '00000000-0000-0000-0000-000000354102'::uuid, 'secretary'::text),
  ('00000000-0000-0000-0000-000000354003'::uuid, '00000000-0000-0000-0000-000000354103'::uuid, 'site_admin'::text)
) AS fixture(person_id, auth_id, role_name)
JOIN public.roles ON roles.name = fixture.role_name;

SET LOCAL ROLE service_role;
INSERT INTO public.judge_qualifications (
  person_id, organization, qualification_level, disciplines, judge_number
)
VALUES (
  '00000000-0000-0000-0000-000000354001', 'MYK9-354', 'Initial', ARRAY['Scent Work'], 'INITIAL-354'
);
RESET ROLE;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  ordinary_auth_id CONSTANT uuid := '00000000-0000-0000-0000-000000354101';
  secretary_auth_id CONSTANT uuid := '00000000-0000-0000-0000-000000354102';
  admin_auth_id CONSTANT uuid := '00000000-0000-0000-0000-000000354103';
  target_person_id CONSTANT uuid := '00000000-0000-0000-0000-000000354001';
  function_definition text;
  delete_policy text;
  ordinary_denied boolean := false;
  direct_delete_count integer;
  qualification_count integer;
BEGIN
  SELECT pg_get_functiondef('public.replace_judge_qualifications(uuid, jsonb)'::regprocedure)
    INTO function_definition;

  IF function_definition LIKE '%get_my_person_id() = p_person_id%' THEN
    RAISE EXCEPTION 'FAIL replacement RPC still authorizes self-service callers';
  END IF;

  SELECT pol.polqual::text
    INTO delete_policy
  FROM pg_policy AS pol
  WHERE pol.polrelid = 'public.judge_qualifications'::regclass
    AND pol.polname = 'judge_qualifications_delete';

  IF delete_policy IS NULL OR delete_policy NOT LIKE '%has_role%site_admin%' THEN
    RAISE EXCEPTION 'FAIL qualification DELETE policy is not site-admin-only: %', delete_policy;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', ordinary_auth_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_auth_id, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.replace_judge_qualifications(target_person_id, '[]'::jsonb);
    ordinary_denied := false;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Not authorized to replace judge qualifications' THEN
      RAISE EXCEPTION 'FAIL ordinary caller raised unexpected error: %', SQLERRM;
    END IF;
    ordinary_denied := true;
  END;
  IF NOT ordinary_denied THEN
    RAISE EXCEPTION 'FAIL ordinary authenticated user replaced qualifications';
  END IF;

  BEGIN
    DELETE FROM public.judge_qualifications
    WHERE person_id = target_person_id;
    GET DIAGNOSTICS direct_delete_count = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    direct_delete_count := -1;
  END;
  IF direct_delete_count > 0 THEN
    RAISE EXCEPTION 'FAIL ordinary authenticated user deleted qualifications directly: % rows', direct_delete_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', secretary_auth_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', secretary_auth_id, 'role', 'authenticated')::text, true);
  PERFORM public.replace_judge_qualifications(
    target_person_id,
    '[{"person_id":"00000000-0000-0000-0000-000000354001","organization":"MYK9-354","qualification_level":"Secretary","disciplines":["Scent Work"],"judge_number":"SECRETARY-354"}]'::jsonb
  );
  SELECT count(*) INTO qualification_count
  FROM public.judge_qualifications
  WHERE person_id = target_person_id AND judge_number = 'SECRETARY-354';
  IF qualification_count <> 1 THEN
    RAISE EXCEPTION 'FAIL secretary replacement did not write qualification';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', admin_auth_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', admin_auth_id, 'role', 'authenticated')::text, true);
  PERFORM public.replace_judge_qualifications(target_person_id, '[]'::jsonb);
  SELECT count(*) INTO qualification_count
  FROM public.judge_qualifications
  WHERE person_id = target_person_id;
  IF qualification_count <> 0 THEN
    RAISE EXCEPTION 'FAIL site-admin replacement did not remove qualification';
  END IF;

  RAISE NOTICE 'PASS MYK9-354 ordinary denial, direct DELETE denial, secretary RPC access, site-admin access, and site-admin-only DELETE policy';
END;
$$;

ROLLBACK;
