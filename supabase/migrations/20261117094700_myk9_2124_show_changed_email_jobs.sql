-- =============================================================================
-- MYK9-2124: exhibitors are emailed, by the server, when a published show's date or
-- venue changes.
--
-- Plan: docs/plan-automatic-email-jobs.md, Phase 1. One shared automatic-send
-- mechanism on the existing job row (show_lifecycle_email_jobs), not a new table.
--
--   1. show_lifecycle_email_jobs.auto_send boolean NOT NULL DEFAULT false. false keeps
--      every existing step as it is (a secretary reviews and sends). true marks a job
--      the server sends by itself once due_at passes. Server-written only: the
--      column-level UPDATE ACL from 20261018031700 lists the five columns the browser
--      edits, so authenticated can neither set nor clear it (the MYK9-1254 test walks
--      every column).
--   2. Both step_type CHECKs (steps and jobs) gain 'show_changed'. The jobs table's
--      step_id is NOT NULL and references show_lifecycle_email_steps, so the step gets a
--      row per show like the other six (ensure_show_lifecycle_email_steps seeds it, and
--      existing shows are backfilled). That is the least invasive consistent choice: no
--      nullable FK, and the secretary's per-show switch (is_enabled) comes for free.
--   3. A partial UNIQUE index on (show_id, recipient_person_id) for the one unsent
--      show_changed job. Several edits in one sitting upsert that one row and push its
--      due_at; a change after the email went out finds no ready row and makes a new job.
--   4. Producers. AFTER UPDATE triggers on trials (date) and on shows (venue_name,
--      address, city, state, zip_code). For a published show (status published, upcoming
--      or in_progress, the live set the confirmation email uses) with the step switched
--      on, every person with a live entry gets one ready, auto_send job with
--      due_at = now() + 5 minutes. Recipients are the dog's owner and the entry's handler
--      with an email, deduplicated: the rule queue_results_available_for_show (MYK9-2076)
--      uses, because My Shows lists the entry for both. The email text is NOT stored on
--      the job: the sender renders it at send time from the current dates and address, so
--      it always carries the latest values. Triggers never block the edit. The schedule is
--      the trials' dates, so the show's own start_date / end_date are not watched.
--   5. claim_due_auto_email_jobs(p_limit, p_lease_until): the drain's claim. Ready,
--      auto_send, due, lease free or expired; FOR UPDATE SKIP LOCKED; mints a fresh
--      attempt_id and sets claimed_until (the MYK9-1212 lease). service_role only.
--   6. A pg_cron job every 5 minutes calls send-lifecycle-email with {"action":
--      "drain_auto"}. No new Vault secret: it reuses the three heritage_confirmation_*
--      secrets (the sender URL is the confirmation function's URL with the function name
--      swapped), the same pattern as exhibitor-reminder-emails.
--
-- Rollback: SELECT cron.unschedule('show-changed-email-drain'); DROP TRIGGER
-- trg_queue_show_changed_email_trial ON public.trials; DROP TRIGGER
-- trg_queue_show_changed_email_show ON public.shows; DROP FUNCTION
-- public.queue_show_changed_email_from_trial(), public.queue_show_changed_email_from_show(),
-- public.queue_show_changed_email_for_show(uuid), public.show_live_entry_person_ids(uuid),
-- public.show_person_has_live_entry(uuid, uuid),
-- public.claim_due_auto_email_jobs(integer, timestamptz); DROP INDEX
-- show_lifecycle_email_jobs_one_ready_show_changed; delete show_changed jobs and steps,
-- restore the six-value CHECKs and ensure_show_lifecycle_email_steps from 20261015163700,
-- ALTER TABLE public.show_lifecycle_email_jobs DROP COLUMN auto_send.
-- =============================================================================

BEGIN;

ALTER TABLE public.show_lifecycle_email_jobs
  ADD COLUMN IF NOT EXISTS auto_send boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.show_lifecycle_email_jobs.auto_send IS
  'MYK9-2124: true when the server sends this job by itself once due_at passes (claim_due_auto_email_jobs, drained every 5 minutes). false: a secretary reviews and sends it. Written by the server only.';

DO $$
DECLARE
  v_table text;
  v_constraint text;
  v_dropped integer;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['show_lifecycle_email_steps', 'show_lifecycle_email_jobs'] LOOP
    v_dropped := 0;
    FOR v_constraint IN
      SELECT c.conname
        FROM pg_constraint c
       WHERE c.conrelid = ('public.' || v_table)::regclass
         AND c.contype = 'c'
         AND pg_get_constraintdef(c.oid) LIKE '%step_type%'
         AND pg_get_constraintdef(c.oid) LIKE '%registration_number_needed%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_table, v_constraint);
      v_dropped := v_dropped + 1;
    END LOOP;
    IF v_dropped <> 1 THEN
      RAISE EXCEPTION 'MYK9-2124: expected to drop exactly one step_type CHECK on %, dropped %',
        v_table, v_dropped;
    END IF;
  END LOOP;
END
$$;

ALTER TABLE public.show_lifecycle_email_steps
  ADD CONSTRAINT show_lifecycle_email_steps_step_type_check CHECK (
    step_type IN (
      'accepted',
      'waitlisted',
      'two_week_reminder',
      'day_before_reminder',
      'results_available',
      'registration_number_needed',
      'show_changed'
    )
  );

ALTER TABLE public.show_lifecycle_email_jobs
  ADD CONSTRAINT show_lifecycle_email_jobs_step_type_check CHECK (
    step_type IN (
      'accepted',
      'waitlisted',
      'two_week_reminder',
      'day_before_reminder',
      'results_available',
      'registration_number_needed',
      'show_changed'
    )
  );

-- Copied from its LATEST definition (20261015163700), plus the seventh step.
CREATE OR REPLACE FUNCTION public.ensure_show_lifecycle_email_steps(p_show_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.show_lifecycle_email_steps (show_id, step_type, is_enabled)
  VALUES
    (p_show_id, 'accepted', true),
    (p_show_id, 'waitlisted', true),
    (p_show_id, 'two_week_reminder', true),
    (p_show_id, 'day_before_reminder', true),
    (p_show_id, 'results_available', true),
    (p_show_id, 'registration_number_needed', true),
    (p_show_id, 'show_changed', true)
  ON CONFLICT (show_id, step_type) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.ensure_show_lifecycle_email_steps(uuid) FROM PUBLIC, anon, authenticated;

SELECT public.ensure_show_lifecycle_email_steps(s.id) FROM public.shows s;

CREATE UNIQUE INDEX IF NOT EXISTS show_lifecycle_email_jobs_one_ready_show_changed
  ON public.show_lifecycle_email_jobs (show_id, recipient_person_id)
  WHERE step_type = 'show_changed' AND status = 'ready' AND recipient_person_id IS NOT NULL;

-- Who an email about the show reaches: the dog's owner and the entry's handler of every
-- live entry (accepted-ish, not pulled, in a live class of a live trial). The rule
-- queue_results_available_for_show (MYK9-2076) uses, because My Shows lists the entry for
-- both. One definition for the producer and for the sender's "still a recipient?" check.
CREATE OR REPLACE FUNCTION public.show_live_entry_person_ids(p_show_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT r.person_id
    FROM public.entries e
    JOIN public.dogs d ON d.id = e.dog_id
    JOIN public.classes c ON c.id = e.class_id
    JOIN public.trials t ON t.id = c.trial_id
    CROSS JOIN LATERAL (VALUES (d.owner_id), (e.handler_id)) AS r(person_id)
   WHERE e.show_id = p_show_id
     AND t.show_id = p_show_id
     AND t.deleted_at IS NULL
     AND c.deleted_at IS NULL
     AND lower(btrim(coalesce(c.status, ''))) NOT IN ('cancelled', 'canceled')
     AND e.deleted_at IS NULL
     AND e.entry_status IN (
       'confirmed', 'accepted', 'scheduled', 'checked-in', 'at-gate',
       'in-ring', 'competing', 'completed', 'move-up-requested', 'move_up_requested',
       -- Submitted or paid but not yet accepted: the exhibitor is planning to come too.
       'submitted', 'paid', 'pending', 'promotion-expired', 'waitlisted'
     )
     AND e.check_in_status IS DISTINCT FROM 'pulled'
     AND r.person_id IS NOT NULL
     AND d.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.show_live_entry_person_ids(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- The sender asks this at send time: a person whose entries were all withdrawn in the
-- five quiet minutes is skipped.
CREATE OR REPLACE FUNCTION public.show_person_has_live_entry(p_show_id uuid, p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.show_live_entry_person_ids(p_show_id) AS ids(person_id)
     WHERE ids.person_id = p_person_id
  );
$$;

REVOKE ALL ON FUNCTION public.show_person_has_live_entry(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.show_person_has_live_entry(uuid, uuid) TO service_role;

-- The producer. Safe to call for any show: it does nothing for an unpublished show.
CREATE OR REPLACE FUNCTION public.queue_show_changed_email_for_show(p_show_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_name text;
  v_status text;
  v_step_id uuid;
BEGIN
  SELECT sh.name, sh.status INTO v_show_name, v_status
    FROM public.shows sh
   WHERE sh.id = p_show_id
     AND sh.deleted_at IS NULL;

  -- Only a published show: a draft is still being set up, and a finished or cancelled
  -- show has nothing left to tell exhibitors.
  IF v_status IS NULL OR v_status NOT IN ('published', 'upcoming', 'in_progress') THEN
    RETURN;
  END IF;

  -- The per-show switch.
  SELECT s.id INTO v_step_id
    FROM public.show_lifecycle_email_steps s
   WHERE s.show_id = p_show_id
     AND s.step_type = 'show_changed'
     AND s.is_enabled;
  IF v_step_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.show_lifecycle_email_jobs (
    show_id, step_id, step_type, status, recipient_scope, recipient_person_id,
    recipient_email, recipient_name, subject, idempotency_key, due_at, auto_send
  )
  SELECT
    p_show_id,
    v_step_id,
    'show_changed',
    'ready',
    'show_recipient',
    p.id,
    btrim(p.email),
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    'Update to ' || coalesce(v_show_name, 'your show'),
    -- A job is one email; a change after it went out is a new job, so a new key.
    'show-lifecycle-email:' || p_show_id::text || ':show_changed:person:' || p.id::text
      || ':' || gen_random_uuid()::text,
    now() + interval '5 minutes',
    true
  FROM public.people p
  WHERE nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL
    AND p.deleted_at IS NULL
    AND p.id IN (SELECT ids.person_id FROM public.show_live_entry_person_ids(p_show_id) AS ids(person_id))
  -- Another edit in the same sitting: the one waiting job stays and waits again.
  ON CONFLICT (show_id, recipient_person_id)
    WHERE step_type = 'show_changed' AND status = 'ready' AND recipient_person_id IS NOT NULL
  DO UPDATE SET
    due_at = now() + interval '5 minutes',
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_show_changed_email_for_show(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.queue_show_changed_email_from_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.queue_show_changed_email_for_show(new.show_id);
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Queuing an email must never block the edit.
  RAISE WARNING 'queue_show_changed_email_from_trial: % (%)', SQLERRM, SQLSTATE;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_show_changed_email_from_trial()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.queue_show_changed_email_from_show()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.queue_show_changed_email_for_show(new.id);
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'queue_show_changed_email_from_show: % (%)', SQLERRM, SQLSTATE;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_show_changed_email_from_show()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_queue_show_changed_email_trial ON public.trials;
CREATE TRIGGER trg_queue_show_changed_email_trial
  AFTER UPDATE OF date ON public.trials
  FOR EACH ROW
  WHEN (old.date IS DISTINCT FROM new.date AND new.deleted_at IS NULL)
  EXECUTE FUNCTION public.queue_show_changed_email_from_trial();

DROP TRIGGER IF EXISTS trg_queue_show_changed_email_show ON public.shows;
CREATE TRIGGER trg_queue_show_changed_email_show
  AFTER UPDATE OF venue_name, address, city, state, zip_code ON public.shows
  FOR EACH ROW
  WHEN (
    old.venue_name IS DISTINCT FROM new.venue_name
    OR old.address IS DISTINCT FROM new.address
    OR old.city IS DISTINCT FROM new.city
    OR old.state IS DISTINCT FROM new.state
    OR old.zip_code IS DISTINCT FROM new.zip_code
  )
  EXECUTE FUNCTION public.queue_show_changed_email_from_show();

-- The drain's claim. Up to p_limit due, automatic jobs whose lease is free or expired;
-- each gets a fresh attempt_id (the only attempt that may record its outcome) and the
-- lease p_lease_until. An abandoned attempt (lease expired) is simply claimed again.
CREATE OR REPLACE FUNCTION public.claim_due_auto_email_jobs(
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
  WITH due AS (
    SELECT j.id
      FROM public.show_lifecycle_email_jobs j
     WHERE j.status = 'ready'
       AND j.auto_send
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
            j.recipient_email, j.recipient_name, j.idempotency_key, j.due_at;
$$;

REVOKE ALL ON FUNCTION public.claim_due_auto_email_jobs(integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_auto_email_jobs(integer, timestamptz)
  TO service_role;

SELECT cron.unschedule('show-changed-email-drain')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'show-changed-email-drain'
);

SELECT
  cron.schedule(
    'show-changed-email-drain',
    '1-56/5 * * * *',
    $$
    do $show_changed_drain_cron$
    declare
      confirmation_email_url text;
      lifecycle_email_url text;
      service_role_key text;
      function_secret text;
    begin
      select decrypted_secret
      into confirmation_email_url
      from vault.decrypted_secrets
      where name = 'heritage_confirmation_email_url';

      select decrypted_secret
      into service_role_key
      from vault.decrypted_secrets
      where name = 'heritage_confirmation_service_role_key';

      select decrypted_secret
      into function_secret
      from vault.decrypted_secrets
      where name = 'heritage_confirmation_secret';

      if nullif(confirmation_email_url, '') is null then
        raise exception 'Missing Vault secret: heritage_confirmation_email_url';
      end if;

      if nullif(service_role_key, '') is null then
        raise exception 'Missing Vault secret: heritage_confirmation_service_role_key';
      end if;

      if nullif(function_secret, '') is null then
        raise exception 'Missing Vault secret: heritage_confirmation_secret';
      end if;

      -- Same project, same functions host: only the function name differs.
      lifecycle_email_url := replace(
        confirmation_email_url, 'send-confirmation-email', 'send-lifecycle-email'
      );
      if lifecycle_email_url = confirmation_email_url then
        raise exception 'heritage_confirmation_email_url does not name send-confirmation-email';
      end if;

      perform net.http_post(
        url := lifecycle_email_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key,
          'x-function-secret', function_secret
        ),
        body := '{"action":"drain_auto"}'::jsonb
      );
    end
    $show_changed_drain_cron$;
    $$
  );

COMMIT;
