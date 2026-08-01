-- MYK9-148 behavioral contract: anonymous identities cannot reserve AskQ
-- capacity, while a real free account receives exactly ten sequential daily
-- reservations and the eleventh is denied. A premium account receives fifty,
-- and a LAPSED premium account is back to ten. All fixtures roll back.
--
-- The premium cases are not decoration. The daily limit has now been wrong
-- twice — read from a column that does not exist on `people` (silently free
-- through PostgREST, a hard error once the same expression moved into SQL) —
-- and the free-account path passed throughout both. Only an assertion on the
-- premium limit can tell a working implementation from those.

BEGIN;

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-000000148011',
  'MYK9-148', 'Account', 'myk9-148-account@example.test', NULL
);

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  (
    '00000000-0000-0000-0000-000000148012',
    'MYK9-148', 'Premium', 'myk9-148-premium@example.test', NULL
  ),
  (
    '00000000-0000-0000-0000-000000148013',
    'MYK9-148', 'Lapsed', 'myk9-148-lapsed@example.test', NULL
  ),
  (
    '00000000-0000-0000-0000-000000148014',
    'MYK9-148', 'Granted', 'myk9-148-granted@example.test', NULL
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
    '00000000-0000-0000-0000-000000148104',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-148-lapsed@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  ),
  (
    '00000000-0000-0000-0000-000000148105',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9-148-granted@example.test', '', now(),
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

-- The granted account holds NO paid tier at all — its Premium comes only from
-- an active entitlement grant (a founding member). 20260801210000 moved the
-- limit onto has_effective_premium_access precisely so this account counts as
-- Premium, and nothing here covered it. grant_type's CHECK allows only
-- 'founding' | 'complimentary'.
UPDATE public.people
SET auth_user_id = '00000000-0000-0000-0000-000000148105'
WHERE id = '00000000-0000-0000-0000-000000148014';

INSERT INTO public.subscription_entitlement_grants (
  person_id, grant_type, starts_at, ends_at, reason
)
VALUES (
  '00000000-0000-0000-0000-000000148014', 'founding',
  now() - interval '1 day', now() + interval '365 days',
  'MYK9-148 behavioural fixture'
);

-- UPSERT, not INSERT: `handle_new_user` fires on each auth.users insert above,
-- adopts the pre-seeded people row BY EMAIL (migration 131) and creates its
-- exhibitor_profiles row, so a plain INSERT collides with the unique
-- auth_user_id. As service_role because trg_restrict_subscription_columns
-- (migration 109) is BEFORE UPDATE and rejects subscription writes from anyone
-- else — selling someone Premium is a service-role act, so the fixture performs
-- it as one rather than weakening the guard.
SET LOCAL ROLE service_role;

INSERT INTO public.exhibitor_profiles (
  person_id, auth_user_id, subscription_tier, subscription_expires_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000148012',
    '00000000-0000-0000-0000-000000148103',
    'premium',
    now() + interval '30 days'
  ),
  -- Lapsed: still says 'premium', expired yesterday. has_effective_premium_access
  -- requires a future expiry, matching the client gate, so this account is FREE.
  (
    '00000000-0000-0000-0000-000000148013',
    '00000000-0000-0000-0000-000000148104',
    'premium',
    now() - interval '1 day'
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
  lapsed_id CONSTANT uuid := '00000000-0000-0000-0000-000000148104';
  granted_id CONSTANT uuid := '00000000-0000-0000-0000-000000148105';
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

  PERFORM set_config('request.jwt.claim.sub', premium_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', premium_id, 'role', 'authenticated')::text,
    true
  );

  SELECT r.allowed, r.daily_limit, r.remaining
    INTO allowed, daily_limit, remaining
  FROM public.reserve_askq_query('premium-account question') AS r;

  IF allowed IS DISTINCT FROM true OR daily_limit <> 50 OR remaining <> 49 THEN
    RAISE EXCEPTION
      'FAIL premium reservation returned allowed=%, remaining=%, limit=%',
      allowed, remaining, daily_limit;
  END IF;

  -- A tier string alone must not buy capacity: this account still reads
  -- 'premium' but its subscription expired, so the server has to agree with the
  -- client gate and treat it as free.
  PERFORM set_config('request.jwt.claim.sub', lapsed_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', lapsed_id, 'role', 'authenticated')::text,
    true
  );

  SELECT r.allowed, r.daily_limit
    INTO allowed, daily_limit
  FROM public.reserve_askq_query('lapsed-premium question') AS r;

  IF allowed IS DISTINCT FROM true OR daily_limit <> 10 THEN
    RAISE EXCEPTION
      'FAIL lapsed premium got limit=% (expected the free 10)', daily_limit;
  END IF;

  -- The converse of the lapsed case: no tier string at all, but an active
  -- entitlement grant. The lapsed account above proves an expiry is honoured;
  -- only this one proves the SECOND source of Premium is consulted. A predicate
  -- that read exhibitor_profiles with a correct expiry check — and nothing else
  -- — would satisfy every other assertion in this file and still put every
  -- founding member on the free quota.
  PERFORM set_config('request.jwt.claim.sub', granted_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', granted_id, 'role', 'authenticated')::text,
    true
  );

  SELECT r.allowed, r.daily_limit
    INTO allowed, daily_limit
  FROM public.reserve_askq_query('granted-account question') AS r;

  IF allowed IS DISTINCT FROM true OR daily_limit IS DISTINCT FROM 50 THEN
    RAISE EXCEPTION
      'FAIL entitlement-grant account returned allowed=%, limit=% (expected true, 50)',
      allowed, daily_limit;
  END IF;

  RAISE NOTICE 'PASS MYK9-148 anonymous denial, ten free reservations, fifty for premium, ten for lapsed premium, fifty for an entitlement grant';
END;
$$;

ROLLBACK;
