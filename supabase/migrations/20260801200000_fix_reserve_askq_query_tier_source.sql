-- MYK9-148 repair: reserve_askq_query read a column that does not exist.
--
-- Migration 20260801170000 resolved the premium tier with:
--
--   SELECT CASE WHEN p.subscription_tier = 'premium' THEN 50 ELSE 10 END
--     FROM public.people p WHERE p.auth_user_id = v_user_id
--
-- `people` has no `subscription_tier` column — it lives on
-- `exhibitor_profiles` (added in 009_online_entry_system). Postgres resolves
-- plpgsql identifiers at EXECUTION time, so the function was created
-- successfully and then raised 42703 "column p.subscription_tier does not
-- exist" on the first real call. That means AskQ quota reservation has been
-- failing for EVERY authenticated caller since 20260801170000 was applied,
-- and the behavioural SQL test has been red on main since it merged.
--
-- Tier semantics now match the established premium predicate used by
-- can_use_premium_entitlement (20260724120000): tier IN ('premium','pro') AND
-- a subscription that has not expired. The original comment said "premium
-- receives 50", but an expired subscription must not keep the raised limit,
-- and `pro` is a paid tier the CHECK constraint has always allowed.
--
-- exhibitor_profiles carries auth_user_id directly, so no join through people
-- is needed.

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

  SELECT CASE
           WHEN ep.subscription_tier IN ('premium', 'pro')
                AND ep.subscription_expires_at IS NOT NULL
                AND ep.subscription_expires_at > v_now
           THEN 50
           ELSE 10
         END
    INTO v_daily_limit
  FROM public.exhibitor_profiles ep
  WHERE ep.auth_user_id = v_user_id
  LIMIT 1;
  v_daily_limit := COALESCE(v_daily_limit, 10);

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
  'MYK9-148: atomically reserves one real-account AskQ quota slot per UTC day; anonymous identities are denied. Premium/pro tier read from exhibitor_profiles.';

NOTIFY pgrst, 'reload schema';
