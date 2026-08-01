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

  -- REVERSE counts DOWN from the first bound to the second, so `REVERSE 0..9`
  -- starts at 0, immediately falls below 9, and never executes the body. The
  -- ten-reservation assertion was vacuous; the "eleventh" call was really the
  -- first, which is why it came back allowed.
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

-- The tier branch had NO coverage, which is how 20260801170000 shipped reading
-- `people.subscription_tier` — a column that does not exist. plpgsql resolves
-- identifiers at execution time, so the function created cleanly and then
-- raised 42703 on every real call. These two cases exercise the branch.

-- Back to the session role: the block above left us as `authenticated`, which
-- cannot write auth.users. Seeding people BEFORE auth.users lets
-- handle_new_user() adopt the row by email instead of creating a second one.
RESET ROLE;

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000148012', 'MYK9-148', 'Premium',
   'myk9-148-premium@example.test', NULL),
  ('00000000-0000-0000-0000-000000148013', 'MYK9-148', 'Expired',
   'myk9-148-expired@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000148103',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'myk9-148-premium@example.test', '', now(), now(), now(), '{}', '{}',
   false, false, false),
  ('00000000-0000-0000-0000-000000148104',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'myk9-148-expired@example.test', '', now(), now(), now(), '{}', '{}',
   false, false, false);

UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000000148103'
WHERE id = '00000000-0000-0000-0000-000000148012';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000000148104'
WHERE id = '00000000-0000-0000-0000-000000148013';

-- handle_new_user() already created an exhibitor_profiles row for each auth
-- user, so this UPDATEs rather than INSERTs, and
-- restrict_subscription_column_updates() gates subscription columns on the
-- Postgres role (current_setting('role')), not a JWT claim.
SET LOCAL ROLE service_role;

UPDATE public.exhibitor_profiles
   SET subscription_tier = 'premium',
       subscription_expires_at = now() + interval '30 days'
 WHERE auth_user_id = '00000000-0000-0000-0000-000000148103';

UPDATE public.exhibitor_profiles
   SET subscription_tier = 'premium',
       subscription_expires_at = now() - interval '1 day'
 WHERE auth_user_id = '00000000-0000-0000-0000-000000148104';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  premium_id CONSTANT uuid := '00000000-0000-0000-0000-000000148103';
  expired_id CONSTANT uuid := '00000000-0000-0000-0000-000000148104';
  daily_limit integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', premium_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', premium_id, 'role', 'authenticated')::text,
    true
  );

  SELECT r.daily_limit INTO daily_limit
  FROM public.reserve_askq_query('premium question') AS r;

  IF daily_limit <> 50 THEN
    RAISE EXCEPTION 'FAIL active premium got daily_limit=%, expected 50', daily_limit;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', expired_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', expired_id, 'role', 'authenticated')::text,
    true
  );

  SELECT r.daily_limit INTO daily_limit
  FROM public.reserve_askq_query('expired question') AS r;

  -- An expired subscription must not keep the raised limit.
  IF daily_limit <> 10 THEN
    RAISE EXCEPTION 'FAIL expired premium got daily_limit=%, expected 10', daily_limit;
  END IF;

  RAISE NOTICE 'PASS MYK9-148 premium tier resolves from exhibitor_profiles and honours expiry';
END;
$$;

ROLLBACK;
