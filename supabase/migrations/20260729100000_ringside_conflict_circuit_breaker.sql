-- Bound authorized ringside OCC conflict storms from already-deployed clients.
--
-- Client backoff cannot protect the database from a stale browser bundle. This
-- one-minute monitor samples the rollback-proof ringside_conflict_seq and opens
-- a durable breaker when conflicts exceed 300 in one interval. Opening the
-- breaker revokes authenticated RPC execution and commits; it never auto-arms.
--
-- Recovery is an operator action after the caller is contained: update the
-- singleton row to armed with a fresh sequence baseline, then restore the RPC
-- grant in the same separately approved transaction.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE TABLE public.ringside_conflict_breaker (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  state text NOT NULL DEFAULT 'armed' CHECK (state IN ('armed', 'tripped')),
  conflict_threshold integer NOT NULL DEFAULT 300 CHECK (conflict_threshold > 0),
  last_sequence_value bigint NOT NULL DEFAULT 0 CHECK (last_sequence_value >= 0),
  last_checked_at timestamptz,
  observed_conflicts bigint NOT NULL DEFAULT 0 CHECK (observed_conflicts >= 0),
  observed_window_seconds numeric,
  tripped_at timestamptz,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ringside_conflict_breaker IS
  'Singleton state for the manually re-armed ringside OCC conflict circuit breaker.';

ALTER TABLE public.ringside_conflict_breaker ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ringside_conflict_breaker FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ringside_conflict_breaker FROM PUBLIC, anon, authenticated;

INSERT INTO public.ringside_conflict_breaker (
  singleton,
  state,
  last_sequence_value,
  last_checked_at,
  tripped_at,
  reason
)
SELECT
  true,
  CASE
    WHEN has_function_privilege(
      'authenticated',
      'public.ringside_update_entry(uuid,jsonb,integer)',
      'EXECUTE'
    ) THEN 'armed'
    ELSE 'tripped'
  END,
  CASE WHEN is_called THEN last_value ELSE 0 END,
  now(),
  CASE
    WHEN has_function_privilege(
      'authenticated',
      'public.ringside_update_entry(uuid,jsonb,integer)',
      'EXECUTE'
    ) THEN NULL
    ELSE now()
  END,
  CASE
    WHEN has_function_privilege(
      'authenticated',
      'public.ringside_update_entry(uuid,jsonb,integer)',
      'EXECUTE'
    ) THEN NULL
    ELSE 'Initialized while authenticated RPC execution was already revoked'
  END
FROM public.ringside_conflict_seq
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.monitor_ringside_conflict_breaker()
RETURNS public.ringside_conflict_breaker
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_breaker public.ringside_conflict_breaker%ROWTYPE;
  v_current_sequence bigint;
  v_delta bigint;
  v_window_seconds numeric;
BEGIN
  SELECT *
    INTO v_breaker
    FROM public.ringside_conflict_breaker
   WHERE singleton
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ringside conflict breaker state is missing'
      USING errcode = 'P0002';
  END IF;

  SELECT CASE WHEN is_called THEN last_value ELSE 0 END
    INTO v_current_sequence
    FROM public.ringside_conflict_seq;

  v_delta := greatest(v_current_sequence - v_breaker.last_sequence_value, 0);
  v_window_seconds := greatest(
    extract(epoch FROM (now() - coalesce(v_breaker.last_checked_at, now()))),
    0
  );

  -- A tripped breaker stays fail-closed. This also reverses an accidental grant
  -- unless an operator explicitly re-arms the singleton state.
  IF v_breaker.state = 'tripped' THEN
    EXECUTE
      'REVOKE EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) FROM authenticated';

    UPDATE public.ringside_conflict_breaker
       SET last_sequence_value = v_current_sequence,
           last_checked_at = now(),
           observed_conflicts = v_delta,
           observed_window_seconds = v_window_seconds,
           updated_at = now()
     WHERE singleton
     RETURNING * INTO v_breaker;

    RETURN v_breaker;
  END IF;

  IF v_delta >= v_breaker.conflict_threshold THEN
    EXECUTE
      'REVOKE EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) FROM authenticated';

    UPDATE public.ringside_conflict_breaker
       SET state = 'tripped',
           last_sequence_value = v_current_sequence,
           last_checked_at = now(),
           observed_conflicts = v_delta,
           observed_window_seconds = v_window_seconds,
           tripped_at = now(),
           reason = format(
             'Observed %s ringside OCC conflicts in %s seconds (threshold %s)',
             v_delta,
             round(v_window_seconds, 1),
             v_breaker.conflict_threshold
           ),
           updated_at = now()
     WHERE singleton
     RETURNING * INTO v_breaker;
  ELSE
    UPDATE public.ringside_conflict_breaker
       SET last_sequence_value = v_current_sequence,
           last_checked_at = now(),
           observed_conflicts = v_delta,
           observed_window_seconds = v_window_seconds,
           updated_at = now()
     WHERE singleton
     RETURNING * INTO v_breaker;
  END IF;

  RETURN v_breaker;
END;
$$;

REVOKE ALL ON FUNCTION public.monitor_ringside_conflict_breaker()
  FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'ringside-conflict-circuit-breaker';

SELECT cron.schedule(
  'ringside-conflict-circuit-breaker',
  '* * * * *',
  $$ SELECT public.monitor_ringside_conflict_breaker(); $$
);

COMMIT;
