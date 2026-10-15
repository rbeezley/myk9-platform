-- MYK9-1117: atomic dog create preserves an optional calendar date, and
-- malformed dates cannot leave a partially created dog. All fixtures roll back.
BEGIN;
INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000001117011', 'MYK9-1117', 'Owner', 'myk91117-owner@example.test');
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous)
VALUES ('00000000-0000-0000-0000-000001117101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk91117-owner@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001117101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000001117101","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.create_dog_with_registrations(
 '{"id":"00000000-0000-0000-0000-000001117201","owner_id":"00000000-0000-0000-0000-000001117011","call_name":"MYK9-1117 Dated","breed":"Border Collie"}',
 '[{"organization":"AKC","registered_name":"MYK9-1117 Dated","registration_number":"MYK9-1117-DATE","registration_date":"2026-09-23"}]');
SELECT public.create_dog_with_registrations(
 '{"id":"00000000-0000-0000-0000-000001117202","owner_id":"00000000-0000-0000-0000-000001117011","call_name":"MYK9-1117 Empty","breed":"Border Collie"}',
 '[{"organization":"AKC","registered_name":"MYK9-1117 Empty","registration_number":"MYK9-1117-EMPTY","registration_date":""}]');
-- The exception block is the statement savepoint. PostgreSQL functions cannot
-- commit independently: an uncaught cast error rolls the entire call back. The
-- explicit FAIL below also catches a function that swallows the cast error.
DO $$
BEGIN
 BEGIN
  PERFORM public.create_dog_with_registrations(
   '{"id":"00000000-0000-0000-0000-000001117203","owner_id":"00000000-0000-0000-0000-000001117011","call_name":"MYK9-1117 Invalid","breed":"Border Collie"}',
   '[{"organization":"AKC","registered_name":"MYK9-1117 Invalid","registration_number":"MYK9-1117-INVALID","registration_date":"not-a-date"}]');
  RAISE EXCEPTION 'FAIL invalid registration date was accepted';
 EXCEPTION WHEN invalid_datetime_format THEN NULL;
 END;
END;
$$;
DO $$
BEGIN
 IF (SELECT registration_date FROM public.dog_registrations WHERE dog_id='00000000-0000-0000-0000-000001117201') IS DISTINCT FROM DATE '2026-09-23' THEN
  RAISE EXCEPTION 'FAIL authenticated owner cannot read the persisted date';
 END IF;
 RAISE NOTICE 'PASS authenticated owner date readback';
END;
$$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT registration_date FROM public.dog_registrations WHERE dog_id='00000000-0000-0000-0000-000001117201') IS DISTINCT FROM DATE '2026-09-23' THEN
  RAISE EXCEPTION 'FAIL supplied registration date did not persist';
 END IF;
 IF (SELECT registration_date FROM public.dog_registrations WHERE dog_id='00000000-0000-0000-0000-000001117202') IS NOT NULL THEN
  RAISE EXCEPTION 'FAIL blank registration date was invented';
 END IF;
 IF has_function_privilege('anon','public.create_dog_with_registrations(jsonb,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'FAIL anonymous RPC access expanded';
 END IF;
 RAISE NOTICE 'PASS MYK9-1117 date, blank, invalid-date rejection and ACL controls';
END;
$$;
ROLLBACK;
