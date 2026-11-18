-- =============================================================================
-- MYK9-2126: an exhibitor is emailed, by the server, when the secretary edits, moves or
-- pulls one of her entries on a published show. Part 3 of the change emails; parts 1 and 2
-- are MYK9-2124 (show_changed) and MYK9-2125 (judge_changed), whose automatic queue and
-- drain this reuses as they are.
--
-- Plan: docs/plan-automatic-email-jobs.md, Phase 3.
--
--   1. Both step_type CHECKs gain 'entry_changed'; the step gets a row per show (seeded by
--      ensure_show_lifecycle_email_steps, existing shows backfilled), so the secretary's
--      per-show switch (is_enabled) works.
--   2. show_lifecycle_email_jobs.entry_changes jsonb NOT NULL DEFAULT '[]': an append-only
--      list of what happened to the person's entries while the job waited:
--        {"kind":"moved","entry_id":<new entry>,"from_entry_id":<old entry>,
--         "from_class_id":..,"to_class_id":..}
--        {"kind":"withdrawn"|"pulled"|"removed","entry_id":..}
--        {"kind":"edited","entry_id":..,"field":"handler"|"jump_height","from":<value or null>}
--      Ids and the pre-edit value only, never rendered text: the sender renders at send time
--      and drops whatever was undone (a change back to what it was is not news). Server-written
--      only: the column-level UPDATE ACL (20261018031700) does not list it.
--   3. A partial UNIQUE index on (show_id, recipient_person_id) for the one unsent
--      entry_changed job. Several edits in one sitting upsert that one row, append their
--      events and push due_at out five minutes: the 8 second Undo toast has long closed by
--      then, and the quiet minutes are the same ones show_changed and judge_changed wait.
--   4. Producers. Who acted decides everything: the acting person is auth.uid()'s person.
--      No acting user (a cron job, the service role) emails nobody, and neither does an actor
--      who is herself the dog's owner or the entry's handler (an exhibitor's own edit, her own
--      withdrawal, her own self check-in pull). So a change the exhibitor made sends nothing.
--        * AFTER INSERT on entries with moved_from_entry_id: move_up_entry writes a successor
--          entry, and that is also how an ACCEPTED class change request (MYK9-1929 / 1978)
--          lands. It is therefore the single place that email is produced: the request itself
--          and its acceptance's other writes (status, request columns) are not watched, so an
--          accepted request makes exactly this one email, never a second.
--        * AFTER UPDATE on entries: handler_id and jump_height edits, entry_status becoming
--          withdrawn or scratched, check_in_status becoming pulled (not by the exhibitor),
--          deleted_at set. Removing the successor of a move while the original is restored
--          is reverse_move_up_entry (the secretary's Undo): it cancels the move's events
--          instead of adding a removal.
--      Only a published show (published, upcoming, in_progress) with the step on; recipients
--      are the dog's owner and the entry's handler with an email (the MYK9-2124 rule),
--      minus the actor. Triggers never block the edit.
--   5. Nothing new in the claim or the drain's cron: ready, due, auto_send jobs of any step
--      are already taken.
--
-- Rollback: DROP TRIGGER trg_queue_entry_changed_email_insert, _update ON public.entries;
-- DROP FUNCTION public.queue_entry_changed_email_from_insert(),
-- public.queue_entry_changed_email_from_update(), public.queue_entry_changed_email(uuid, jsonb);
-- DROP INDEX show_lifecycle_email_jobs_one_ready_entry_changed; delete entry_changed jobs and
-- steps, restore the eight-value CHECKs and ensure_show_lifecycle_email_steps from
-- 20261117191300, ALTER TABLE public.show_lifecycle_email_jobs DROP COLUMN entry_changes.
-- =============================================================================

BEGIN;

ALTER TABLE public.show_lifecycle_email_jobs
  ADD COLUMN IF NOT EXISTS entry_changes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.show_lifecycle_email_jobs.entry_changes IS
  'MYK9-2126: for an entry_changed job, the list of changes to the recipient''s entries while it waited (kind, entry ids, from-values). Ids only; the email is rendered at send time. Written by the server only.';

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
      RAISE EXCEPTION 'MYK9-2126: expected to drop exactly one step_type CHECK on %, dropped %',
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
      'entry_changed'
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
      'entry_changed'
    )
  );

-- Copied from its LATEST definition (20261117191300), plus the ninth step.
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
    (p_show_id, 'entry_changed', true)
  ON CONFLICT (show_id, step_type) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.ensure_show_lifecycle_email_steps(uuid) FROM PUBLIC, anon, authenticated;

SELECT public.ensure_show_lifecycle_email_steps(s.id) FROM public.shows s;

CREATE UNIQUE INDEX IF NOT EXISTS show_lifecycle_email_jobs_one_ready_entry_changed
  ON public.show_lifecycle_email_jobs (show_id, recipient_person_id)
  WHERE step_type = 'entry_changed' AND status = 'ready' AND recipient_person_id IS NOT NULL;

-- The producer: p_events happened to p_entry_id just now. Safe to call for any entry: it does
-- nothing for an unpublished show, a switched-off step, an exhibitor's own change or a change
-- with no acting user.
CREATE OR REPLACE FUNCTION public.queue_entry_changed_email(p_entry_id uuid, p_events jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_show_name text;
  v_status text;
  v_owner_id uuid;
  v_handler_id uuid;
  v_step_id uuid;
  v_actor_id uuid;
BEGIN
  IF p_events IS NULL OR jsonb_array_length(p_events) = 0 THEN
    RETURN;
  END IF;

  -- A cron job or the service role is not the secretary editing an entry.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT e.show_id, sh.name, sh.status, d.owner_id, e.handler_id
    INTO v_show_id, v_show_name, v_status, v_owner_id, v_handler_id
    FROM public.entries e
    JOIN public.dogs d ON d.id = e.dog_id
    JOIN public.shows sh ON sh.id = e.show_id AND sh.deleted_at IS NULL
   WHERE e.id = p_entry_id;

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
     AND s.step_type = 'entry_changed'
     AND s.is_enabled;
  IF v_step_id IS NULL THEN
    RETURN;
  END IF;

  -- A change the exhibitor made herself is not reported back to her.
  SELECT p.id INTO v_actor_id FROM public.people p WHERE p.auth_user_id = auth.uid() LIMIT 1;
  IF v_actor_id IS NOT NULL
     AND (v_actor_id = v_owner_id OR v_actor_id = v_handler_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.show_lifecycle_email_jobs AS j (
    show_id, step_id, step_type, status, recipient_scope, recipient_person_id,
    recipient_email, recipient_name, subject, idempotency_key, due_at, auto_send,
    entry_changes
  )
  SELECT
    v_show_id,
    v_step_id,
    'entry_changed',
    'ready',
    'show_recipient',
    p.id,
    btrim(p.email),
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    'Change to your entry at ' || coalesce(v_show_name, 'your show'),
    -- A job is one email; a change after it went out is a new job, so a new key.
    'show-lifecycle-email:' || v_show_id::text || ':entry_changed:person:' || p.id::text
      || ':' || gen_random_uuid()::text,
    now() + interval '5 minutes',
    true,
    p_events
  FROM public.people p
  WHERE nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL
    AND p.deleted_at IS NULL
    AND p.id IN (v_owner_id, v_handler_id)
  -- Another edit in the same sitting: the one waiting job stays, waits again and adds the
  -- events. The sender keeps the FIRST "from" of each field, so "was" is the value before
  -- the first edit.
  ON CONFLICT (show_id, recipient_person_id)
    WHERE step_type = 'entry_changed' AND status = 'ready' AND recipient_person_id IS NOT NULL
  DO UPDATE SET
    due_at = now() + interval '5 minutes',
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name,
    entry_changes = j.entry_changes || excluded.entry_changes;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_entry_changed_email(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- A move writes a successor entry (move_up_entry), which is also how an accepted class change
-- request lands.
CREATE OR REPLACE FUNCTION public.queue_entry_changed_email_from_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from_class uuid;
BEGIN
  SELECT e.class_id INTO v_from_class FROM public.entries e WHERE e.id = new.moved_from_entry_id;
  IF v_from_class IS NOT NULL AND new.class_id IS NOT NULL THEN
    PERFORM public.queue_entry_changed_email(new.id, jsonb_build_array(jsonb_build_object(
      'kind', 'moved',
      'entry_id', new.id,
      'from_entry_id', new.moved_from_entry_id,
      'from_class_id', v_from_class,
      'to_class_id', new.class_id
    )));
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Queuing an email must never block the edit.
  RAISE WARNING 'queue_entry_changed_email_from_insert: % (%)', SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_entry_changed_email_from_insert()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.queue_entry_changed_email_from_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_events jsonb := '[]'::jsonb;
BEGIN
  -- The secretary's Undo of a move (reverse_move_up_entry) restores the original and then
  -- removes the successor: that cancels the move, it is not a removal to report.
  IF new.deleted_at IS NOT NULL AND old.deleted_at IS NULL AND new.moved_from_entry_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.entries src
        WHERE src.id = new.moved_from_entry_id
          AND src.deleted_at IS NULL
          AND src.entry_status IS DISTINCT FROM 'moved'
     ) THEN
    UPDATE public.show_lifecycle_email_jobs j
       SET entry_changes = coalesce((
             SELECT jsonb_agg(ev ORDER BY ord)
               FROM jsonb_array_elements(j.entry_changes) WITH ORDINALITY AS t(ev, ord)
              WHERE ev->>'entry_id' IS DISTINCT FROM new.id::text
           ), '[]'::jsonb)
     WHERE j.show_id = new.show_id
       AND j.step_type = 'entry_changed'
       AND j.status = 'ready';
    RETURN NULL;
  END IF;

  IF old.handler_id IS DISTINCT FROM new.handler_id THEN
    v_events := v_events || jsonb_build_object(
      'kind', 'edited', 'entry_id', new.id, 'field', 'handler', 'from', old.handler_id);
  END IF;
  IF old.jump_height IS DISTINCT FROM new.jump_height THEN
    v_events := v_events || jsonb_build_object(
      'kind', 'edited', 'entry_id', new.id, 'field', 'jump_height', 'from', old.jump_height);
  END IF;
  IF new.entry_status IN ('withdrawn', 'scratched')
     AND old.entry_status IS DISTINCT FROM new.entry_status THEN
    v_events := v_events || jsonb_build_object('kind', 'withdrawn', 'entry_id', new.id);
  END IF;
  IF new.check_in_status = 'pulled' AND old.check_in_status IS DISTINCT FROM 'pulled'
     AND new.check_in_pulled_by IS DISTINCT FROM 'exhibitor' THEN
    v_events := v_events || jsonb_build_object('kind', 'pulled', 'entry_id', new.id);
  END IF;
  IF new.deleted_at IS NOT NULL AND old.deleted_at IS NULL THEN
    v_events := v_events || jsonb_build_object('kind', 'removed', 'entry_id', new.id);
  END IF;

  PERFORM public.queue_entry_changed_email(new.id, v_events);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'queue_entry_changed_email_from_update: % (%)', SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_entry_changed_email_from_update()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_queue_entry_changed_email_insert ON public.entries;
CREATE TRIGGER trg_queue_entry_changed_email_insert
  AFTER INSERT ON public.entries
  FOR EACH ROW
  WHEN (new.moved_from_entry_id IS NOT NULL)
  EXECUTE FUNCTION public.queue_entry_changed_email_from_insert();

DROP TRIGGER IF EXISTS trg_queue_entry_changed_email_update ON public.entries;
CREATE TRIGGER trg_queue_entry_changed_email_update
  AFTER UPDATE OF handler_id, jump_height, entry_status, check_in_status, deleted_at ON public.entries
  FOR EACH ROW
  WHEN (
    old.handler_id IS DISTINCT FROM new.handler_id
    OR old.jump_height IS DISTINCT FROM new.jump_height
    OR old.entry_status IS DISTINCT FROM new.entry_status
    OR old.check_in_status IS DISTINCT FROM new.check_in_status
    OR (old.deleted_at IS NULL AND new.deleted_at IS NOT NULL)
  )
  EXECUTE FUNCTION public.queue_entry_changed_email_from_update();

COMMIT;
