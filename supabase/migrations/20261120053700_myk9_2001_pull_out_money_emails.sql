-- =============================================================================
-- MYK9-2001: pulling out, money. The exhibitor is told, by the server, (1) when she pulls or
-- withdraws, that the refund is waiting for the secretary, and (2) when the refund is decided,
-- what was refunded or that nothing was and why.
--
-- Plan: docs/plan-exhibitor-wait.md, "Pulling out". Nothing here issues, approves or schedules a
-- refund: a refund is never automatic. These emails REPORT what a person already did.
--
--   1. entries.refund_decision_reason: why a secretary denied a refund. Until now Deny refund
--      recorded the decision, who and when, but never why, so the outcome email could say "No
--      refund" and nothing else. set_entry_refund_decision gains a REQUIRED p_reason (blank is
--      refused with 22023); the two-argument form is dropped so no caller can deny without one.
--      Server-written only, like the rest of the decision: the restrict trigger refuses a direct
--      write and clears the reason when the row leaves the state it was decided in.
--   2. Both step_type CHECKs gain 'pulled_out' and 'refund_outcome'; each show gets a step row (a
--      job needs a step_id). Their is_enabled is not read: the secretary cannot hold a money
--      email back (docs/plan-exhibitor-wait.md, Non-goals).
--   3. Producers, both writing HELD jobs for the sender to release (the MYK9-2126 deploy rule:
--      db push, then functions deploy send-lifecycle-email; until it is deployed they wait):
--        * pulled_out: AFTER UPDATE OF entry_status when an EXHIBITOR's own write makes the entry
--          'scratched' (a Pull) or 'withdrawn' WITH a reason code (a Withdraw). A secretary's
--          Pull is told by MYK9-2126's entry_changed email and a secretary removal (withdrawn,
--          no code) is nobody's act, so neither is told here: the exhibitor is never told twice.
--        * refund_outcome: AFTER UPDATE OF refund_amount, refund_decision when a pulled or
--          withdrawn or absent entry gets a refund recorded (refund_amount from nothing to a positive
--          amount) or a denial. Whoever wrote it, including the service role that records a Stripe
--          refund: the exhibitor is told what happened to her money either way.
--      The jobs store ids only, in entry_changes ({"kind":"removed"|"refunded"|"denied",
--      "entry_id":..}); the sender renders from the entry's own recorded amounts at send time.
--      Several in one sitting are ONE email per person per show per step, due five minutes after
--      the last (the same quiet minutes show_changed and entry_changed wait). Only a published
--      show; recipients are the dog's owner and the entry's handler with an email.
--
-- Deploy order: db push, then `supabase functions deploy send-lifecycle-email`.
-- Rollback: DROP TRIGGER trg_queue_pulled_out_email, trg_queue_refund_outcome_email ON
-- public.entries; DROP FUNCTION public.queue_pulled_out_email_from_update(),
-- public.queue_refund_outcome_email_from_update(), public.queue_entry_money_email(uuid, text,
-- jsonb, uuid); DROP INDEX show_lifecycle_email_jobs_one_unsent_entry_money; delete pulled_out and
-- refund_outcome jobs and steps, restore the ten-value step_type CHECKs,
-- ensure_show_lifecycle_email_steps from 20261120052300, set_entry_refund_decision and
-- restrict_entry_refund_decision_columns from 20261117152900, then ALTER TABLE public.entries
-- DROP COLUMN refund_decision_reason.
-- =============================================================================

BEGIN;

-- 1. The reason ------------------------------------------------------------------------------

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS refund_decision_reason text;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_refund_decision_reason_check;
ALTER TABLE public.entries
  ADD CONSTRAINT entries_refund_decision_reason_check CHECK (
    refund_decision_reason IS NULL
    OR (refund_decision = 'denied' AND char_length(btrim(refund_decision_reason)) BETWEEN 1 AND 300)
  );

COMMENT ON COLUMN public.entries.refund_decision_reason IS
  'MYK9-2001: why the secretary denied the refund, in their own words (1 to 300 characters). Told to the exhibitor in the outcome email. Written only by set_entry_refund_decision; null on a denial recorded before MYK9-2001.';

-- Column privileges, stated: the decision columns are readable by signed-in users through RLS
-- and never by anon. Direct writes are refused by the restrict trigger below.
REVOKE ALL (refund_decision_reason) ON public.entries FROM PUBLIC, anon;
GRANT SELECT (refund_decision_reason) ON public.entries TO authenticated;

-- Copied from its LATEST definition (20261117152900); the reason joins the three decision columns.
CREATE OR REPLACE FUNCTION public.restrict_entry_refund_decision_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A reinstated entry needs a fresh decision if it is removed again later.
  -- This runs for every role, including service-role lifecycle mutations.
  IF TG_OP = 'UPDATE'
     AND old.entry_status IN ('scratched', 'withdrawn', 'absent')
     AND new.entry_status IS DISTINCT FROM old.entry_status THEN
    new.refund_decision := NULL;
    new.refund_decided_at := NULL;
    new.refund_decided_by := NULL;
    new.refund_decision_reason := NULL;
    RETURN new;
  END IF;

  IF current_user IN ('postgres', 'service_role') THEN
    RETURN new;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF new.refund_decision IS NOT NULL
       OR new.refund_decided_at IS NOT NULL
       OR new.refund_decided_by IS NOT NULL
       OR new.refund_decision_reason IS NOT NULL THEN
      RAISE EXCEPTION 'refund decisions are written only through set_entry_refund_decision'
        USING ERRCODE = '42501';
    END IF;

    RETURN new;
  END IF;

  IF new.refund_decision IS DISTINCT FROM old.refund_decision
     OR new.refund_decided_at IS DISTINCT FROM old.refund_decided_at
     OR new.refund_decided_by IS DISTINCT FROM old.refund_decided_by
     OR new.refund_decision_reason IS DISTINCT FROM old.refund_decision_reason THEN
    RAISE EXCEPTION 'refund decisions are written only through set_entry_refund_decision'
      USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restrict_entry_refund_decision_columns()
  FROM PUBLIC, anon, authenticated, service_role;

-- The insert-side trigger's WHEN clause names the decision columns; the reason is one of them.
DROP TRIGGER IF EXISTS trg_restrict_entry_refund_decision_columns_insert ON public.entries;
CREATE TRIGGER trg_restrict_entry_refund_decision_columns_insert
  BEFORE INSERT ON public.entries
  FOR EACH ROW
  WHEN (
    new.refund_decision IS NOT NULL
    OR new.refund_decided_at IS NOT NULL
    OR new.refund_decided_by IS NOT NULL
    OR new.refund_decision_reason IS NOT NULL
  )
  EXECUTE FUNCTION public.restrict_entry_refund_decision_columns();

-- COPIED FROM THE LATEST DEFINITION (20261117152900). Exactly two things change: the function
-- takes a REQUIRED p_reason and refuses a blank one, and it records the reason with the denial.
-- Everything else (the authorization, the paid-online eligibility, the COALESCEd status arm,
-- SECURITY DEFINER with an empty search_path, the EXECUTE grants) is unchanged. Only 'denied' is
-- accepted; nothing here moves money.
DROP FUNCTION IF EXISTS public.set_entry_refund_decision(uuid, text);

CREATE OR REPLACE FUNCTION public.set_entry_refund_decision(
  p_entry_id uuid,
  p_decision text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_club_id uuid;
  v_entry_status text;
  v_payment_method text;
  v_payment_status text;
  v_refund_amount numeric;
  v_refund_decision text;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF p_decision <> 'denied' THEN
    RAISE EXCEPTION 'unsupported refund decision: %', p_decision
      USING ERRCODE = '22023';
  END IF;

  IF v_reason = '' OR char_length(v_reason) > 300 THEN
    RAISE EXCEPTION 'a denied refund needs a reason of 1 to 300 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT e.show_id,
         s.club_id,
         e.entry_status,
         e.payment_method,
         e.payment_status,
         e.refund_amount,
         e.refund_decision
    INTO v_show_id,
         v_club_id,
         v_entry_status,
         v_payment_method,
         v_payment_status,
         v_refund_amount,
         v_refund_decision
    FROM public.entries e
    JOIN public.shows s ON s.id = e.show_id
   WHERE e.id = p_entry_id
     AND e.deleted_at IS NULL
     FOR UPDATE OF e;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry % not found', p_entry_id
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_show_secretary(v_show_id)
    OR (v_club_id IS NOT NULL AND public.is_club_admin(v_club_id))
  ) THEN
    RAISE EXCEPTION 'not authorized to decide refund for entry %', p_entry_id
      USING ERRCODE = '42501';
  END IF;

  -- Every arm COALESCEs: with a NULL the IN is NULL, `NOT NULL` is NULL and the guard would
  -- fall through and record a denial on a row it was meant to refuse.
  IF COALESCE(v_payment_method, '') <> 'online'
     OR COALESCE(v_payment_status, '') <> 'paid'
     OR COALESCE(v_refund_amount, 0) > 0
     OR COALESCE(v_entry_status, '') NOT IN ('scratched', 'withdrawn', 'absent') THEN
    RAISE EXCEPTION 'entry % is not an unresolved paid-online pull, withdrawal, removal or no-show', p_entry_id
      USING ERRCODE = '22023';
  END IF;

  -- Already denied: the first decision, and the reason the exhibitor was told, stand.
  IF v_refund_decision = 'denied' THEN
    RETURN;
  END IF;

  UPDATE public.entries
     SET refund_decision = 'denied',
         refund_decided_at = now(),
         refund_decided_by = auth.uid(),
         refund_decision_reason = v_reason,
         updated_at = now()
   WHERE id = p_entry_id;
END;
$$;

COMMENT ON FUNCTION public.set_entry_refund_decision(uuid, text, text) IS
  'MYK9-2001: records a person''s explicit "Deny refund", WITH the reason the exhibitor is told, for a paid-online entry that stopped running with no refund and no decision: a pull (scratched), a withdrawal or secretary removal (withdrawn), or a no-show (absent). A successful Stripe refund is already authoritative via refund_amount / refunded_at, so only the denial needs a durable decision. Nothing here moves money.';

REVOKE EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text, text)
  TO authenticated, service_role;

-- 2. The two steps ------------------------------------------------------------------------------

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
      'pulled_out',
      'refund_outcome'
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
      'pulled_out',
      'refund_outcome'
    )
  );

-- Copied from its LATEST definition (20261120052300, MYK9-2127), plus the eleventh and twelfth
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
    (p_show_id, 'pulled_out', true),
    (p_show_id, 'refund_outcome', true)
  ON CONFLICT (show_id, step_type) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.ensure_show_lifecycle_email_steps(uuid) FROM PUBLIC, anon, authenticated;

SELECT public.ensure_show_lifecycle_email_steps(s.id) FROM public.shows s;

-- 3. Producers ---------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS show_lifecycle_email_jobs_one_unsent_entry_money
  ON public.show_lifecycle_email_jobs (show_id, recipient_person_id, step_type)
  WHERE step_type IN ('pulled_out', 'refund_outcome')
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
  IF p_step_type NOT IN ('pulled_out', 'refund_outcome') THEN
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
    CASE p_step_type
      WHEN 'pulled_out' THEN 'You are out of ' || coalesce(v_show_name, 'your show')
      ELSE 'Your refund for ' || coalesce(v_show_name, 'your show')
    END,
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
    WHERE step_type IN ('pulled_out', 'refund_outcome')
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

-- "The outcome": a refund recorded, or a refund denied, on a pulled, withdrawn or absent entry.
CREATE OR REPLACE FUNCTION public.queue_refund_outcome_email_from_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Every removal the secretary can reconcile: exactly what set_entry_refund_decision accepts (a
  -- pull, a withdrawal or secretary removal, a no-show), so the dialog's promise of an email holds.
  IF new.entry_status IN ('scratched', 'withdrawn', 'absent') THEN
    IF coalesce(old.refund_amount, 0) <= 0 AND coalesce(new.refund_amount, 0) > 0 THEN
      PERFORM public.queue_entry_money_email(
        new.id,
        'refund_outcome',
        jsonb_build_object('kind', 'refunded', 'entry_id', new.id)
      );
    ELSIF old.refund_decision IS DISTINCT FROM 'denied' AND new.refund_decision = 'denied' THEN
      PERFORM public.queue_entry_money_email(
        new.id,
        'refund_outcome',
        jsonb_build_object('kind', 'denied', 'entry_id', new.id)
      );
    END IF;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'queue_refund_outcome_email_from_update: % (%)', SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_refund_outcome_email_from_update()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_queue_refund_outcome_email ON public.entries;
CREATE TRIGGER trg_queue_refund_outcome_email
  AFTER UPDATE OF refund_amount, refund_decision ON public.entries
  FOR EACH ROW
  WHEN (
    old.refund_amount IS DISTINCT FROM new.refund_amount
    OR old.refund_decision IS DISTINCT FROM new.refund_decision
  )
  EXECUTE FUNCTION public.queue_refund_outcome_email_from_update();

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
    FOREACH v_step IN ARRAY ARRAY['show_cancelled', 'pulled_out', 'refund_outcome'] LOOP
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
