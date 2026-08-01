-- MYK9-148 follow-up: resolve AskQ Premium through the one server authority.
--
-- 20260801170000 computed the daily limit from `people.subscription_tier`.
-- That column has never been on `people` — it lives on `exhibitor_profiles`
-- (009_online_entry_system.sql). In SQL that is a hard failure, so EVERY call to
-- reserve_askq_query raised `column p.subscription_tier does not exist` and AskQ
-- was unusable for all accounts.
--
-- 20260801200000 repointed the read at `exhibitor_profiles.subscription_tier`,
-- which stopped the error. This migration supersedes that lookup: an inline
-- `subscription_tier = 'premium'` still answers a narrower question than the
-- product does. It misses the `pro` tier, ignores `subscription_expires_at`
-- (so a lapsed subscription keeps the raised limit forever), and cannot see
-- entitlement grants at all.
--
-- The Edge function it replaced had the same wrong column, but reached it
-- through PostgREST, where the failed select was swallowed into a null row and
-- silently fell through to the free limit. So the "prior tier semantics" that
-- migration set out to preserve were themselves broken: premium accounts have
-- been getting the free quota all along. There is no working behaviour to
-- restore, only a correct one to establish.
--
-- Premium now comes from `has_effective_premium_access` (20260724120000), the
-- documented single server authority for account Premium. It covers paid tier
-- WITH a future expiry plus active founding/complimentary grants, so a founding
-- member gets the premium quota that a raw `subscription_tier` read would deny
-- them. It is caller-scoped (own person or site admin, else false), and we pass
-- the caller's own person id, so the scoping is satisfied by construction.
--
-- Unchanged: the advisory-lock reservation, the UTC-day budget, the anonymous
-- rejection, and the 50/10 limits.

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
  v_person_id uuid;
  v_now timestamptz;
  v_day_start timestamptz;
  v_resets_at timestamptz;
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

  v_now := clock_timestamp();

  SELECT p.id
    INTO v_person_id
  FROM public.people p
  WHERE p.auth_user_id = v_user_id
  LIMIT 1;

  -- An account with no people row is not premium; it still gets the free quota
  -- rather than an error, matching the pre-existing fall-through.
  v_daily_limit := CASE
    WHEN v_person_id IS NOT NULL
     AND public.has_effective_premium_access(v_person_id, v_now)
    THEN 50
    ELSE 10
  END;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('askq:' || v_user_id::text, 0)
  );

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
  'MYK9-148: atomically reserves one real-account AskQ quota slot per UTC day; anonymous identities are denied. Premium (50/day vs 10) comes from has_effective_premium_access, not a raw subscription_tier column.';

NOTIFY pgrst, 'reload schema';
