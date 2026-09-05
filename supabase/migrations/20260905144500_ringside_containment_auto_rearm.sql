-- MYK9-400 / SA-2026-09-05-03: the ringside OCC breaker is one-way.
--
-- ringside_containment_sample() can TRIP the breaker but has never been able to
-- release it. Release is ringside_containment_rearm(), which is gated on
-- is_site_admin() and has to be called by a human. On 2026-08-25T23:25Z a real
-- storm tripped it; the storm ended the same night and the breaker stayed
-- contained for TEN DAYS, applying 250ms of backpressure to every ringside write
-- and raising 'Ringside scoring contained; retries paused' on every OCC conflict.
-- /admin/health reported it accurately the whole time and nobody acted.
--
-- A one-way breaker on a show-day write path is a worse failure mode than the
-- storm it guards against, on every day the storm is not happening. So the
-- sampler now releases as well as trips:
--
--   contained AND rate <= threshold  -> calm_samples += 1
--   calm_samples >= rearm_after_calm_samples -> rearm, audit, reset counter
--   contained AND rate  > threshold  -> calm_samples = 0 (storm still running)
--
-- The sampler is a minutely pg_cron job, so the default of 5 means "five
-- consecutive quiet minutes ends containment". A storm that is genuinely still
-- going re-trips on the very next sample after release, because the trip arm is
-- unchanged and the cursor is reset on release exactly as the manual rearm does.
--
-- calm_samples is reset on TRIP and on MANUAL rearm too, so a half-counted
-- recovery cannot carry over into the next incident.
--
-- The audit row uses event='rearm' (the CHECK allows only 'trip'/'rearm') with
-- actor = NULL, which is what distinguishes an automatic release from an
-- operator one — the manual RPC stamps auth.uid(). The reason string says so in
-- words as well, for anyone reading the table rather than querying it.

BEGIN;

ALTER TABLE public.ringside_containment
  ADD COLUMN IF NOT EXISTS calm_samples integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rearm_after_calm_samples integer NOT NULL DEFAULT 5;

ALTER TABLE public.ringside_containment
  DROP CONSTRAINT IF EXISTS ringside_containment_rearm_after_calm_samples_check;
ALTER TABLE public.ringside_containment
  ADD CONSTRAINT ringside_containment_rearm_after_calm_samples_check
  CHECK (rearm_after_calm_samples >= 1);

ALTER TABLE public.ringside_containment
  DROP CONSTRAINT IF EXISTS ringside_containment_calm_samples_check;
ALTER TABLE public.ringside_containment
  ADD CONSTRAINT ringside_containment_calm_samples_check
  CHECK (calm_samples >= 0);

COMMENT ON COLUMN public.ringside_containment.calm_samples IS
  'Consecutive sampler runs at or below the trip threshold while contained. '
  'Reset to 0 on trip, on manual rearm, and on any sample that is over the '
  'threshold. Only meaningful while state = ''contained''.';

COMMENT ON COLUMN public.ringside_containment.rearm_after_calm_samples IS
  'How many consecutive calm samples end containment. The sampler is minutely '
  'so this is a count of minutes (MYK9-400).';

-- Client isolation is unchanged and still mandatory: this project carries
-- ALTER DEFAULT PRIVILEGES granting anon/authenticated full CRUD on new public
-- tables. Adding a column does not re-run those, but re-assert anyway so a
-- migrations-only rebuild of this file cannot leave the breaker's off switch
-- reachable.
REVOKE ALL ON public.ringside_containment FROM PUBLIC;
REVOKE ALL ON public.ringside_containment FROM anon;
REVOKE ALL ON public.ringside_containment FROM authenticated;
GRANT SELECT ON public.ringside_containment TO service_role;

CREATE OR REPLACE FUNCTION public.ringside_containment_sample()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_seq bigint;
  v_state public.ringside_containment;
  v_delta bigint;
  v_minutes numeric;
  v_rate_per_minute numeric;
  v_calm integer;
BEGIN
  SELECT coalesce(last_value, 0) INTO v_seq
    FROM pg_sequences
   WHERE schemaname = 'public' AND sequencename = 'ringside_conflict_seq';

  SELECT * INTO STRICT v_state
    FROM public.ringside_containment
   FOR UPDATE;

  v_delta := greatest(v_seq - v_state.last_seq, 0);
  v_minutes := greatest(extract(epoch FROM (v_now - v_state.last_sample_at)) / 60.0, 0.25);
  v_rate_per_minute := v_delta / v_minutes;

  UPDATE public.ringside_containment
     SET last_seq = v_seq,
         last_sample_at = v_now;

  IF v_state.state = 'armed' THEN
    IF v_rate_per_minute > v_state.trip_conflicts_per_minute THEN
      UPDATE public.ringside_containment
         SET state = 'contained',
             tripped_at = v_now,
             trip_conflict_delta = v_delta,
             trip_reason = format('conflict rate %s/min exceeded threshold %s/min',
                                  round(v_rate_per_minute), v_state.trip_conflicts_per_minute),
             calm_samples = 0;
      INSERT INTO public.ringside_containment_audit (event, actor, conflict_delta, reason)
      VALUES ('trip', NULL, v_delta,
              format('conflict rate %s/min exceeded threshold %s/min',
                     round(v_rate_per_minute), v_state.trip_conflicts_per_minute));
    END IF;

    RETURN;
  END IF;

  -- state = 'contained' from here down.
  IF v_rate_per_minute > v_state.trip_conflicts_per_minute THEN
    -- Storm still running. Restart the recovery count; deliberately no audit
    -- row, matching the pre-existing rule that a breaker which re-audits every
    -- minute buries its own history.
    UPDATE public.ringside_containment SET calm_samples = 0;
    RETURN;
  END IF;

  v_calm := v_state.calm_samples + 1;

  IF v_calm < v_state.rearm_after_calm_samples THEN
    UPDATE public.ringside_containment SET calm_samples = v_calm;
    RETURN;
  END IF;

  -- Recovered. Reset the cursor to the sequence value read at the top of this
  -- sample for the same reason the manual rearm does: without it the next
  -- sample measures a delta accumulated during containment and insta-retrips.
  UPDATE public.ringside_containment
     SET state = 'armed',
         tripped_at = NULL,
         trip_conflict_delta = NULL,
         trip_reason = NULL,
         calm_samples = 0,
         last_seq = v_seq,
         last_sample_at = v_now;

  INSERT INTO public.ringside_containment_audit (event, actor, conflict_delta, reason)
  VALUES ('rearm', NULL, v_delta,
          format('automatic: %s consecutive samples at or below %s/min',
                 v_calm, v_state.trip_conflicts_per_minute));
END;
$function$;

-- Restate the EXECUTE decision rather than inheriting it. CREATE OR REPLACE
-- FUNCTION preserves the existing ACL, so this is a no-op against the live
-- database — but a migrations-only rebuild has to arrive at the same place, and
-- migrationGrantDecisionContract requires every migration that defines a public
-- function to say what anon and authenticated get. Same principle as carrying
-- security_invoker inline on a view: state it, do not inherit it.
--
-- Matches the applied ACL (verified: postgres=X, service_role=X). The sampler is
-- driven by pg_cron alone; no client role has any business calling it.
REVOKE ALL ON FUNCTION public.ringside_containment_sample() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ringside_containment_sample() FROM anon;
REVOKE ALL ON FUNCTION public.ringside_containment_sample() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ringside_containment_sample() TO service_role;

COMMENT ON FUNCTION public.ringside_containment_sample() IS
  'Minutely pg_cron sampler for the ringside OCC breaker. Trips above the '
  'threshold and releases after rearm_after_calm_samples consecutive samples at '
  'or below it (MYK9-400). An automatic release writes an audit row with '
  'actor = NULL; the manual RPC stamps auth.uid().';

-- The manual rearm must clear the recovery counter too, so an operator release
-- mid-recovery does not leave a stale partial count behind for the next trip.
CREATE OR REPLACE FUNCTION public.ringside_containment_rearm(p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_state public.ringside_containment;
  v_seq bigint;
BEGIN
  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'Not authorized to rearm ringside containment'
      USING errcode = '42501';
  END IF;

  SELECT * INTO STRICT v_state
    FROM public.ringside_containment
   FOR UPDATE;

  IF v_state.state = 'armed' THEN
    -- Idempotent no-op: no state change, no audit row.
    RETURN jsonb_build_object('state', 'armed', 'was_contained', false);
  END IF;

  SELECT coalesce(last_value, 0) INTO v_seq
    FROM pg_sequences
   WHERE schemaname = 'public' AND sequencename = 'ringside_conflict_seq';

  UPDATE public.ringside_containment
     SET state = 'armed',
         tripped_at = NULL,
         trip_conflict_delta = NULL,
         trip_reason = NULL,
         calm_samples = 0,
         -- Reset the sampler cursor so the stale window cannot insta-retrip.
         last_seq = v_seq,
         last_sample_at = now();

  INSERT INTO public.ringside_containment_audit (event, actor, conflict_delta, reason)
  VALUES ('rearm', (SELECT auth.uid()), v_state.trip_conflict_delta, p_reason);

  RETURN jsonb_build_object('state', 'armed', 'was_contained', true);
END;
$function$;

-- Same restatement for the operator path. Matches the applied ACL (verified:
-- postgres=X, service_role=X, authenticated=X). authenticated KEEPS execute on
-- purpose: the site-admin gate is the in-body is_site_admin() check, not the
-- grant, and the behavioural test pins that a signed-in non-admin is denied by
-- the gate rather than by a missing privilege.
REVOKE ALL ON FUNCTION public.ringside_containment_rearm(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ringside_containment_rearm(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ringside_containment_rearm(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ringside_containment_rearm(text) TO service_role;

COMMIT;
