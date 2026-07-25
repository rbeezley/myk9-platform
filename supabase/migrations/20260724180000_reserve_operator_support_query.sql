-- Atomically reserve the daily Operator Support model quota and create its
-- redacted audit row. The per-user advisory lock prevents concurrent requests
-- from observing the same available quota slot.
--
-- Forward rollback SQL (run only after reverting the Edge Function caller):
-- DROP FUNCTION public.reserve_operator_support_query();
-- DROP INDEX public.idx_chatbot_query_log_operator_daily;

BEGIN;

CREATE INDEX IF NOT EXISTS idx_chatbot_query_log_operator_daily
  ON public.chatbot_query_log (user_id, created_at DESC)
  WHERE app_source = 'operator-support';

CREATE OR REPLACE FUNCTION public.reserve_operator_support_query()
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
  v_daily_limit constant integer := 20;
  v_used integer;
  v_log_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'site admin required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('operator-support:' || v_user_id::text, 0)
  );

  v_now := clock_timestamp();
  v_day_start := (v_now AT TIME ZONE 'UTC')::date AT TIME ZONE 'UTC';
  v_resets_at := v_day_start + interval '1 day';

  SELECT count(*)::integer
    INTO v_used
  FROM public.chatbot_query_log
  WHERE user_id = v_user_id
    AND app_source = 'operator-support'
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
    '[operator support query redacted]',
    ARRAY[]::text[],
    v_user_id,
    'operator-support',
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

REVOKE ALL ON FUNCTION public.reserve_operator_support_query() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_operator_support_query() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
