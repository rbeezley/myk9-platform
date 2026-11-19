-- =============================================================================
-- MYK9-2001: pulling out, money. When the exhibitor pulls or withdraws, the server tells her (the
-- dog, the classes, and that the refund is waiting for the secretary). The email promises no
-- amount and no date.
--
-- Plan: docs/plan-exhibitor-wait.md, "Pulling out". Nothing here issues, approves or schedules a
-- refund: a refund is never automatic. The email REPORTS what the exhibitor did. (The email
-- that reports the refund's outcome is MYK9-2249.)
--
--   1. Both step_type CHECKs gain 'pulled_out'; each show gets a step row (a job needs a
--      step_id). Its is_enabled is not read: the secretary cannot hold it back
--      (docs/plan-exhibitor-wait.md, Non-goals). Every step type already on main is listed.
--   2. Producer, writing HELD jobs for the sender to release (the MYK9-2126 deploy rule: db push,
--      then functions deploy send-lifecycle-email; until it is deployed they wait):
--        * pulled_out: AFTER UPDATE OF entry_status when an EXHIBITOR's own write makes the entry
--          'scratched' (a Pull) or 'withdrawn' WITH a reason code (a Withdraw). A secretary's
--          Pull is told by MYK9-2126's entry_changed email and a secretary removal (withdrawn,
--          no code) is nobody's act, so neither is told here: the exhibitor is never told twice.
--      The job stores ids only, in entry_changes ({"kind":"removed","entry_id":..}); the sender
--      renders from the entry's own recorded state at send time. Several in one sitting are ONE
--      email per person per show, due five minutes after the last (the same quiet minutes
--      show_changed and entry_changed wait). Only a published show; recipients are the dog's
--      owner and the entry's handler with an email, plus the acting co-owner.
--
-- Deploy order: db push, then `supabase functions deploy send-lifecycle-email`.
-- Rollback: DROP TRIGGER trg_queue_pulled_out_email ON public.entries; DROP FUNCTION
-- public.queue_pulled_out_email_from_update(), public.queue_entry_money_email(uuid, text, jsonb,
-- uuid); DROP INDEX show_lifecycle_email_jobs_one_unsent_entry_money; delete pulled_out jobs and
-- steps, restore the ten-value step_type CHECKs and ensure_show_lifecycle_email_steps from
-- 20261120052300.
-- =============================================================================

BEGIN;

-- 1. The step ------------------------------------------------------------------------------

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
      RAISE EXCEPTION 'MYK9-2001: expected to drop exactly one step_type CHECK on %, dropped %',
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
      'show_cancelled',
      'pulled_out'
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
      'show_cancelled',
      'pulled_out'
    )
  );

-- Copied from its LATEST definition (20261120052300, MYK9-2127), plus the eleventh
-- steps. Every step type already on main is listed above and here: this file sorts after
-- 20261120052300, but it must not depend on the order it is applied in.
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
    (p_show_id, 'show_cancelled', true),
    (p_show_id, 'pulled_out', true)
  ON CONFLICT (show_id, step_type) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.ensure_show_lifecycle_email_steps(uuid) FROM PUBLIC, anon, authenticated;

SELECT public.ensure_show_lifecycle_email_steps(s.id) FROM public.shows s;

-- 2. Producer ----------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS show_lifecycle_email_jobs_one_unsent_entry_money
  ON public.show_lifecycle_email_jobs (show_id, recipient_person_id, step_type)
  WHERE step_type = 'pulled_out'
    AND status IN ('held', 'ready') AND claimed_until IS NULL
    AND recipient_person_id IS NOT NULL;

-- p_event happened to p_entry_id just now. Safe to call for any entry: it does nothing for an
-- unpublished show. Who may be told is the CALLER's decision (pulled_out checks the actor). The
-- recipients are the dog's owner and the entry's handler, plus p_also_person_id when given.
CREATE OR REPLACE FUNCTION public.queue_entry_money_email(
  p_entry_id uuid,
  p_step_type text,
  p_event jsonb,
  p_also_person_id uuid DEFAULT NULL
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
  v_owner_id uuid;
  v_handler_id uuid;
  v_step_id uuid;
BEGIN
  IF p_step_type <> 'pulled_out' THEN
    RAISE EXCEPTION 'queue_entry_money_email: unsupported step %', p_step_type;
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

  SELECT s.id INTO v_step_id
    FROM public.show_lifecycle_email_steps s
   WHERE s.show_id = v_show_id AND s.step_type = p_step_type;
  IF v_step_id IS NULL THEN
    PERFORM public.ensure_show_lifecycle_email_steps(v_show_id);
    SELECT s.id INTO v_step_id
      FROM public.show_lifecycle_email_steps s
     WHERE s.show_id = v_show_id AND s.step_type = p_step_type;
  END IF;

  INSERT INTO public.show_lifecycle_email_jobs AS j (
    show_id, step_id, step_type, status, recipient_scope, recipient_person_id,
    recipient_email, recipient_name, subject, idempotency_key, due_at, auto_send,
    entry_changes
  )
  SELECT
    v_show_id,
    v_step_id,
    p_step_type,
    'held',
    'show_recipient',
    p.id,
    btrim(p.email),
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    'Entries removed at ' || coalesce(v_show_name, 'your show'),
    -- A job is one email; a change after it went out is a new job, so a new key.
    'show-lifecycle-email:' || v_show_id::text || ':' || p_step_type || ':person:' || p.id::text
      || ':' || gen_random_uuid()::text,
    now() + interval '5 minutes',
    true,
    jsonb_build_array(p_event)
  FROM public.people p
  WHERE nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL
    AND p.deleted_at IS NULL
    -- p_also_person_id: the person who acted, when they are neither (a co-owner who pulled).
    AND p.id IN (v_owner_id, v_handler_id, p_also_person_id)
  -- Another one in the same sitting: the one waiting job stays, waits again and adds the event.
  -- A job the drain has claimed is not in the index: it is frozen, and the new event becomes a
  -- job of its own.
  ON CONFLICT (show_id, recipient_person_id, step_type)
    WHERE step_type = 'pulled_out'
      AND status IN ('held', 'ready') AND claimed_until IS NULL
      AND recipient_person_id IS NOT NULL
  DO UPDATE SET
    due_at = now() + interval '5 minutes',
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name,
    entry_changes = j.entry_changes || excluded.entry_changes
  WHERE j.claimed_until IS NULL AND j.status IN ('held', 'ready');
END;
$$;

REVOKE ALL ON FUNCTION public.queue_entry_money_email(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- "You're out": the exhibitor's OWN Pull or Withdraw. entry_change_actor is MYK9-2126's rule for
-- who wrote the row: only 'exhibitor' is told. 'staff' is told by entry_changed (a Pull) or is no
-- act of hers (a removal); 'nobody' (a cron job, the service role) emails no one.
CREATE OR REPLACE FUNCTION public.queue_pulled_out_email_from_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF public.entry_change_actor(new.show_id, new.dog_id, old.handler_id) = 'exhibitor' THEN
    -- entry_change_actor counts the dog's co-owner as the exhibitor, so the person who pulled may
    -- be neither the owner nor the handler: they are told too.
    SELECT p.id INTO v_actor_id FROM public.people p WHERE p.auth_user_id = auth.uid() LIMIT 1;
    PERFORM public.queue_entry_money_email(
      new.id,
      'pulled_out',
      jsonb_build_object('kind', 'removed', 'entry_id', new.id),
      v_actor_id
    );
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Queuing an email must never block the exhibitor leaving a class.
  RAISE WARNING 'queue_pulled_out_email_from_update: % (%)', SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_pulled_out_email_from_update()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_queue_pulled_out_email ON public.entries;
CREATE TRIGGER trg_queue_pulled_out_email
  AFTER UPDATE OF entry_status ON public.entries
  FOR EACH ROW
  WHEN (
    old.entry_status IS DISTINCT FROM new.entry_status
    AND (
      new.entry_status = 'scratched'
      OR (new.entry_status = 'withdrawn' AND new.withdrawal_reason_code IS NOT NULL)
    )
  )
  EXECUTE FUNCTION public.queue_pulled_out_email_from_update();

-- Self-check, so the push fails loudly instead of leaving a CHECK that refuses an email type
-- another migration relies on: this file may be applied before or after 20261120052300.
DO $$
DECLARE
  v_table text;
  v_step text;
  v_def text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['show_lifecycle_email_steps', 'show_lifecycle_email_jobs'] LOOP
    SELECT string_agg(pg_get_constraintdef(c.oid), ' ') INTO v_def
      FROM pg_constraint c
     WHERE c.conrelid = ('public.' || v_table)::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%step_type%';
    FOREACH v_step IN ARRAY ARRAY['show_cancelled', 'pulled_out'] LOOP
      IF v_def IS NULL OR position('''' || v_step || '''' IN v_def) = 0 THEN
        RAISE EXCEPTION 'MYK9-2001: the % step_type CHECK does not accept %', v_table, v_step;
      END IF;
    END LOOP;
  END LOOP;

  IF (SELECT prosrc FROM pg_proc
       WHERE oid = 'public.ensure_show_lifecycle_email_steps(uuid)'::regprocedure)
       NOT LIKE '%''show_cancelled''%' THEN
    RAISE EXCEPTION 'MYK9-2001: ensure_show_lifecycle_email_steps does not seed show_cancelled';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
