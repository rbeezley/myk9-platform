-- MYK9-148 behavioral contract: anonymous identities cannot reserve AskQ
-- capacity, while a real free account receives exactly ten sequential daily
-- reservations and the eleventh is denied. All fixtures roll back.

BEGIN;

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-000000148011',
  'MYK9-148', 'Account', 'myk9-148-account@example.test', NULL
);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  (
    '00000000-0000-0000-0000-000000148101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-148-account@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  ),
  (
    '00000000-0000-0000-0000-000000148102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-148-anon@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, true
  );

UPDATE public.people
SET auth_user_id = '00000000-0000-0000-0000-000000148101'
WHERE id = '00000000-0000-0000-0000-000000148011';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  account_id CONSTANT uuid := '00000000-0000-0000-0000-000000148101';
  anonymous_id CONSTANT uuid := '00000000-0000-0000-0000-000000148102';
  allowed boolean;
  log_id uuid;
  remaining integer;
  daily_limit integer;
  resets_at timestamptz;
  reservation_count integer := 0;
  expected_remaining integer;
BEGIN
  IF has_function_privilege('anon', 'public.reserve_askq_query(text)', 'execute') THEN
    RAISE EXCEPTION 'FAIL anon can execute reserve_askq_query';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.reserve_askq_query(text)', 'execute') THEN
    RAISE EXCEPTION 'FAIL authenticated lost execute on reserve_askq_query';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', anonymous_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', anonymous_id,
      'role', 'authenticated',
      'is_anonymous', true
    )::text,
    true
  );

  BEGIN
    PERFORM public.reserve_askq_query('anonymous test');
    RAISE EXCEPTION 'FAIL anonymous identity reserved AskQ capacity';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', account_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', account_id, 'role', 'authenticated')::text,
    true
  );

  -- plpgsql REVERSE counts DOWN from the first bound to the second, so
  -- `REVERSE 0..9` runs zero iterations and silently skips all ten
  -- reservations — which is why the eleventh call was still being allowed.
  FOR expected_remaining IN REVERSE 9..0 LOOP
    SELECT r.allowed, r.log_id, r.remaining, r.daily_limit, r.resets_at
      INTO allowed, log_id, remaining, daily_limit, resets_at
    FROM public.reserve_askq_query('free-account question') AS r;

    IF allowed IS DISTINCT FROM true OR log_id IS NULL OR daily_limit <> 10
       OR remaining <> expected_remaining OR resets_at IS NULL THEN
      RAISE EXCEPTION
        'FAIL reservation % returned allowed=%, log_id=%, remaining=%, limit=%, resets_at=%',
        reservation_count + 1, allowed, log_id, remaining, daily_limit, resets_at;
    END IF;
    reservation_count := reservation_count + 1;
  END LOOP;

  SELECT r.allowed, r.log_id, r.remaining, r.daily_limit, r.resets_at
    INTO allowed, log_id, remaining, daily_limit, resets_at
  FROM public.reserve_askq_query('free-account question') AS r;

  IF allowed IS DISTINCT FROM false OR log_id IS NOT NULL OR remaining <> 0
     OR daily_limit <> 10 OR resets_at IS NULL THEN
    RAISE EXCEPTION 'FAIL eleventh reservation was not denied';
  END IF;

  RAISE NOTICE 'PASS MYK9-148 anonymous denial and exactly ten free-account reservations';
END;
$$;

ROLLBACK;
