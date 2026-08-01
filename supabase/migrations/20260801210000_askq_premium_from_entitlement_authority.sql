-- MYK9-148 follow-up: take the AskQ premium limit from the entitlement authority.
--
-- 20260801200000 repaired the crash (the daily limit was read from a column that
-- does not exist on `people`) by pointing the lookup at
-- `exhibitor_profiles.subscription_tier`. That restored service, and left two
-- behaviours that disagree with the rest of the platform:
--
--   1. Expiry is ignored. A row still reading 'premium' after its subscription
--      lapsed keeps 50/day. `has_effective_premium_access` requires a NON-NULL
--      expiry in the future precisely because the client gate treats
--      premium-with-null-or-past-expiry as expired — so server and client
--      currently disagree about who is Premium.
--   2. Grants are invisible. Founding and complimentary members hold their
--      Premium as a `subscription_entitlement_grants` row, not a tier string, so
--      a raw tier read gives them the FREE quota.
--
-- Both are what `has_effective_premium_access` (20260724120000) exists to
-- prevent: it is the documented single server authority for account Premium, and
-- it is already what Premium record RLS and get_own_entitlement_context use.
-- Reading it here stops the AskQ quota being a third opinion.
--
-- It is caller-scoped — it answers truthfully only for the caller's own person
-- or a site admin — and we pass the caller's own person id, so the scoping is
-- satisfied by construction.
--
-- Unchanged: the anonymous rejection, the advisory-lock reservation, the UTC-day
-- window, the grants, SECURITY DEFINER and the empty search_path.

CREATE OR REPLACE FUNCTION public.reserve_askq_query(p_query text)
RETURNS TABLE (
  allowed boolean,
  log_id uuid,
  remaining integer,
  daily_limit integer,
  resets_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_now timestamptz;
  v_day_start timestamptz;
  v_resets_at timestamptz;
  v_person_id uuid;
  v_daily_limit integer;
  v_used integer;
  v_log_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'real account required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('askq:' || v_user_id::text, 0)
  );

  -- AFTER the lock. A request can wait here, and if it waited across UTC
  -- midnight a timestamp captured earlier would bill it to yesterday's budget
  -- and report yesterday's reset. One clock read serves the entitlement
  -- evaluation, the day window, and the row's created_at, so all three agree.
  v_now := clock_timestamp();

  SELECT p.id
    INTO v_person_id
  FROM public.people p
  WHERE p.auth_user_id = v_user_id
  LIMIT 1;

  -- An account with no people row is not premium; it still gets the free quota
  -- rather than an error, matching the previous COALESCE fall-through.
  v_daily_limit := CASE
    WHEN v_person_id IS NOT NULL
     AND public.has_effective_premium_access(v_person_id, v_now)
    THEN 50
    ELSE 10
  END;

  v_day_start := (v_now AT TIME ZONE 'UTC')::date AT TIME ZONE 'UTC';
  v_resets_at := v_day_start + interval '1 day';

  SELECT count(*)::integer
    INTO v_used
  FROM public.chatbot_query_log
  WHERE user_id = v_user_id
    AND created_at >= v_day_start
    AND created_at < v_resets_at;

  IF v_used >= v_daily_limit THEN
    RETURN QUERY SELECT false, NULL::uuid, 0, v_daily_limit, v_resets_at;
    RETURN;
  END IF;

  INSERT INTO public.chatbot_query_log (
    query,
    tools_used,
    user_id,
    app_source,
    response_time_ms,
    created_at
  )
  VALUES (
    left(coalesce(p_query, ''), 2000),
    ARRAY[]::text[],
    v_user_id,
    'myk9show',
    0,
    v_now
  )
  RETURNING id INTO v_log_id;

  RETURN QUERY SELECT
    true,
    v_log_id,
    v_daily_limit - v_used - 1,
    v_daily_limit,
    v_resets_at;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_askq_query(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_askq_query(text) TO authenticated;

COMMENT ON FUNCTION public.reserve_askq_query(text) IS
  'MYK9-148: atomically reserves one real-account AskQ quota slot per UTC day; anonymous identities are denied. Premium (50/day vs 10) comes from has_effective_premium_access — paid tier with a future expiry, or an active founding/complimentary grant.';

NOTIFY pgrst, 'reload schema';
