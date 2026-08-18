-- Fix: public.reserve_askq_query (introduced 20260801170000, MYK9-148) reads
-- p.subscription_tier from public.people, but that column has never existed
-- there — it lives only on public.exhibitor_profiles. plpgsql resolves
-- column references at RUN time, not at CREATE FUNCTION time, so the prior
-- migration applied cleanly and the bad reference only surfaced when the
-- function was called: every invocation raised
-- "column p.subscription_tier does not exist", leaving the AskQ quota path
-- broken live on staging. This migration repoints the daily-limit lookup at
-- exhibitor_profiles.auth_user_id / exhibitor_profiles.subscription_tier and
-- changes nothing else — same 'premium' comparison, same COALESCE(..., 10)
-- fallback, same guards, advisory lock, day-window maths, and return shape.

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

  SELECT CASE WHEN ep.subscription_tier = 'premium' THEN 50 ELSE 10 END
    INTO v_daily_limit
  FROM public.exhibitor_profiles ep
  WHERE ep.auth_user_id = v_user_id
  LIMIT 1;
  v_daily_limit := COALESCE(v_daily_limit, 10);

  PERFORM pg_advisory_xact_lock(
    hashtextextended('askq:' || v_user_id::text, 0)
  );

  v_now := clock_timestamp();
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
  'MYK9-148: atomically reserves one real-account AskQ quota slot per UTC day; anonymous identities are denied.';

NOTIFY pgrst, 'reload schema';
