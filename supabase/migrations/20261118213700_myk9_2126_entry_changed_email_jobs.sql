-- =============================================================================
-- MYK9-2126: an exhibitor is emailed, by the server, when the secretary edits, moves or
-- pulls one of her entries on a published show. Part 3 of the change emails; parts 1 and 2
-- are MYK9-2124 (show_changed) and MYK9-2125 (judge_changed), whose automatic queue and
-- drain this reuses as they are.
--
-- Plan: docs/plan-automatic-email-jobs.md, Phase 3.
--
--   1. Both step_type CHECKs gain 'entry_changed'; the step gets a row per show (seeded by
--      ensure_show_lifecycle_email_steps, existing shows backfilled) because a job needs a
--      step_id. Its is_enabled is not read: the secretary cannot hold a change email back
--      (docs/plan-exhibitor-wait.md, Non-goals), so neither the producer nor the sender gates on it.
--   2. show_lifecycle_email_jobs.entry_changes jsonb NOT NULL DEFAULT '[]': an append-only
--      list of what happened to the person's entries while the job waited:
--        {"kind":"moved","entry_id":<new entry>,"from_entry_id":<old entry>,
--         "from_class_id":..,"to_class_id":..}
--        {"kind":"pulled"|"withdrawn"|"removed"|"pulled_at_show"|"deleted","entry_id":..}
--        {"kind":"edited","entry_id":..,"field":"handler"|"jump_height","from":<value or null>}
--      Ids and the pre-edit value only, never rendered text: the sender renders at send time
--      and drops whatever was undone (a change back to what it was is not news). Server-written
--      only: the column-level UPDATE ACL (20261018031700) does not list it.
--   3. A partial UNIQUE index on (show_id, recipient_person_id) for the one unsent
--      entry_changed job. Several edits in one sitting upsert that one row, append their
--      events and push due_at out five minutes: the 8 second Undo toast has long closed by
--      then, and the quiet minutes are the same ones show_changed and judge_changed wait.
--   4. Producers. Who acted decides everything (entry_change_actor, the write RPCs' own rule):
--      a manager of the show is staff; otherwise the entry's handler before the change, the
--      dog's owner or co-owner is the exhibitor, whose own change sends nothing and drops a
--      waiting staff edit of the same field; no acting user (a cron job, the service role)
--      emails nobody.
--        * AFTER INSERT on entries with moved_from_entry_id from the same dog at the same show:
--          move_up_entry writes a successor entry, and that is also how an ACCEPTED class
--          change request (MYK9-1929 / 1978) lands. It is therefore the single place that email
--          is produced: the request itself and its acceptance's other writes are not watched,
--          so an accepted request makes exactly this one email, never a second.
--        * AFTER UPDATE on entries: handler (the name Edit Entry saves) and jump_height edits;
--          entry_status becoming scratched (pulled), withdrawn with a reason (withdrawn) or
--          withdrawn without one (removed by the secretary); check_in_status becoming pulled
--          (pulled at the show, not by the exhibitor); deleted_at set. Removing the successor
--          of a move while the original is restored is reverse_move_up_entry: it cancels the
--          move in a waiting job, and tells the move back to whoever was already emailed it.
--      Only a published show (published, upcoming, in_progress); recipients are the dog's
--      owner and the entry's handler with an email (the MYK9-2124 rule), minus the actor.
--      Triggers never block the edit.
--   5. Nothing new in the claim or the drain's cron: ready, due, auto_send jobs of any step
--      are already taken.
--
-- Rollback: DROP TRIGGER trg_queue_entry_changed_email_insert, _update ON public.entries;
-- DROP FUNCTION public.queue_entry_changed_email_from_insert(),
-- public.queue_entry_changed_email_from_update(),
-- public.queue_entry_changed_email(uuid, jsonb, uuid, uuid[]), public.entry_change_actor(uuid, uuid, uuid);
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

-- Who made this change, by the write path's own rules (withdraw_own_entry and
-- update_own_entry_jump_height, steps 3 and 4): a manager of the show (can_manage_show) is
-- 'staff' even on her own dog; otherwise the entry's listed handler BEFORE the change, the
-- dog's owner or its co-owner is the 'exhibitor'; no signed-in user (a cron job, the service
-- role) is 'nobody'. Anyone else who can write the row (a ringside official) is 'staff'.
CREATE OR REPLACE FUNCTION public.entry_change_actor(
  p_show_id uuid,
  p_dog_id uuid,
  p_prior_handler_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'nobody';
  END IF;
  IF coalesce(public.can_manage_show(p_show_id), false) THEN
    RETURN 'staff';
  END IF;
  SELECT p.id INTO v_actor_id FROM public.people p WHERE p.auth_user_id = auth.uid() LIMIT 1;
  IF v_actor_id IS NOT NULL AND (
       coalesce(p_prior_handler_id = v_actor_id, false)
       OR EXISTS (
         SELECT 1 FROM public.dogs d
          WHERE d.id = p_dog_id
            AND (d.owner_id = v_actor_id OR d.co_owner_id = v_actor_id)
       )
     ) THEN
    RETURN 'exhibitor';
  END IF;
  RETURN 'staff';
END;
$$;

REVOKE ALL ON FUNCTION public.entry_change_actor(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- The producer: p_events happened to p_entry_id just now. Safe to call for any entry: it does
-- nothing for an unpublished show, an exhibitor's own change or a change with no acting user.
-- p_prior_handler_id is the entry's handler BEFORE the change (who may call it her own);
-- p_only_people, when given, narrows the recipients (a move back goes only to whoever was told
-- of the move). There is no per-show switch: the secretary cannot hold a change email back.
CREATE OR REPLACE FUNCTION public.queue_entry_changed_email(
  p_entry_id uuid,
  p_events jsonb,
  p_prior_handler_id uuid,
  p_only_people uuid[] DEFAULT NULL
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
  v_dog_id uuid;
  v_owner_id uuid;
  v_handler_id uuid;
  v_step_id uuid;
  v_actor_id uuid;
BEGIN
  IF p_events IS NULL OR jsonb_array_length(p_events) = 0 THEN
    RETURN;
  END IF;

  SELECT e.show_id, sh.name, sh.status, e.dog_id, d.owner_id, e.handler_id
    INTO v_show_id, v_show_name, v_status, v_dog_id, v_owner_id, v_handler_id
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

  -- A change the exhibitor made herself, or one nobody made, is not reported.
  IF public.entry_change_actor(v_show_id, v_dog_id, p_prior_handler_id) <> 'staff' THEN
    RETURN;
  END IF;

  SELECT s.id INTO v_step_id
    FROM public.show_lifecycle_email_steps s
   WHERE s.show_id = v_show_id AND s.step_type = 'entry_changed';
  IF v_step_id IS NULL THEN
    PERFORM public.ensure_show_lifecycle_email_steps(v_show_id);
    SELECT s.id INTO v_step_id
      FROM public.show_lifecycle_email_steps s
     WHERE s.show_id = v_show_id AND s.step_type = 'entry_changed';
  END IF;

  -- A secretary editing an entry on her own dog is not emailed about it.
  SELECT p.id INTO v_actor_id FROM public.people p WHERE p.auth_user_id = auth.uid() LIMIT 1;

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
    AND p.id IS DISTINCT FROM v_actor_id
    AND (p_only_people IS NULL OR p.id = ANY (p_only_people))
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

REVOKE ALL ON FUNCTION public.queue_entry_changed_email(uuid, jsonb, uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;

-- A move writes a successor entry (move_up_entry), which is also how an accepted class change
-- request lands. The source must be the same dog at the same show: the foreign key alone does
-- not say so, and a job is read by that show's managers.
CREATE OR REPLACE FUNCTION public.queue_entry_changed_email_from_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from_class uuid;
  v_from_handler uuid;
BEGIN
  SELECT e.class_id, e.handler_id INTO v_from_class, v_from_handler
    FROM public.entries e
   WHERE e.id = new.moved_from_entry_id
     AND e.show_id = new.show_id
     AND e.dog_id = new.dog_id;
  IF v_from_class IS NOT NULL AND new.class_id IS NOT NULL THEN
    PERFORM public.queue_entry_changed_email(new.id, jsonb_build_array(jsonb_build_object(
      'kind', 'moved',
      'entry_id', new.id,
      'from_entry_id', new.moved_from_entry_id,
      'from_class_id', v_from_class,
      'to_class_id', new.class_id
    )), v_from_handler);
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
  v_actor text;
  v_fields text[] := '{}';
  v_source public.entries%ROWTYPE;
  v_cancelled uuid[];
  v_told uuid[];
BEGIN
  -- A move put back (reverse_move_up_entry, from the Undo toast or the Move back action)
  -- restores the original and then removes the successor. Whoever has not been emailed yet
  -- loses the move from the waiting job; whoever was already told of it is told of the move
  -- back, or her last email still names the wrong class.
  IF new.deleted_at IS NOT NULL AND old.deleted_at IS NULL AND new.moved_from_entry_id IS NOT NULL THEN
    SELECT * INTO v_source
      FROM public.entries src
     WHERE src.id = new.moved_from_entry_id
       AND src.show_id = new.show_id
       AND src.dog_id = new.dog_id
       AND src.deleted_at IS NULL
       AND src.entry_status IS DISTINCT FROM 'moved';
    IF FOUND THEN
      WITH cancelled AS (
        UPDATE public.show_lifecycle_email_jobs j
           SET entry_changes = coalesce((
                 SELECT jsonb_agg(ev ORDER BY ord)
                   FROM jsonb_array_elements(j.entry_changes) WITH ORDINALITY AS t(ev, ord)
                  WHERE ev->>'entry_id' IS DISTINCT FROM new.id::text
               ), '[]'::jsonb)
         WHERE j.show_id = new.show_id
           AND j.step_type = 'entry_changed'
           AND j.status = 'ready'
           AND j.entry_changes @> jsonb_build_array(jsonb_build_object('entry_id', new.id))
        RETURNING j.recipient_person_id
      )
      SELECT array_agg(recipient_person_id) INTO v_cancelled FROM cancelled;

      SELECT array_agg(DISTINCT j.recipient_person_id) INTO v_told
        FROM public.show_lifecycle_email_jobs j
       WHERE j.show_id = new.show_id
         AND j.step_type = 'entry_changed'
         AND j.status = 'sent'
         AND j.recipient_person_id IS NOT NULL
         AND j.entry_changes @> jsonb_build_array(
               jsonb_build_object('kind', 'moved', 'entry_id', new.id))
         AND NOT (j.recipient_person_id = ANY (coalesce(v_cancelled, '{}'::uuid[])));

      IF v_told IS NOT NULL AND v_source.class_id IS NOT NULL AND new.class_id IS NOT NULL THEN
        PERFORM public.queue_entry_changed_email(v_source.id, jsonb_build_array(jsonb_build_object(
          'kind', 'moved',
          'entry_id', v_source.id,
          'from_entry_id', new.id,
          'from_class_id', new.class_id,
          'to_class_id', v_source.class_id
        )), new.handler_id, v_told);
      END IF;
      RETURN NULL;
    END IF;
  END IF;

  v_actor := public.entry_change_actor(new.show_id, new.dog_id, old.handler_id);
  IF v_actor = 'nobody' THEN
    RETURN NULL;
  END IF;

  -- The handler is the name Edit Entry saves (entries.handler); handler_id is the identity
  -- link it deliberately keeps (MYK9-665), so the email follows the text.
  IF old.handler IS DISTINCT FROM new.handler THEN
    v_fields := v_fields || 'handler'::text;
    v_events := v_events || jsonb_build_object(
      'kind', 'edited', 'entry_id', new.id, 'field', 'handler', 'from', old.handler);
  END IF;
  IF old.jump_height IS DISTINCT FROM new.jump_height THEN
    v_fields := v_fields || 'jump_height'::text;
    v_events := v_events || jsonb_build_object(
      'kind', 'edited', 'entry_id', new.id, 'field', 'jump_height', 'from', old.jump_height);
  END IF;

  -- The exhibitor's own edit has the last word on that field: a secretary's edit of it still
  -- waiting (on this entry or the one it was moved from) is no longer the secretary's change
  -- to report. Her own change is never reported either.
  IF v_actor = 'exhibitor' THEN
    IF cardinality(v_fields) > 0 THEN
      WITH RECURSIVE chain(id) AS (
        SELECT new.id
        UNION
        SELECT e.moved_from_entry_id
          FROM public.entries e
          JOIN chain c ON e.id = c.id
         WHERE e.moved_from_entry_id IS NOT NULL
      )
      UPDATE public.show_lifecycle_email_jobs j
         SET entry_changes = coalesce((
               SELECT jsonb_agg(ev ORDER BY ord)
                 FROM jsonb_array_elements(j.entry_changes) WITH ORDINALITY AS t(ev, ord)
                WHERE NOT (
                  ev->>'kind' = 'edited'
                  AND ev->>'field' = ANY (v_fields)
                  AND ev->>'entry_id' IN (SELECT c.id::text FROM chain c)
                )
             ), '[]'::jsonb)
       WHERE j.show_id = new.show_id
         AND j.step_type = 'entry_changed'
         AND j.status = 'ready'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(j.entry_changes) ev
            WHERE ev->>'kind' = 'edited'
              AND ev->>'field' = ANY (v_fields)
              AND ev->>'entry_id' IN (SELECT c.id::text FROM chain c)
         );
    END IF;
    RETURN NULL;
  END IF;

  -- Which act, in its own words (docs/INTENT.md "Withdraw vs Pull", classifyEntryRemoval):
  -- 'scratched' is a pull, 'withdrawn' with a recognised reason is a withdrawal, a reasonless
  -- 'withdrawn' is the secretary removing the entry, and a day-of check_in_status 'pulled' is
  -- a pull at the show.
  IF new.entry_status IS DISTINCT FROM old.entry_status THEN
    IF new.entry_status = 'scratched' THEN
      v_events := v_events || jsonb_build_object('kind', 'pulled', 'entry_id', new.id);
    ELSIF new.entry_status = 'withdrawn' THEN
      v_events := v_events || jsonb_build_object(
        'kind',
        CASE WHEN new.withdrawal_reason_code IN ('in_season', 'judge_change')
             THEN 'withdrawn' ELSE 'removed' END,
        'entry_id', new.id);
    END IF;
  END IF;
  IF new.check_in_status = 'pulled' AND old.check_in_status IS DISTINCT FROM 'pulled'
     AND new.check_in_pulled_by IS DISTINCT FROM 'exhibitor' THEN
    v_events := v_events || jsonb_build_object('kind', 'pulled_at_show', 'entry_id', new.id);
  END IF;
  IF new.deleted_at IS NOT NULL AND old.deleted_at IS NULL THEN
    v_events := v_events || jsonb_build_object('kind', 'deleted', 'entry_id', new.id);
  END IF;

  PERFORM public.queue_entry_changed_email(new.id, v_events, old.handler_id);
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
  AFTER UPDATE OF handler, jump_height, entry_status, check_in_status, deleted_at ON public.entries
  FOR EACH ROW
  WHEN (
    old.handler IS DISTINCT FROM new.handler
    OR old.jump_height IS DISTINCT FROM new.jump_height
    OR old.entry_status IS DISTINCT FROM new.entry_status
    OR old.check_in_status IS DISTINCT FROM new.check_in_status
    OR (old.deleted_at IS NULL AND new.deleted_at IS NOT NULL)
  )
  EXECUTE FUNCTION public.queue_entry_changed_email_from_update();

COMMIT;
