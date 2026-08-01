-- MYK9-148 behavioral contract: anonymous identities cannot reserve AskQ
-- capacity, while a real free account receives exactly ten sequential daily
-- reservations and the eleventh is denied. A premium account receives fifty.
-- All fixtures roll back.
--
-- The premium case is not decoration. The original limiter read
-- `people.subscription_tier`, a column that does not exist on that table, so
-- premium accounts silently got the free quota through PostgREST and a hard
-- error once the same expression moved into SQL. Only an assertion on the
-- premium limit can tell those apart from a working implementation.

BEGIN;

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-000000148011',
  'MYK9-148', 'Account', 'myk9-148-account@example.test', NULL
);

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-000000148012',
  'MYK9-148', 'Premium', 'myk9-148-premium@example.test', NULL
);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  (
    '00000000-0000-0000-0000-000000148103',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-148-premium@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  ),
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

UPDATE public.people
SET auth_user_id = '00000000-0000-0000-0000-000000148103'
WHERE id = '00000000-0000-0000-0000-000000148012';

-- Paid Premium requires a NON-NULL future expiry — has_effective_premium_access
-- treats premium-with-null-expiry as expired, matching the client gate.
--
-- UPSERT, not INSERT: `handle_new_user` fires on the auth.users insert above,
-- adopts the pre-seeded people row by email (migration 131) and creates its
-- exhibitor_profiles row. A plain INSERT collides with the unique auth_user_id
-- and aborts the test before it reaches the premium assertion. The INSERT arm
-- still covers an environment where the trigger did not run.
--
-- As service_role: `trg_restrict_subscription_columns` (migration 109) is
-- BEFORE UPDATE and rejects subscription-column writes from anyone else, which
-- is exactly the conflict arm this upsert lands on. Selling someone Premium is
-- a service-role act, so the fixture performs it as one rather than weakening
-- the guard.
SET LOCAL ROLE service_role;

INSERT INTO public.exhibitor_profiles (
  person_id, auth_user_id, subscription_tier, subscription_expires_at
)
VALUES (
  '00000000-0000-0000-0000-000000148012',
  '00000000-0000-0000-0000-000000148103',
  'premium',
  now() + interval '30 days'
)
ON CONFLICT (auth_user_id) DO UPDATE
SET subscription_tier = EXCLUDED.subscription_tier,
    subscription_expires_at = EXCLUDED.subscription_expires_at;

-- Back to the owner before switching to the caller role: service_role is not a
-- member of authenticated, so SET ROLE would fail from inside it.
RESET ROLE;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  account_id CONSTANT uuid := '00000000-0000-0000-0000-000000148101';
  anonymous_id CONSTANT uuid := '00000000-0000-0000-0000-000000148102';
  premium_id CONSTANT uuid := '00000000-0000-0000-0000-000000148103';
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
  -- ran zero iterations: the ten reservations this test exists to prove were
  -- never made, and the "eleventh" call was really the first.
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
    -- Report the values, not just the verdict: five conditions share this
    -- branch, and "was not denied" cannot say which one moved.
    RAISE EXCEPTION
      'FAIL eleventh reservation: allowed=%, log_id=%, remaining=%, limit=%, resets_at=%',
      allowed, log_id, remaining, daily_limit, resets_at;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', premium_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', premium_id, 'role', 'authenticated')::text,
    true
  );

  SELECT r.allowed, r.log_id, r.remaining, r.daily_limit, r.resets_at
    INTO allowed, log_id, remaining, daily_limit, resets_at
  FROM public.reserve_askq_query('premium-account question') AS r;

  IF allowed IS DISTINCT FROM true OR daily_limit <> 50 OR remaining <> 49 THEN
    RAISE EXCEPTION
      'FAIL premium reservation returned allowed=%, remaining=%, limit=%',
      allowed, remaining, daily_limit;
  END IF;

  RAISE NOTICE 'PASS MYK9-148 anonymous denial, ten free-account reservations, fifty for premium';
END;
$$;

ROLLBACK;
