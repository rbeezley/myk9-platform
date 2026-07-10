-- Backfills the passcode sign-in throttle referenced by
-- supabase/functions/validate-passcode/index.ts since it shipped (PR #952,
-- feat(at-show): ringside passcode anon-session identity). The edge function
-- has always called check_login_rate_limit/record_login_attempt, but neither
-- was ever defined in a migration — confirmed via `git log -S` across all
-- migrations (zero hits) and a live-DB catalog query (zero matching
-- functions). The edge function fails OPEN on the RPC error, so passcode
-- sign-in itself was never broken; the throttle has simply been a silent
-- no-op since launch. This migration implements it for real: 5 attempts per
-- 15 minutes per IP, 30-minute block after that.
--
-- Service-role only: PostgREST/edge-fn caller uses the service role key, so
-- no anon/authenticated grant is needed or wanted (this table would let an
-- attacker read/spoof other IPs' attempt history otherwise).

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  success boolean NOT NULL,
  passcode_prefix text,
  license_key uuid,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_ip_created_idx
  ON public.login_attempts (ip_address, created_at DESC);

-- No anon/authenticated grants: service-role (edge function) only.
REVOKE ALL ON public.login_attempts FROM public, anon, authenticated;
GRANT SELECT, INSERT ON public.login_attempts TO service_role;

-- Defense-in-depth: service_role bypasses RLS regardless, but this stops a
-- future `GRANT ... TO authenticated` from silently exposing every IP's
-- attempt history with no RLS backstop. No policies = zero non-service reads.
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_ip_address text,
  p_success boolean,
  p_passcode_prefix text DEFAULT NULL,
  p_license_key uuid DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.login_attempts (ip_address, success, passcode_prefix, license_key, user_agent)
  VALUES (p_ip_address, p_success, p_passcode_prefix, p_license_key, p_user_agent);
$$;

REVOKE ALL ON FUNCTION public.record_login_attempt(text, boolean, text, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, boolean, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.check_login_rate_limit(
  p_ip_address text
) RETURNS TABLE (
  allowed boolean,
  attempts_count int,
  remaining_attempts int,
  blocked_until timestamptz,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz := now() - interval '15 minutes';
  v_block_window timestamptz := now() - interval '30 minutes';
  v_max_attempts constant int := 5;
  v_failed_count int;
  v_last_failed_at timestamptz;
BEGIN
  SELECT count(*), max(created_at)
    INTO v_failed_count, v_last_failed_at
  FROM public.login_attempts
  WHERE ip_address = p_ip_address
    AND success = false
    AND created_at >= v_window_start;

  IF v_failed_count >= v_max_attempts AND v_last_failed_at >= v_block_window THEN
    RETURN QUERY SELECT
      false,
      v_failed_count,
      0,
      v_last_failed_at + interval '30 minutes',
      'Too many attempts. Try again later.'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    v_failed_count,
    greatest(v_max_attempts - v_failed_count, 0),
    NULL::timestamptz,
    'ok'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.check_login_rate_limit(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text) TO service_role;
