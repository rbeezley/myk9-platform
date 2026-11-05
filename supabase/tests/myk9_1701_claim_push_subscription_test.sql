-- MYK9-1701: behavioral test for public.claim_my_push_subscription.
-- Account A holds an endpoint; account B (same browser) claims it. Executes the
-- INSTALLED function as each caller tier; every fixture rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/myk9_1701_claim_push_subscription_test.sql

BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT
  fixture.auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', fixture.email, '', now(), now(), now(), '{}', '{}',
  false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000170101'::uuid, 'myk9-1701-a@example.test'::text),
  ('00000000-0000-0000-0000-000000170102'::uuid, 'myk9-1701-b@example.test'::text)
) AS fixture(auth_id, email);

-- A already turned push on from the shared browser.
INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
VALUES ('00000000-0000-0000-0000-000000170101', 'https://push.example.test/myk9-1701', 'old-key', 'old-auth');

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  a_uid uuid := '00000000-0000-0000-0000-000000170101';
  b_uid uuid := '00000000-0000-0000-0000-000000170102';
  owner_id uuid;
  n integer;
  rejected boolean;
BEGIN
  -- B claims A's endpoint.
  PERFORM set_config('request.jwt.claim.sub', b_uid::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', b_uid, 'role', 'authenticated')::text, true);

  PERFORM public.claim_my_push_subscription(
    'https://push.example.test/myk9-1701', 'new-key', 'new-auth');

  SELECT count(*) INTO n FROM public.push_subscriptions
  WHERE endpoint = 'https://push.example.test/myk9-1701';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL expected exactly one row for the endpoint, got %', n;
  END IF;

  SELECT user_id INTO owner_id FROM public.push_subscriptions
  WHERE endpoint = 'https://push.example.test/myk9-1701' AND p256dh = 'new-key' AND auth = 'new-auth';
  IF owner_id IS DISTINCT FROM b_uid THEN
    RAISE EXCEPTION 'FAIL endpoint not reassigned to B (owner %)', owner_id;
  END IF;

  -- A no longer sees, and so no longer receives on, that device.
  PERFORM set_config('request.jwt.claim.sub', a_uid::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', a_uid, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.push_subscriptions
  WHERE endpoint = 'https://push.example.test/myk9-1701';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL A can still read the reassigned row';
  END IF;

  -- Anonymous caller is rejected.
  PERFORM set_config('request.jwt.claim.sub', a_uid::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', a_uid, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  rejected := false;
  BEGIN
    PERFORM public.claim_my_push_subscription('https://push.example.test/anon', 'k', 'a');
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL anonymous caller was allowed to claim';
  END IF;

  -- No uid is rejected.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated')::text, true);
  rejected := false;
  BEGIN
    PERFORM public.claim_my_push_subscription('https://push.example.test/none', 'k', 'a');
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL caller without a uid was allowed to claim';
  END IF;

  -- Empty arguments are rejected.
  PERFORM set_config('request.jwt.claim.sub', a_uid::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', a_uid, 'role', 'authenticated')::text, true);
  rejected := false;
  BEGIN
    PERFORM public.claim_my_push_subscription('', 'k', 'a');
  EXCEPTION WHEN invalid_parameter_value THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL empty endpoint was accepted';
  END IF;

  RAISE NOTICE 'PASS claim_my_push_subscription handover, anon/null/empty rejection';
END;
$$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.claim_my_push_subscription(text,text,text)', 'execute') THEN
    RAISE EXCEPTION 'FAIL anon can execute claim_my_push_subscription';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.claim_my_push_subscription(text,text,text)', 'execute') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute claim_my_push_subscription';
  END IF;
END;
$$;

ROLLBACK;
