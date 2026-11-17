-- =============================================================================
-- MYK9-2088: the full confirmation email moves onto the durable job row, so an
-- interrupted send is recovered and a provider-accepted one is reconciled.
--
-- Plan: docs/plan-automatic-email-jobs.md, Phase 2. The same queue MYK9-2124 extended
-- (show_lifecycle_email_jobs: auto_send, the claimed_until / attempt_id lease, the attempt
-- rows with resend_message_id); no new table.
--
-- Before: send-confirmation-email stamped entries.confirmation_email_sent_at BEFORE the
-- send, and the candidate read needs it null. A function stopped between the stamp and the
-- send left the entries stamped and never emailed, with nothing to expire or recover it.
--
-- After: the scheduled run writes one TICKET per exhibitor group per show (batch_key is the
-- run's own group key, enrollment_id her registration, recipient_person_id the handler of a
-- handler-only group) and sends it under a lease. A ticket freezes nothing: when it is sent,
-- the worker re-runs the run's gather for that one group (confirmed, unmarked, outside the
-- ten-minute quiet period, still in the group), so grouping and the quiet period cannot
-- drift from the run's. What is actually sent (the entry ids with their acceptance
-- generations, the address, the body, the provider key) is recorded on the ATTEMPT row
-- before the provider is called; an unresolved attempt is replayed from that record, and a
-- sent one is reconciled from it. The entries' confirmation_email_sent_at / status / message
-- id are written when the send SUCCEEDS, so the historical marker keeps its meaning for every
-- reader (admin diagnostics, the re-acceptance trigger of MYK9-2040, the candidate read).
-- Nothing already stamped is touched: genuine prior sends and first-run historical markers
-- stay as they are.
--
--   1. show_lifecycle_email_attempts.payload jsonb, and the attempt status CHECK gains
--      'started' (the send began, the provider has not answered). Server-written only.
--   2. The JOBS step_type CHECK gains 'entry_confirmation'. The STEPS CHECK does not: the
--      secretary's switch for this email is the existing 'accepted' step (the run already
--      honours it, and Scheduled emails shows it), so a second switch would be two controls
--      for one email. A confirmation job's step_id points at the show's 'accepted' step.
--      The Scheduled emails panel ignores a job whose step type it does not list, so these
--      automatic jobs never show up as something to review.
--   3. A partial UNIQUE index: one READY confirmation ticket per exhibitor group per show.
--      Two overlapping runs cannot both queue the same exhibitor's email.
--   4. claim_due_auto_email_jobs gains p_step_types, so the show-changed drain and the
--      confirmation drain each claim only their own kind with the one lease mechanism. The
--      parameter has NO default: a caller must name what it can render. The result also
--      returns batch_key, entry_id and enrollment_id. A two-argument wrapper (show_changed
--      only) stays for the rollout window; a follow-up drops it.
--   4b. mark_entry_confirmation: the one fenced UPDATE every marker write goes through (see
--      its comment).
--   5. get_show_email_delivery_history (copied from 20261117044900, its latest definition) no
--      longer lists each refused attempt of an entry_confirmation job as a failure: refusals
--      are retries of one email. A job that ended failed shows once (its latest refused
--      attempt); a refused-then-sent job shows only the sent email. Other step types are
--      unchanged.
--
-- Rollback: delete entry_confirmation jobs; DROP FUNCTION mark_entry_confirmation; restore the
-- two-argument claim_due_auto_email_jobs from 20261117094700 (and redeploy the previous
-- send-lifecycle-email and send-confirmation-email); DROP INDEX
-- show_lifecycle_email_jobs_one_ready_entry_confirmation; restore the jobs step_type CHECK
-- without 'entry_confirmation' and the attempts status CHECK without 'started'; ALTER TABLE
-- public.show_lifecycle_email_attempts DROP COLUMN payload.
-- =============================================================================

BEGIN;

ALTER TABLE public.show_lifecycle_email_attempts
  ADD COLUMN IF NOT EXISTS payload jsonb;

COMMENT ON COLUMN public.show_lifecycle_email_attempts.payload IS
  'MYK9-2088: what an entry_confirmation attempt sent or is about to send (address, subject, body, entry ids with acceptance generations, provider key). Recorded before the provider is called; a started attempt is replayed from it, a sent one reconciled from it. Written by the server only.';

DO $$
DECLARE
  v_constraint text;
  v_dropped integer := 0;
BEGIN
  FOR v_constraint IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.show_lifecycle_email_attempts'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%status%'
       AND pg_get_constraintdef(c.oid) LIKE '%delayed%'
  LOOP
    EXECUTE format('ALTER TABLE public.show_lifecycle_email_attempts DROP CONSTRAINT %I', v_constraint);
    v_dropped := v_dropped + 1;
  END LOOP;
  IF v_dropped <> 1 THEN
    RAISE EXCEPTION 'MYK9-2088: expected to drop exactly one status CHECK on show_lifecycle_email_attempts, dropped %',
      v_dropped;
  END IF;
END
$$;

ALTER TABLE public.show_lifecycle_email_attempts
  ADD CONSTRAINT show_lifecycle_email_attempts_status_check CHECK (
    status IN ('started', 'sent', 'failed', 'delivered', 'bounced', 'complained', 'delayed')
  );

DO $$
DECLARE
  v_constraint text;
  v_dropped integer := 0;
BEGIN
  FOR v_constraint IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.show_lifecycle_email_jobs'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%step_type%'
       AND pg_get_constraintdef(c.oid) LIKE '%show_changed%'
  LOOP
    EXECUTE format('ALTER TABLE public.show_lifecycle_email_jobs DROP CONSTRAINT %I', v_constraint);
    v_dropped := v_dropped + 1;
  END LOOP;
  IF v_dropped <> 1 THEN
    RAISE EXCEPTION 'MYK9-2088: expected to drop exactly one step_type CHECK on show_lifecycle_email_jobs, dropped %',
      v_dropped;
  END IF;
END
$$;

ALTER TABLE public.show_lifecycle_email_jobs
  ADD CONSTRAINT show_lifecycle_email_jobs_step_type_check CHECK (
    step_type IN (
      'accepted',
      'waitlisted',
      'two_week_reminder',
      'day_before_reminder',
      'results_available',
      'registration_number_needed',
      'show_changed',
      'entry_confirmation'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS show_lifecycle_email_jobs_one_ready_entry_confirmation
  ON public.show_lifecycle_email_jobs (show_id, batch_key)
  WHERE step_type = 'entry_confirmation' AND status = 'ready' AND batch_key IS NOT NULL;

-- Replaced in place below: the two-argument claim becomes a wrapper (rollout window).
DROP FUNCTION IF EXISTS public.claim_due_auto_email_jobs(integer, timestamptz);

CREATE FUNCTION public.claim_due_auto_email_jobs(
  p_limit integer,
  p_lease_until timestamptz,
  p_step_types text[]
)
RETURNS TABLE (
  job_id uuid,
  attempt_id uuid,
  show_id uuid,
  step_type text,
  recipient_person_id uuid,
  recipient_email text,
  recipient_name text,
  idempotency_key text,
  due_at timestamptz,
  batch_key text,
  entry_id uuid,
  enrollment_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH due AS (
    SELECT j.id
      FROM public.show_lifecycle_email_jobs j
     WHERE j.status = 'ready'
       AND j.auto_send
       AND j.step_type = ANY (coalesce(p_step_types, '{}'::text[]))
       AND j.due_at <= now()
       AND (j.claimed_until IS NULL OR j.claimed_until <= now())
     ORDER BY j.due_at
     LIMIT greatest(coalesce(p_limit, 0), 0)
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.show_lifecycle_email_jobs j
     SET attempt_id = gen_random_uuid(),
         claimed_until = p_lease_until
    FROM due
   WHERE j.id = due.id
     AND p_lease_until > now()
  RETURNING j.id, j.attempt_id, j.show_id, j.step_type, j.recipient_person_id,
            j.recipient_email, j.recipient_name, j.idempotency_key, j.due_at,
            j.batch_key, j.entry_id, j.enrollment_id;
$$;

REVOKE ALL ON FUNCTION public.claim_due_auto_email_jobs(integer, timestamptz, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_auto_email_jobs(integer, timestamptz, text[])
  TO service_role;

-- ROLLOUT WINDOW ONLY. The deployed send-lifecycle-email still calls the two-argument claim
-- until it is redeployed; between `db push` and that deploy this wrapper keeps its drain working
-- exactly as before (show_changed jobs only, never a confirmation it cannot render). Remove it in
-- a follow-up migration once send-lifecycle-email passes p_step_types everywhere.
CREATE FUNCTION public.claim_due_auto_email_jobs(
  p_limit integer,
  p_lease_until timestamptz
)
RETURNS TABLE (
  job_id uuid,
  attempt_id uuid,
  show_id uuid,
  step_type text,
  recipient_person_id uuid,
  recipient_email text,
  recipient_name text,
  idempotency_key text,
  due_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.job_id, c.attempt_id, c.show_id, c.step_type, c.recipient_person_id,
         c.recipient_email, c.recipient_name, c.idempotency_key, c.due_at
    FROM public.claim_due_auto_email_jobs(p_limit, p_lease_until, ARRAY['show_changed']) AS c;
$$;

REVOKE ALL ON FUNCTION public.claim_due_auto_email_jobs(integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_auto_email_jobs(integer, timestamptz)
  TO service_role;

-- Stamps (or fails) the covered entries in ONE update, fenced by acceptance generation. An entry
-- is touched only while it is still unmarked, still confirmed, and its CURRENT generation (latest
-- entry_status_history row into 'confirmed', else 'none') equals the one the job covered, so an
-- entry accepted again after the send is never stamped by the earlier acceptance's job. A failure
-- never clears a sent marker (it only touches unmarked entries).
CREATE FUNCTION public.mark_entry_confirmation(
  p_generations jsonb,
  p_outcome text,
  p_message_id text,
  p_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_outcome NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'mark_entry_confirmation: outcome must be sent or failed' USING ERRCODE = '22023';
  END IF;

  WITH covered AS (
    SELECT key::uuid AS entry_id, value AS generation
      FROM jsonb_each_text(coalesce(p_generations, '{}'::jsonb))
  )
  UPDATE public.entries e
     SET confirmation_email_sent_at = CASE WHEN p_outcome = 'sent' THEN p_at ELSE e.confirmation_email_sent_at END,
         confirmation_email_status = CASE WHEN p_outcome = 'sent' THEN 'sent' ELSE 'failed' END,
         confirmation_email_message_id = CASE
           WHEN p_outcome = 'sent' AND p_message_id IS NOT NULL THEN p_message_id
           ELSE e.confirmation_email_message_id
         END
    FROM covered c
   WHERE e.id = c.entry_id
     AND e.confirmation_email_sent_at IS NULL
     AND e.entry_status = 'confirmed'
     AND coalesce(
           (SELECT h.id::text
              FROM public.entry_status_history h
             WHERE h.entry_id = e.id AND h.new_status = 'confirmed'
             ORDER BY h.changed_at DESC, h.id DESC
             LIMIT 1),
           'none'
         ) = c.generation;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_entry_confirmation(jsonb, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_entry_confirmation(jsonb, text, text, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_show_email_delivery_history(
  p_show_id uuid,
  p_limit integer DEFAULT 50,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  show_id uuid,
  source_kind text,
  lifecycle_step_type text,
  related_id uuid,
  recipient_name text,
  recipient_email text,
  attempted_at timestamptz,
  status_updated_at timestamptz,
  delivery_status text,
  failure_summary text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := COALESCE(p_limit, 50);
BEGIN
  IF p_show_id IS NULL THEN
    RAISE EXCEPTION 'show_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NOT NULL AND (p_limit < 1 OR p_limit > 100) THEN
    RAISE EXCEPTION 'limit must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'cursor requires both created_at and id' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_manage_show_lifecycle_email(p_show_id) THEN
    RAISE EXCEPTION 'not authorized to read show email history' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH email_rows AS (
    SELECT
      log.id,
      log.show_id,
      CASE log.email_type
        WHEN 'registration_confirmation' THEN 'registration_confirmation'
        WHEN 'heritage_confirmation' THEN 'heritage_confirmation'
        WHEN 'show_reminder' THEN 'show_reminder'
        WHEN 'show_lifecycle_email' THEN 'lifecycle'
        WHEN 'entry_decision' THEN 'entry_decision'
        WHEN 'waitlist_notification' THEN 'waitlist_notification'
        WHEN 'registry_results_submission' THEN 'registry_results_submission'
        WHEN 'show_message' THEN 'show_message'
        ELSE NULL
      END AS source_kind,
      lifecycle.step_type AS lifecycle_step_type,
      log.related_id,
      COALESCE(
        lifecycle.recipient_name,
        enrollment_person.first_name || CASE WHEN enrollment_person.last_name IS NULL THEN '' ELSE ' ' || enrollment_person.last_name END,
        heritage_person.first_name || CASE WHEN heritage_person.last_name IS NULL THEN '' ELSE ' ' || heritage_person.last_name END,
        waitlist_person.first_name || CASE WHEN waitlist_person.last_name IS NULL THEN '' ELSE ' ' || waitlist_person.last_name END
      ) AS recipient_name,
      log.recipient_email,
      log.created_at AS created_at,
      log.created_at AS attempted_at,
      log.status_updated_at,
      CASE lower(log.status)
        WHEN 'delivered' THEN 'delivered'
        WHEN 'sent' THEN 'sent'
        WHEN 'bounced' THEN 'bounced'
        WHEN 'failed' THEN 'failed'
        WHEN 'complained' THEN 'complained'
        WHEN 'suppressed' THEN 'failed'
        ELSE 'unavailable'
      END AS delivery_status,
      CASE lower(log.status)
        WHEN 'bounced' THEN 'The recipient mail server rejected this email.'
        WHEN 'failed' THEN 'The email could not be sent.'
        WHEN 'complained' THEN 'The recipient marked this email as spam.'
        WHEN 'suppressed' THEN 'The provider suppressed this email.'
        ELSE NULL
      END AS failure_summary
    FROM public.email_log AS log
    LEFT JOIN public.show_lifecycle_email_jobs AS lifecycle
      ON lifecycle.id = log.related_id
      AND log.email_type = 'show_lifecycle_email'
    LEFT JOIN public.enrollments AS enrollment
      ON enrollment.id = log.related_id
      AND log.email_type IN ('registration_confirmation', 'entry_decision')
    LEFT JOIN public.people AS enrollment_person ON enrollment_person.id = enrollment.handler_id
    LEFT JOIN public.entries AS heritage_entry
      ON heritage_entry.id = log.related_id
      AND log.email_type IN ('heritage_confirmation', 'show_reminder')
    LEFT JOIN public.people AS heritage_person ON heritage_person.id = heritage_entry.handler_id
    LEFT JOIN public.waitlist_notification_events AS waitlist_event
      ON waitlist_event.id = log.related_id
      AND log.email_type = 'waitlist_notification'
    LEFT JOIN public.waitlist_entries AS waitlist
      ON waitlist.id = waitlist_event.waitlist_entry_id
    LEFT JOIN public.exhibitor_profiles AS waitlist_exhibitor
      ON waitlist_exhibitor.id = waitlist.exhibitor_id
    LEFT JOIN public.people AS waitlist_person ON waitlist_person.id = waitlist_exhibitor.person_id
    WHERE log.show_id = p_show_id
      AND log.email_type IN (
        'registration_confirmation',
        'heritage_confirmation',
        'show_reminder',
        'show_lifecycle_email',
        'entry_decision',
        'waitlist_notification',
        'registry_results_submission',
        'show_message'
      )
      AND CASE log.email_type
        WHEN 'registration_confirmation' THEN log.related_id IS NULL OR enrollment.show_id = p_show_id
        WHEN 'entry_decision' THEN enrollment.show_id = p_show_id
        WHEN 'heritage_confirmation' THEN EXISTS (
          SELECT 1
          FROM public.trials AS heritage_trial
          WHERE heritage_trial.id = heritage_entry.trial_id
            AND heritage_trial.show_id = p_show_id
        )
        WHEN 'show_reminder' THEN EXISTS (
          SELECT 1
          FROM public.trials AS heritage_trial
          WHERE heritage_trial.id = heritage_entry.trial_id
            AND heritage_trial.show_id = p_show_id
        )
        WHEN 'show_lifecycle_email' THEN lifecycle.show_id = p_show_id
        WHEN 'waitlist_notification' THEN EXISTS (
          SELECT 1
          FROM public.classes AS waitlist_class
          JOIN public.trials AS waitlist_trial ON waitlist_trial.id = waitlist_class.trial_id
          WHERE waitlist_class.id = waitlist.class_id
            AND waitlist_trial.show_id = p_show_id
        )
        WHEN 'registry_results_submission' THEN true
        WHEN 'show_message' THEN true
        ELSE false
      END
  ), lifecycle_failures AS (
    SELECT
      attempt.id,
      job.show_id,
      'lifecycle'::text AS source_kind,
      job.step_type AS lifecycle_step_type,
      job.id AS related_id,
      job.recipient_name,
      job.recipient_email,
      attempt.attempted_at AS created_at,
      attempt.attempted_at AS attempted_at,
      NULL::timestamptz AS status_updated_at,
      CASE lower(attempt.status)
        WHEN 'sent' THEN 'sent'
        WHEN 'delivered' THEN 'delivered'
        WHEN 'bounced' THEN 'bounced'
        WHEN 'failed' THEN 'failed'
        WHEN 'complained' THEN 'complained'
        WHEN 'suppressed' THEN 'failed'
        ELSE 'unavailable'
      END AS delivery_status,
      CASE lower(attempt.status)
        WHEN 'bounced' THEN 'The recipient mail server rejected this email.'
        WHEN 'failed' THEN 'The email could not be sent.'
        WHEN 'complained' THEN 'The recipient marked this email as spam.'
        WHEN 'suppressed' THEN 'The provider suppressed this email.'
        ELSE NULL
      END AS failure_summary
    FROM public.show_lifecycle_email_attempts AS attempt
    JOIN public.show_lifecycle_email_jobs AS job ON job.id = attempt.job_id
    WHERE job.show_id = p_show_id
      AND attempt.email_log_id IS NULL
      AND lower(attempt.status) = 'failed'
      -- MYK9-2088: a confirmation's refused attempts are retries of one email, not failures.
      -- A confirmation job is listed once, only when the JOB ended failed, through its latest
      -- refused attempt; a job still waiting, or retried and then sent or skipped, lists none.
      AND (
        job.step_type <> 'entry_confirmation'
        OR (
          job.status = 'failed'
          AND NOT EXISTS (
            SELECT 1
            FROM public.show_lifecycle_email_attempts AS later
            WHERE later.job_id = attempt.job_id
              AND lower(later.status) = 'failed'
              AND (later.attempted_at, later.id) > (attempt.attempted_at, attempt.id)
          )
        )
      )
  ), history AS (
    SELECT * FROM email_rows WHERE email_rows.source_kind IS NOT NULL
    UNION ALL
    SELECT * FROM lifecycle_failures
  )
  SELECT
    history.id,
    history.show_id,
    history.source_kind,
    history.lifecycle_step_type,
    history.related_id,
    history.recipient_name,
    history.recipient_email,
    history.attempted_at,
    history.status_updated_at,
    history.delivery_status,
    history.failure_summary
  FROM history
  WHERE p_before_created_at IS NULL
     OR (history.created_at, history.id) < (p_before_created_at, p_before_id)
  ORDER BY history.created_at DESC, history.id DESC
  LIMIT v_limit + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_show_email_delivery_history(uuid, integer, timestamptz, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_email_delivery_history(uuid, integer, timestamptz, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_show_email_delivery_history(uuid, integer, timestamptz, uuid) IS
  'Authorized, bounded, cursor-paginated read model for show-owned email delivery attempts.';

COMMIT;
