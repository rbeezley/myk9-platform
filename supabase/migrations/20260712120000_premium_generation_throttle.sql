-- SA-025: atomically limit paid premium-generation attempts to five per
-- authenticated user and show in a rolling 15-minute window. Attempts are
-- operational accounting, not premium correction history, so they live apart
-- from public.premium_generations and are retained for only 24 hours.
--
-- Forward rollback SQL (run only after reverting the Edge Function caller):
-- SELECT cron.unschedule('prune-premium-generation-attempts');
-- DROP FUNCTION public.prune_premium_generation_attempts();
-- DROP FUNCTION public.check_and_record_premium_generation_attempt(uuid, uuid);
-- DROP TABLE public.premium_generation_attempts;

BEGIN;

CREATE TABLE public.premium_generation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  show_id uuid NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX premium_generation_attempts_enforcement_idx
  ON public.premium_generation_attempts (auth_user_id, show_id, attempted_at DESC);

CREATE INDEX premium_generation_attempts_retention_idx
  ON public.premium_generation_attempts (attempted_at);

-- The enforcement index covers auth-user cascades by its leftmost prefix;
-- show deletion needs its own leading-key index for the second foreign key.
CREATE INDEX premium_generation_attempts_show_idx
  ON public.premium_generation_attempts (show_id);

REVOKE ALL ON public.premium_generation_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.premium_generation_attempts TO service_role;

ALTER TABLE public.premium_generation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_generation_attempts FORCE ROW LEVEL SECURITY;

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
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz := v_now - interval '15 minutes';
  v_max_attempts constant integer := 5;
  v_attempt_count integer;
  v_oldest_attempt timestamptz;
BEGIN
  IF p_auth_user_id IS NULL OR p_show_id IS NULL THEN
    RAISE EXCEPTION 'auth user id and show id are required'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize only this user/show window. A waiting transaction takes a fresh
  -- statement snapshot for the count after the prior transaction commits, so
  -- parallel fifth/sixth attempts cannot both pass.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'premium-generation:' || p_auth_user_id::text || ':' || p_show_id::text,
      0
    )
  );

  SELECT count(*), min(attempted_at)
    INTO v_attempt_count, v_oldest_attempt
  FROM public.premium_generation_attempts
  WHERE auth_user_id = p_auth_user_id
    AND show_id = p_show_id
    AND attempted_at >= v_window_start;

  IF v_attempt_count >= v_max_attempts THEN
    RETURN QUERY SELECT
      false,
      v_attempt_count,
      0,
      greatest(
        ceil(extract(epoch FROM (v_oldest_attempt + interval '15 minutes' - v_now)))::integer,
        1
      );
    RETURN;
  END IF;

  INSERT INTO public.premium_generation_attempts (auth_user_id, show_id, attempted_at)
  VALUES (p_auth_user_id, p_show_id, v_now);

  RETURN QUERY SELECT
    true,
    v_attempt_count + 1,
    v_max_attempts - (v_attempt_count + 1),
    0;
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_record_premium_generation_attempt(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_premium_generation_attempt(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.prune_premium_generation_attempts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.premium_generation_attempts
  WHERE attempted_at < now() - interval '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_premium_generation_attempts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_premium_generation_attempts() TO service_role;

SELECT cron.unschedule('prune-premium-generation-attempts')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'prune-premium-generation-attempts'
);

SELECT cron.schedule(
  'prune-premium-generation-attempts',
  '15 4 * * *',
  $$ SELECT public.prune_premium_generation_attempts(); $$
);

NOTIFY pgrst, 'reload schema';

COMMIT;
