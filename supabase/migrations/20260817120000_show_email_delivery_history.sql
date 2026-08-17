BEGIN;

ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS show_id uuid REFERENCES public.shows(id) ON DELETE SET NULL;

ALTER TABLE public.email_log
  ALTER COLUMN recipient_email DROP NOT NULL;

CREATE INDEX IF NOT EXISTS email_log_show_created_id_idx
  ON public.email_log (show_id, created_at DESC, id DESC)
  WHERE show_id IS NOT NULL;

COMMENT ON COLUMN public.email_log.show_id IS
  'Canonical server-derived show scope for show-owned email history. NULL means platform-scoped or not safely recoverable.';

-- These relationships are deterministic and safe to backfill. Rows that do not
-- resolve through a source-owned record remain unscoped and invisible to the
-- secretary history rather than being guessed into a show.
UPDATE public.email_log AS log
SET show_id = enrollment.show_id
FROM public.enrollments AS enrollment
WHERE log.show_id IS NULL
  AND log.email_type IN ('registration_confirmation', 'entry_decision')
  AND enrollment.id = log.related_id;

UPDATE public.email_log AS log
SET show_id = job.show_id
FROM public.show_lifecycle_email_jobs AS job
WHERE log.show_id IS NULL
  AND log.email_type = 'show_lifecycle_email'
  AND job.id = log.related_id;

UPDATE public.email_log AS log
SET show_id = show_scope.show_id
FROM (
  SELECT event.id AS event_id, trial.show_id
  FROM public.waitlist_notification_events AS event
  JOIN public.waitlist_entries AS waitlist ON waitlist.id = event.waitlist_entry_id
  JOIN public.classes AS class ON class.id = waitlist.class_id
  JOIN public.trials AS trial ON trial.id = class.trial_id
) AS show_scope
WHERE log.show_id IS NULL
  AND log.email_type = 'waitlist_notification'
  AND show_scope.event_id = log.related_id;

-- Heritage confirmations predate email_log. A durable provider id and a
-- server-owned entry/handler/show relationship are required before creating a
-- history record. The unique provider-id guard makes the backfill idempotent.
INSERT INTO public.email_log (
  recipient_email,
  email_type,
  related_id,
  resend_message_id,
  status,
  status_updated_at,
  show_id,
  created_at
)
SELECT
  person.email,
  'heritage_confirmation',
  entry.id,
  entry.confirmation_email_message_id,
  entry.confirmation_email_status,
  entry.confirmation_email_sent_at,
  heritage_trial.show_id,
  COALESCE(entry.confirmation_email_sent_at, entry.created_at, now())
FROM public.entries AS entry
JOIN public.people AS person ON person.id = entry.handler_id
JOIN public.trials AS heritage_trial ON heritage_trial.id = entry.trial_id
WHERE entry.confirmation_email_message_id IS NOT NULL
  AND person.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.email_log AS existing
    WHERE existing.resend_message_id = entry.confirmation_email_message_id
      AND existing.email_type = 'heritage_confirmation'
  );

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
        WHEN 'show_lifecycle_email' THEN 'lifecycle'
        WHEN 'entry_decision' THEN 'entry_decision'
        WHEN 'waitlist_notification' THEN 'waitlist_notification'
        WHEN 'registry_results_submission' THEN 'registry_results_submission'
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
      AND log.email_type = 'heritage_confirmation'
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
        'show_lifecycle_email',
        'entry_decision',
        'waitlist_notification',
        'registry_results_submission'
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
        WHEN 'show_lifecycle_email' THEN lifecycle.show_id = p_show_id
        WHEN 'waitlist_notification' THEN EXISTS (
          SELECT 1
          FROM public.classes AS waitlist_class
          JOIN public.trials AS waitlist_trial ON waitlist_trial.id = waitlist_class.trial_id
          WHERE waitlist_class.id = waitlist.class_id
            AND waitlist_trial.show_id = p_show_id
        )
        WHEN 'registry_results_submission' THEN true
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
  ), history AS (
    SELECT * FROM email_rows WHERE source_kind IS NOT NULL
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
