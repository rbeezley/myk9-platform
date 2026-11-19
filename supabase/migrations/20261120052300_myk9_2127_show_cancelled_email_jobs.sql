-- =============================================================================
-- MYK9-2127: a cancelled show emails every exhibitor with a live entry, once. Part 4 of the
-- automatic emails (MYK9-2000); parts 1 to 3 are MYK9-2124 show_changed, MYK9-2125
-- judge_changed and MYK9-2126 entry_changed, whose queue, drain and Delivery history this
-- reuses.
--
-- How a show is cancelled today: shows.status becomes 'cancelled' (shows_status_check, migration
-- 072). Two screens write it, both as a plain UPDATE of that column: the Mark cancelled bulk
-- action on the Managing tab (updateShow) and the Refund All card on the show's settings
-- (RefundAllEntriesCard). So the producer is a trigger on shows, which sees both.
--
-- Owner decision 2026-11-19: the money line is fixed. The email says only "The club will
-- contact you about your entry fees." It promises no refund, starts none and names no amount
-- or date (refunds stay a human act, CLAUDE.md Architecture Decisions).
--
--   1. Both step_type CHECKs gain 'show_cancelled'; the step gets a row per show (a job needs a
--      step_id). Its is_enabled is not read: the secretary cannot hold this email back.
--   2. Producer: AFTER UPDATE OF status ON shows, only when the status BECOMES 'cancelled' from
--      a published state (published, upcoming, in_progress). A draft that is cancelled sends
--      nothing; a row saved again while already cancelled is not a change, so repeating the
--      cancel sends nothing.
--   3. Recipients: the dog's owner and the entry's handler with an email, for every entry still
--      standing (the live statuses of show_live_entry_person_ids, MYK9-2124). A person whose
--      entries were all pulled, withdrawn or removed gets nothing. Unlike that function the class
--      and trial are not required to be live: cancelling the show may cancel its classes, and
--      that must not silence the email.
--   4. Once: the job's idempotency_key is one per show and person, with no random part, and the
--      insert does nothing on a conflict. Cancel, reopen and cancel again is still one email.
--      The one exception is a job that was SKIPPED (the show was reopened inside the quiet
--      minutes, so nothing went out): cancelling again revives it.
--   5. Deploy safety (the MYK9-2126 pattern): jobs are made 'held'; the new sender releases
--      them (held to ready) at the start of every drain, so a sender deployed before this one
--      never mails them as a date change. Order: db push, then functions deploy
--      send-lifecycle-email.
--   6. show_cancelled_person_has_entry(show, person): the sender's send-time check, so an
--      exhibitor whose entries were all withdrawn in the quiet minutes is skipped.
--
-- Rollback: DROP TRIGGER trg_queue_show_cancelled_email ON public.shows; DROP FUNCTION
-- public.queue_show_cancelled_email_from_show(), public.queue_show_cancelled_email(uuid),
-- public.show_cancelled_person_has_entry(uuid, uuid), public.show_cancelled_email_person_ids(uuid);
-- delete show_cancelled jobs and steps, restore the nine-value step_type CHECKs and
-- ensure_show_lifecycle_email_steps from 20261119045700.
-- =============================================================================

BEGIN;

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
         AND pg_get_constraintdef(c.oid) LIKE '%entry_changed%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_table, v_constraint);
      v_dropped := v_dropped + 1;
    END LOOP;
    IF v_dropped <> 1 THEN
      RAISE EXCEPTION 'MYK9-2127: expected to drop exactly one step_type CHECK on %, dropped %',
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
      'show_changed',
      'judge_changed',
      'entry_changed',
      'show_cancelled'
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
      'show_changed',
      'judge_changed',
      'entry_changed',
      'show_cancelled'
    )
  );

-- Copied from its LATEST definition (20261119045700), plus the tenth step.
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
    (p_show_id, 'show_changed', true),
    (p_show_id, 'judge_changed', true),
    (p_show_id, 'entry_changed', true),
    (p_show_id, 'show_cancelled', true)
  ON CONFLICT (show_id, step_type) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.ensure_show_lifecycle_email_steps(uuid) FROM PUBLIC, anon, authenticated;

SELECT public.ensure_show_lifecycle_email_steps(s.id) FROM public.shows s;

-- Everyone with an entry still standing at the show: the live entry statuses of
-- show_live_entry_person_ids, without its class and trial conditions (see 3 above).
CREATE OR REPLACE FUNCTION public.show_cancelled_email_person_ids(p_show_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT r.person_id
    FROM public.entries e
    JOIN public.dogs d ON d.id = e.dog_id
    CROSS JOIN LATERAL (VALUES (d.owner_id), (e.handler_id)) AS r(person_id)
   WHERE e.show_id = p_show_id
     AND e.deleted_at IS NULL
     AND e.entry_status IN (
       'confirmed', 'accepted', 'scheduled', 'checked-in', 'at-gate',
       'in-ring', 'competing', 'completed', 'move-up-requested', 'move_up_requested',
       'submitted', 'paid', 'pending', 'promotion-expired', 'waitlisted'
     )
     AND e.check_in_status IS DISTINCT FROM 'pulled'
     AND r.person_id IS NOT NULL
     AND d.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.show_cancelled_email_person_ids(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.show_cancelled_person_has_entry(p_show_id uuid, p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.show_cancelled_email_person_ids(p_show_id) AS ids(person_id)
     WHERE ids.person_id = p_person_id
  );
$$;

REVOKE ALL ON FUNCTION public.show_cancelled_person_has_entry(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.show_cancelled_person_has_entry(uuid, uuid) TO service_role;

-- The producer. Safe to call for any show: it does nothing unless the show is cancelled.
CREATE OR REPLACE FUNCTION public.queue_show_cancelled_email(p_show_id uuid)
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

  IF v_status IS DISTINCT FROM 'cancelled' THEN
    RETURN;
  END IF;

  SELECT s.id INTO v_step_id
    FROM public.show_lifecycle_email_steps s
   WHERE s.show_id = p_show_id AND s.step_type = 'show_cancelled';
  IF v_step_id IS NULL THEN
    PERFORM public.ensure_show_lifecycle_email_steps(p_show_id);
    SELECT s.id INTO v_step_id
      FROM public.show_lifecycle_email_steps s
     WHERE s.show_id = p_show_id AND s.step_type = 'show_cancelled';
  END IF;

  INSERT INTO public.show_lifecycle_email_jobs AS j (
    show_id, step_id, step_type, status, recipient_scope, recipient_person_id,
    recipient_email, recipient_name, subject, idempotency_key, due_at, auto_send
  )
  SELECT
    p_show_id,
    v_step_id,
    'show_cancelled',
    'held',
    'show_recipient',
    p.id,
    btrim(p.email),
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    coalesce(v_show_name, 'Your show') || ' has been cancelled',
    -- One per show and person, for good: no random part (see 4 above).
    'show-lifecycle-email:' || p_show_id::text || ':show_cancelled:person:' || p.id::text,
    now() + interval '5 minutes',
    true
  FROM public.people p
  WHERE nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL
    AND p.deleted_at IS NULL
    AND p.id IN (
      SELECT ids.person_id FROM public.show_cancelled_email_person_ids(p_show_id) AS ids(person_id)
    )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    status = 'held',
    due_at = now() + interval '5 minutes',
    skipped_at = NULL,
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name
  -- Only a job that was skipped (reopened before it went out) is revived; a sent, failed,
  -- dismissed or waiting one stays as it is.
  WHERE j.status = 'skipped';
END;
$$;

REVOKE ALL ON FUNCTION public.queue_show_cancelled_email(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.queue_show_cancelled_email_from_show()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.queue_show_cancelled_email(new.id);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Queuing an email must never block the cancel.
  RAISE WARNING 'queue_show_cancelled_email_from_show: % (%)', SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_show_cancelled_email_from_show()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_queue_show_cancelled_email ON public.shows;
CREATE TRIGGER trg_queue_show_cancelled_email
  AFTER UPDATE OF status ON public.shows
  FOR EACH ROW
  WHEN (
    new.status = 'cancelled'
    AND old.status IN ('published', 'upcoming', 'in_progress')
  )
  EXECUTE FUNCTION public.queue_show_cancelled_email_from_show();

COMMIT;
