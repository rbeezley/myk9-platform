-- MYK9-125: keep premium-generation spend bounded per authenticated account.
--
-- The original throttle serialized and counted (auth user, show), allowing a
-- manager to multiply the five-attempt window by changing show IDs. Keep the
-- show-scoped ceiling for local protection, but add the same five-attempt
-- rolling ceiling across every show owned by the account.

BEGIN;

CREATE INDEX IF NOT EXISTS premium_generation_attempts_account_idx
  ON public.premium_generation_attempts (auth_user_id, attempted_at DESC);

CREATE OR REPLACE FUNCTION public.check_and_record_premium_generation_attempt(
  p_auth_user_id uuid,
  p_show_id uuid
)
RETURNS TABLE (
  allowed boolean,
  attempts_count integer,
  remaining_attempts integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz;
  v_window_start timestamptz;
  v_max_attempts constant integer := 5;
  v_account_attempt_count integer;
  v_show_attempt_count integer;
  v_account_oldest_attempt timestamptz;
  v_show_oldest_attempt timestamptz;
BEGIN
  IF p_auth_user_id IS NULL OR p_show_id IS NULL THEN
    RAISE EXCEPTION 'auth user id and show id are required'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize every show for this account. A user-scoped lock is required so
  -- concurrent requests for different public shows cannot both pass the
  -- account-wide check before either insert is visible to the other.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'premium-generation-account:' || p_auth_user_id::text,
      0
    )
  );

  v_now := clock_timestamp();
  v_window_start := v_now - interval '15 minutes';

  SELECT
    count(*),
    count(*) FILTER (WHERE show_id = p_show_id),
    min(attempted_at),
    min(attempted_at) FILTER (WHERE show_id = p_show_id)
    INTO
      v_account_attempt_count,
      v_show_attempt_count,
      v_account_oldest_attempt,
      v_show_oldest_attempt
  FROM public.premium_generation_attempts
  WHERE auth_user_id = p_auth_user_id
    AND attempted_at >= v_window_start;

  IF v_account_attempt_count >= v_max_attempts THEN
    RETURN QUERY SELECT
      false,
      v_account_attempt_count,
      0,
      greatest(
        ceil(extract(epoch FROM (v_account_oldest_attempt + interval '15 minutes' - v_now)))::integer,
        1
      );
    RETURN;
  END IF;

  IF v_show_attempt_count >= v_max_attempts THEN
    RETURN QUERY SELECT
      false,
      v_show_attempt_count,
      0,
      greatest(
        ceil(extract(epoch FROM (v_show_oldest_attempt + interval '15 minutes' - v_now)))::integer,
        1
      );
    RETURN;
  END IF;

  INSERT INTO public.premium_generation_attempts (auth_user_id, show_id, attempted_at)
  VALUES (p_auth_user_id, p_show_id, v_now);

  -- Report the account-wide window. The edge contract only needs a truthful
  -- count/remaining pair to reject malformed results and expose 429s.
  RETURN QUERY SELECT
    true,
    v_account_attempt_count + 1,
    v_max_attempts - (v_account_attempt_count + 1),
    0;
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_record_premium_generation_attempt(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_premium_generation_attempt(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
