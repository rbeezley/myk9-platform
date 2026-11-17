-- =============================================================================
-- MYK9-2125: exhibitors are emailed, by the server, when the judge of a class they are
-- entered in changes on a published show. Part 2 of the change emails; part 1 is
-- MYK9-2124 (show_changed), whose automatic queue this reuses as it is.
--
-- Plan: docs/plan-automatic-email-jobs.md.
--
--   1. Both step_type CHECKs (steps and jobs) gain 'judge_changed'. The step gets a row
--      per show like the other seven (ensure_show_lifecycle_email_steps seeds it and
--      existing shows are backfilled), so the secretary's per-show switch (is_enabled)
--      works.
--   2. show_lifecycle_email_jobs.judge_changes jsonb NOT NULL DEFAULT '{}': for a
--      judge_changed job, { "<class id>": "<person id of the judge BEFORE the first
--      change>" }. Only ids are stored, never the rendered text: the sender renders at
--      send time from current data, so "was X, now Y" always names the judge the
--      exhibitor first knew and the judge now in place. Server-written only: the
--      column-level UPDATE ACL from 20261018031700 does not list it, so authenticated can
--      neither set nor clear it (the MYK9-1254 test walks every column).
--   3. A partial UNIQUE index on (show_id, recipient_person_id) for the one unsent
--      judge_changed job. Several edits in one sitting upsert that one row, merge their
--      classes into judge_changes (the earliest "from" wins) and push its due_at out.
--   4. Producer. A class's judge is its one confirmed class-level judge_assignments row
--      (CONTEXT.md, Class). set_class_judge replaces the row (delete, then insert), a
--      direct edit may change person_id or status, so the producer watches the row that
--      STOPS being the confirmed judge: AFTER DELETE, and AFTER UPDATE OF person_id,
--      status, class_id, on a confirmed class-level row. It records the leaving judge.
--      A first assignment (insert with no earlier judge) emails nobody; a same-judge
--      replay (set_class_judge no-op) writes nothing. For a published show (status
--      published, upcoming or in_progress) with the step on, each person with a live entry
--      in that class (the dog's owner and the entry's handler, deduplicated, the
--      MYK9-2124 / MYK9-2076 rule) gets one ready, auto_send job due in 5 minutes.
--      Triggers never block the edit.
--   5. The MYK9-2124 claim and the five-minute pg_cron drain already take every ready,
--      due, auto_send job, so judge_changed needs nothing there.
--   6. person_live_entry_class_ids(show, person): the sender's send-time check of which
--      classes the person still has a live entry in.
--
-- Rollback: DROP TRIGGER trg_queue_judge_changed_email_delete ON public.judge_assignments;
-- DROP TRIGGER trg_queue_judge_changed_email_update ON public.judge_assignments; DROP
-- FUNCTION public.queue_judge_changed_email_from_assignment(),
-- public.queue_judge_changed_email_for_class(uuid, uuid),
-- public.person_live_entry_class_ids(uuid, uuid),
-- public.live_entry_person_class_pairs(uuid); DROP INDEX
-- show_lifecycle_email_jobs_one_ready_judge_changed; delete judge_changed jobs and steps,
-- restore the seven-value CHECKs and ensure_show_lifecycle_email_steps from
-- 20261117094700, ALTER TABLE public.show_lifecycle_email_jobs DROP COLUMN judge_changes.
-- =============================================================================

BEGIN;

ALTER TABLE public.show_lifecycle_email_jobs
  ADD COLUMN IF NOT EXISTS judge_changes jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.show_lifecycle_email_jobs.judge_changes IS
  'MYK9-2125: for a judge_changed job, { class id: person id of the class judge before the first change }. Ids only; the email is rendered at send time. Written by the server only.';

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
      RAISE EXCEPTION 'MYK9-2125: expected to drop exactly one step_type CHECK on %, dropped %',
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
      'judge_changed'
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
      'judge_changed'
    )
  );

-- Copied from its LATEST definition (20261117094700), plus the eighth step.
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
    (p_show_id, 'judge_changed', true)
  ON CONFLICT (show_id, step_type) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.ensure_show_lifecycle_email_steps(uuid) FROM PUBLIC, anon, authenticated;

SELECT public.ensure_show_lifecycle_email_steps(s.id) FROM public.shows s;

CREATE UNIQUE INDEX IF NOT EXISTS show_lifecycle_email_jobs_one_ready_judge_changed
  ON public.show_lifecycle_email_jobs (show_id, recipient_person_id)
  WHERE step_type = 'judge_changed' AND status = 'ready' AND recipient_person_id IS NOT NULL;

-- Who has a live entry in which class: the same "live entry" rule as
-- show_live_entry_person_ids (20261117094700), at (person, class) grain. The dog's owner and
-- the entry's handler both count, because My Shows lists the entry for both.
CREATE OR REPLACE FUNCTION public.live_entry_person_class_pairs(p_show_id uuid)
RETURNS TABLE (person_id uuid, class_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT r.person_id, c.id
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
       'submitted', 'paid', 'pending', 'promotion-expired', 'waitlisted',
       -- A waitlist offer awaiting payment (MYK9-1988): the spot is theirs for now.
       'pending-payment'
     )
     AND e.check_in_status IS DISTINCT FROM 'pulled'
     AND r.person_id IS NOT NULL
     AND d.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.live_entry_person_class_pairs(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- The sender asks this at send time: the classes the person still has a live entry in.
CREATE OR REPLACE FUNCTION public.person_live_entry_class_ids(p_show_id uuid, p_person_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pairs.class_id
    FROM public.live_entry_person_class_pairs(p_show_id) AS pairs
   WHERE pairs.person_id = p_person_id;
$$;

REVOKE ALL ON FUNCTION public.person_live_entry_class_ids(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.person_live_entry_class_ids(uuid, uuid) TO service_role;

-- The producer: the judge p_from_person_id just stopped judging p_class_id. Safe to call
-- for any class: it does nothing for an unpublished show.
CREATE OR REPLACE FUNCTION public.queue_judge_changed_email_for_class(
  p_class_id uuid,
  p_from_person_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_show_name text;
  v_status text;
  v_step_id uuid;
BEGIN
  SELECT sh.id, sh.name, sh.status INTO v_show_id, v_show_name, v_status
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id AND t.deleted_at IS NULL
    JOIN public.shows sh ON sh.id = t.show_id AND sh.deleted_at IS NULL
   WHERE c.id = p_class_id
     AND c.deleted_at IS NULL;

  -- A class or show that is gone (a cascade delete) has nothing to tell anyone.
  IF v_show_id IS NULL THEN
    RETURN;
  END IF;

  -- Only a published show: a draft is still being set up.
  IF v_status IS NULL OR v_status NOT IN ('published', 'upcoming', 'in_progress') THEN
    RETURN;
  END IF;

  -- The per-show switch.
  SELECT s.id INTO v_step_id
    FROM public.show_lifecycle_email_steps s
   WHERE s.show_id = v_show_id
     AND s.step_type = 'judge_changed'
     AND s.is_enabled;
  IF v_step_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.show_lifecycle_email_jobs AS j (
    show_id, step_id, step_type, status, recipient_scope, recipient_person_id,
    recipient_email, recipient_name, subject, idempotency_key, due_at, auto_send,
    judge_changes
  )
  SELECT
    v_show_id,
    v_step_id,
    'judge_changed',
    'ready',
    'show_recipient',
    p.id,
    btrim(p.email),
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    'Judge change for ' || coalesce(v_show_name, 'your show'),
    -- A job is one email; a change after it went out is a new job, so a new key.
    'show-lifecycle-email:' || v_show_id::text || ':judge_changed:person:' || p.id::text
      || ':' || gen_random_uuid()::text,
    now() + interval '5 minutes',
    true,
    jsonb_build_object(p_class_id::text, p_from_person_id::text)
  FROM public.people p
  WHERE nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL
    AND p.deleted_at IS NULL
    AND p.id IN (
      SELECT pairs.person_id
        FROM public.live_entry_person_class_pairs(v_show_id) AS pairs
       WHERE pairs.class_id = p_class_id
    )
  -- Another edit in the same sitting: the one waiting job stays, waits again and adds the
  -- class. The existing value wins on a class already there, so "was" stays the judge
  -- before the FIRST change.
  ON CONFLICT (show_id, recipient_person_id)
    WHERE step_type = 'judge_changed' AND status = 'ready' AND recipient_person_id IS NOT NULL
  DO UPDATE SET
    due_at = now() + interval '5 minutes',
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name,
    judge_changes = excluded.judge_changes || j.judge_changes;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_judge_changed_email_for_class(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.queue_judge_changed_email_from_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- The row that stops being the class's confirmed judge. (The trigger WHEN clauses already
  -- say so; this keeps the function honest if it is ever attached elsewhere.)
  IF old.class_id IS NOT NULL AND old.status = 'confirmed' THEN
    PERFORM public.queue_judge_changed_email_for_class(old.class_id, old.person_id);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Queuing an email must never block the edit.
  RAISE WARNING 'queue_judge_changed_email_from_assignment: % (%)', SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_judge_changed_email_from_assignment()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_queue_judge_changed_email_delete ON public.judge_assignments;
CREATE TRIGGER trg_queue_judge_changed_email_delete
  AFTER DELETE ON public.judge_assignments
  FOR EACH ROW
  WHEN (old.class_id IS NOT NULL AND old.status = 'confirmed')
  EXECUTE FUNCTION public.queue_judge_changed_email_from_assignment();

DROP TRIGGER IF EXISTS trg_queue_judge_changed_email_update ON public.judge_assignments;
CREATE TRIGGER trg_queue_judge_changed_email_update
  AFTER UPDATE OF person_id, status, class_id ON public.judge_assignments
  FOR EACH ROW
  WHEN (
    old.class_id IS NOT NULL
    AND old.status = 'confirmed'
    AND (
      old.person_id IS DISTINCT FROM new.person_id
      OR new.status IS DISTINCT FROM 'confirmed'
      OR old.class_id IS DISTINCT FROM new.class_id
    )
  )
  EXECUTE FUNCTION public.queue_judge_changed_email_from_assignment();

COMMIT;
