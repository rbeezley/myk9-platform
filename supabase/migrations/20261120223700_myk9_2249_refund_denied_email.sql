-- =============================================================================
-- MYK9-2249 (B-lite, owner decision 2026-11-19): a denied refund gets a reason and an email.
--
-- Plan: docs/plan-refund-outcome-email.md. When the secretary denies a refund she types a reason;
-- the dog's OWNER and the entry's HANDLER (one email if they are the same person, never the
-- person who denies) are told "No refund for <dog> in <class>." and her reason. The email names no
-- amount, no date and no payout. NOTHING here issues, approves or schedules a refund: a denial
-- only records a person's decision, and the email REPORTS it.
--
--   1. entries.refund_decision_reason, with a CHECK written as explicit booleans (a CHECK that
--      evaluates to NULL passes, so a bare `decision = 'denied'` would let a reason through with no
--      decision). Blank means only spaces, tabs and newlines: plain btrim() strips spaces alone.
--      Legacy denials keep a NULL reason: nothing is invented and nothing is emailed.
--      Column grants: authenticated SELECT like refund_decision; anon gets nothing.
--   2. restrict_entry_refund_decision_columns, copied from its LATEST definition (20261117152900),
--      guards the reason like the decision and clears it whenever it clears the decision.
--   3. set_entry_refund_decision(uuid, text, text), copied from the latest two-argument version
--      (20261117152900): a denial needs a non-blank reason, and queues the email. The two-argument
--      version STAYS (Show Desk tabs left open across the deploy still call it); a follow-up
--      migration drops it.
--   4. Both step_type CHECKs and ensure_show_lifecycle_email_steps gain 'refund_denied'. Every
--      step type on main is listed (copied from 20261120053700).
--   5. queue_refund_denied_email: held jobs for the sender to release (deploy rule: db push, then
--      `supabase functions deploy send-lifecycle-email --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`; until then they wait).
--      A denial is allowed on a COMPLETED show too: refunds are decided after closeout.
--
-- Deploy order: db push, then `supabase functions deploy send-lifecycle-email --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`.
-- Rollback: drop the 3-argument function and queue_refund_denied_email; delete refund_denied jobs
-- and steps; restore the eleven-value step_type CHECKs and ensure_show_lifecycle_email_steps from
-- 20261120053700; restore restrict_entry_refund_decision_columns from 20261117152900; drop the
-- CHECK and the column.
-- =============================================================================

BEGIN;

-- 1. The reason -------------------------------------------------------------------------------

ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS refund_decision_reason text;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_refund_decision_reason_check CHECK (
    refund_decision_reason IS NULL
    OR (
      refund_decision IS NOT DISTINCT FROM 'denied'
      AND btrim(refund_decision_reason, E' \t\r\n') <> ''
    )
  );

COMMENT ON COLUMN public.entries.refund_decision_reason IS
  'MYK9-2249: why the secretary denied the refund, in her words; emailed to the owner and handler. '
  'NULL for a denial recorded before this column existed. Written only by set_entry_refund_decision.';

REVOKE ALL (refund_decision_reason) ON public.entries FROM PUBLIC, anon;
GRANT SELECT (refund_decision_reason) ON public.entries TO authenticated;

-- 2. The guard ---------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restrict_entry_refund_decision_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A reinstated entry needs a fresh decision if it is removed again later.
  -- This runs for every role, including service-role lifecycle mutations.
  -- MYK9-632: both removal states, and any move BETWEEN them. MYK9-2099: a
  -- no-show too, since it can now carry a decision. MYK9-2249: the reason goes with it.
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

-- The insert trigger only fires when a decision column is set; the reason joins them.
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

-- 4. The step ----------------------------------------------------------------------------------

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
      RAISE EXCEPTION 'MYK9-2249: expected to drop exactly one step_type CHECK on %, dropped %',
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
      'refund_denied'
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
      'refund_denied'
    )
  );

-- Copied from its LATEST definition (20261120053700, MYK9-2001), plus the twelfth step.
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
    (p_show_id, 'refund_denied', true)
  ON CONFLICT (show_id, step_type) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.ensure_show_lifecycle_email_steps(uuid) FROM PUBLIC, anon, authenticated;

SELECT public.ensure_show_lifecycle_email_steps(s.id) FROM public.shows s;

-- 5. Producer ----------------------------------------------------------------------------------

-- The denial of p_entry_id was just recorded. One held job per recipient: the dog's owner and the
-- entry's handler (one job when they are the same person), never p_caller_auth_id's own person
-- (the person who denied). The job stores ids only; the sender renders the dog, the class and
-- the reason from the entry at send time, only while the denial named in the job still stands. Not callable by an API role.
CREATE OR REPLACE FUNCTION public.queue_refund_denied_email(
  p_entry_id uuid,
  p_caller_auth_id uuid
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
  v_decided_at timestamptz;
  v_step_id uuid;
BEGIN
  SELECT e.show_id, sh.name, sh.status, d.owner_id, e.handler_id, e.refund_decided_at
    INTO v_show_id, v_show_name, v_status, v_owner_id, v_handler_id, v_decided_at
    FROM public.entries e
    JOIN public.dogs d ON d.id = e.dog_id
    JOIN public.shows sh ON sh.id = e.show_id AND sh.deleted_at IS NULL
   WHERE e.id = p_entry_id;

  IF v_show_id IS NULL THEN
    RETURN;
  END IF;

  -- A published show, or a completed one: refunds are decided after closeout. A draft is still
  -- being set up and a cancelled show has its own email.
  IF v_status IS NULL OR v_status NOT IN ('published', 'upcoming', 'in_progress', 'completed') THEN
    RETURN;
  END IF;

  SELECT s.id INTO v_step_id
    FROM public.show_lifecycle_email_steps s
   WHERE s.show_id = v_show_id AND s.step_type = 'refund_denied';
  IF v_step_id IS NULL THEN
    PERFORM public.ensure_show_lifecycle_email_steps(v_show_id);
    SELECT s.id INTO v_step_id
      FROM public.show_lifecycle_email_steps s
     WHERE s.show_id = v_show_id AND s.step_type = 'refund_denied';
  END IF;

  INSERT INTO public.show_lifecycle_email_jobs (
    show_id, step_id, step_type, status, recipient_scope, recipient_person_id,
    recipient_email, recipient_name, subject, idempotency_key, due_at, auto_send,
    entry_changes
  )
  SELECT
    v_show_id,
    v_step_id,
    'refund_denied',
    'held',
    'show_recipient',
    p.id,
    btrim(p.email),
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    'Refund decision at ' || coalesce(v_show_name, 'your show'),
    'show-lifecycle-email:' || v_show_id::text || ':refund_denied:person:' || p.id::text
      || ':' || gen_random_uuid()::text,
    now(),
    true,
    -- decided_at ties the job to THIS denial: a reinstated and re-denied entry has a new one,
    -- and the sender skips a job whose denial is no longer the current one.
    jsonb_build_array(jsonb_build_object(
      'kind', 'refund_denied', 'entry_id', p_entry_id, 'decided_at', v_decided_at
    ))
  FROM public.people p
  WHERE nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL
    AND p.deleted_at IS NULL
    AND p.id IN (v_owner_id, v_handler_id)
    -- Never the person who denied, even when they own or handle the dog.
    AND (p_caller_auth_id IS NULL OR p.auth_user_id IS DISTINCT FROM p_caller_auth_id);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_refund_denied_email(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- 3. The RPC -----------------------------------------------------------------------------------

-- Body copied from set_entry_refund_decision(uuid, text) in 20261117152900. Added: p_reason, and
-- the email. Nothing here moves money.
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
  v_reason text := btrim(coalesce(p_reason, ''), E' \t\r\n');
BEGIN
  IF p_decision <> 'denied' THEN
    RAISE EXCEPTION 'unsupported refund decision: %', p_decision
      USING ERRCODE = '22023';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'a denied refund needs a reason'
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

  -- The status arm mirrors `refundToDecideRemoval` EXACTLY (see 20261117152900); every arm
  -- COALESCEs because three-valued logic fails OPEN here.
  IF COALESCE(v_payment_method, '') <> 'online'
     OR COALESCE(v_payment_status, '') <> 'paid'
     OR COALESCE(v_refund_amount, 0) > 0
     OR COALESCE(v_entry_status, '') NOT IN ('scratched', 'withdrawn', 'absent') THEN
    RAISE EXCEPTION 'entry % is not an unresolved paid-online pull, withdrawal, removal or no-show', p_entry_id
      USING ERRCODE = '22023';
  END IF;

  -- Already denied (a double click, a second tab): the first denial and its email stand.
  IF v_refund_decision = 'denied' THEN
    RETURN;
  END IF;

  UPDATE public.entries
     SET refund_decision = 'denied',
         refund_decision_reason = v_reason,
         refund_decided_at = now(),
         refund_decided_by = auth.uid(),
         updated_at = now()
   WHERE id = p_entry_id;

  -- Telling the exhibitor must never block recording the decision.
  BEGIN
    PERFORM public.queue_refund_denied_email(p_entry_id, auth.uid());
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'set_entry_refund_decision: could not queue the denial email: % (%)',
      SQLERRM, SQLSTATE;
  END;
END;
$$;

COMMENT ON FUNCTION public.set_entry_refund_decision(uuid, text, text) IS
  'MYK9-2249: records a person''s explicit "Deny refund" WITH the reason she typed (required, '
  'non-blank) and queues one held refund_denied email each for the dog''s owner and the entry''s '
  'handler (never the caller). Same eligibility as the two-argument version, which stays until '
  'a follow-up drops it. Moves no money.';

REVOKE EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text, text)
  TO authenticated, service_role;

-- Self-check: the push fails loudly rather than leaving a CHECK that refuses a step another
-- migration relies on.
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
    FOREACH v_step IN ARRAY ARRAY['show_cancelled', 'pulled_out', 'refund_denied'] LOOP
      IF v_def IS NULL OR position('''' || v_step || '''' IN v_def) = 0 THEN
        RAISE EXCEPTION 'MYK9-2249: the % step_type CHECK does not accept %', v_table, v_step;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
