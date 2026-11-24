-- MYK9-2347: the show_changed and judge_changed producers must not rewrite a job the email drain
-- is sending right now.
--
-- The one-waiting-job unique indexes of MYK9-2124 and MYK9-2125 did not exclude a job in flight, so an
-- edit that arrived while the drain was sending found that row as its conflict and its DO UPDATE
-- rewrote the in-flight job (due_at, recipient, judge_changes). The send then finished and marked the
-- row sent, and the newer edit was never emailed. The entry_changed, substitute_judge and
-- pull_out_money producers already keep an in-flight job out of the index; this backports that rule
-- with a sharper test of "in flight":
--
--   * claim_due_auto_email_jobs sets attempt_id and a lease (claimed_until). A send that finishes
--     clears both; releaseLease (the retry-delay hold in lifecycle-email-autoSend.ts) clears
--     attempt_id and leaves a FUTURE claimed_until. So a job in its retry hold has attempt_id NULL:
--     nothing is sending it, and an edit must merge into it (one email, current judge_changes).
--   * The indexes therefore exclude only attempt_id IS NOT NULL. A time test cannot be in an index,
--     so a job whose lease has EXPIRED (an abandoned attempt, attempt_id still set) is released by
--     each producer just before it inserts (attempt_id and claimed_until cleared), which puts it back
--     in the index to be merged into. The abandoned attempt's late outcome fails its attempt_id
--     compare-and-set and changes nothing, exactly as when the drain re-claims it.
--   * Each DO UPDATE re-checks attempt_id after the row lock (the drain may claim it in that instant).
--   * queue_substitute_judge_emails (MYK9-2161) also targets the judge_changed index; its predicate
--     changes with it and its skip guard counts only a job with a live attempt, as the index does.
-- Rollback: recreate the two indexes without attempt_id and restore the three function bodies
-- from 20261117094700, 20261117191300 and 20261119043500.

DROP INDEX IF EXISTS public.show_lifecycle_email_jobs_one_ready_show_changed;
CREATE UNIQUE INDEX show_lifecycle_email_jobs_one_ready_show_changed
  ON public.show_lifecycle_email_jobs (show_id, recipient_person_id)
  WHERE step_type = 'show_changed' AND status = 'ready' AND attempt_id IS NULL
    AND recipient_person_id IS NOT NULL;

DROP INDEX IF EXISTS public.show_lifecycle_email_jobs_one_ready_judge_changed;
CREATE UNIQUE INDEX show_lifecycle_email_jobs_one_ready_judge_changed
  ON public.show_lifecycle_email_jobs (show_id, recipient_person_id)
  WHERE step_type = 'judge_changed' AND status = 'ready' AND attempt_id IS NULL
    AND recipient_person_id IS NOT NULL;

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

  -- An abandoned attempt (lease expired) is released so it can be merged into, not duplicated.
  UPDATE public.show_lifecycle_email_jobs
     SET attempt_id = NULL, claimed_until = NULL
   WHERE show_id = p_show_id AND step_type = 'show_changed' AND status = 'ready'
     AND attempt_id IS NOT NULL AND claimed_until <= now();

  INSERT INTO public.show_lifecycle_email_jobs AS j (
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
  -- Another edit in the same sitting: the one waiting job stays and waits again (also one in its
  -- retry hold). A job the drain is sending right now is not in the index: it is frozen, and the
  -- new edit becomes a job of its own.
  ON CONFLICT (show_id, recipient_person_id)
    WHERE step_type = 'show_changed' AND status = 'ready' AND attempt_id IS NULL
      AND recipient_person_id IS NOT NULL
  DO UPDATE SET
    due_at = now() + interval '5 minutes',
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name
  -- The conflict is found through the index, but the row is re-read after its lock: if the
  -- drain claimed it in that instant, leave the frozen job alone.
  WHERE j.attempt_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_show_changed_email_for_show(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

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

  -- An abandoned attempt (lease expired) is released so it can be merged into, not duplicated.
  UPDATE public.show_lifecycle_email_jobs
     SET attempt_id = NULL, claimed_until = NULL
   WHERE show_id = v_show_id AND step_type = 'judge_changed' AND status = 'ready'
     AND attempt_id IS NOT NULL AND claimed_until <= now();

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
  -- before the FIRST change. A job the drain is sending right now is not in the index: it is frozen
  -- (it plans its email from judge_changes at claim time), and the new edit becomes a job of its own.
  ON CONFLICT (show_id, recipient_person_id)
    WHERE step_type = 'judge_changed' AND status = 'ready' AND attempt_id IS NULL
      AND recipient_person_id IS NOT NULL
  DO UPDATE SET
    due_at = now() + interval '5 minutes',
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name,
    judge_changes = excluded.judge_changes || j.judge_changes
  -- The conflict is found through the index, but the row is re-read after its lock: if the
  -- drain claimed it in that instant, leave the frozen job alone.
  WHERE j.attempt_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_judge_changed_email_for_class(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.queue_substitute_judge_emails(p_class_id uuid, p_judge_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid := public.substitute_judge_email_show(p_class_id);
  v_target uuid;
  v_show_name text;
  v_step_id uuid;
  v_from uuid;
  v_wanted integer;
  v_count integer;
BEGIN
  -- A double tap waits here; the second finds the offer already resolved.
  PERFORM pg_advisory_xact_lock(hashtextextended('queue_substitute_judge_emails:' || p_class_id::text, 0));

  -- Already sent or dismissed for this very judge (a second tap, a second secretary): nothing to do.
  IF EXISTS (
    SELECT 1
      FROM public.class_judge_departures d
      JOIN public.judge_assignments ja ON ja.class_id = d.class_id AND ja.status = 'confirmed'
                                       AND ja.person_id = p_judge_id
     WHERE d.class_id = p_class_id AND d.resolved_judge_id = p_judge_id
  ) THEN
    RETURN 0;
  END IF;

  v_target := public.substitute_judge_email_target(p_class_id, v_show_id);
  IF v_target IS NULL OR v_target IS DISTINCT FROM p_judge_id THEN
    -- Nothing to send, or the class has another judge than the one on the secretary's screen.
    RAISE EXCEPTION 'The judge for this class changed. Check again.' USING ERRCODE = 'P0001';
  END IF;

  IF public.substitute_judge_email_one_step(p_class_id) THEN
    -- The automatic notice already told everyone "was A, now B".
    UPDATE public.class_judge_departures SET resolved_judge_id = p_judge_id WHERE class_id = p_class_id;
    RETURN 0;
  END IF;

  SELECT sh.name, s.id INTO v_show_name, v_step_id
    FROM public.shows sh
    JOIN public.show_lifecycle_email_steps s
      ON s.show_id = sh.id AND s.step_type = 'judge_changed' AND s.is_enabled
   WHERE sh.id = v_show_id;
  SELECT d.left_person_id INTO v_from FROM public.class_judge_departures d WHERE d.class_id = p_class_id;

  SELECT count(*) INTO v_wanted FROM public.substitute_judge_email_recipients(p_class_id, v_show_id);
  IF v_wanted = 0 THEN
    -- An earlier tap queued everyone: the offer is done.
    UPDATE public.class_judge_departures SET resolved_judge_id = p_judge_id WHERE class_id = p_class_id;
    RETURN 0;
  END IF;

  -- An abandoned attempt (lease expired) is released so it can be merged into, not duplicated.
  UPDATE public.show_lifecycle_email_jobs
     SET attempt_id = NULL, claimed_until = NULL
   WHERE show_id = v_show_id AND step_type = 'judge_changed' AND status = 'ready'
     AND attempt_id IS NOT NULL AND claimed_until <= now();

  WITH ins AS (
  INSERT INTO public.show_lifecycle_email_jobs AS j (
    show_id, step_id, step_type, status, recipient_scope, recipient_person_id,
    recipient_email, recipient_name, subject, idempotency_key, due_at, auto_send,
    judge_changes
  )
  SELECT
    v_show_id, v_step_id, 'judge_changed', 'ready', 'show_recipient', p.id,
    btrim(p.email),
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    'Judge change for ' || coalesce(v_show_name, 'your show'),
    'show-lifecycle-email:' || v_show_id::text || ':judge_changed:person:' || p.id::text
      || ':' || gen_random_uuid()::text,
    now() + interval '5 minutes',
    true,
    jsonb_build_object(p_class_id::text, v_from::text)
  FROM public.people p
  WHERE p.id IN (SELECT r.person_id FROM public.substitute_judge_email_recipients(p_class_id, v_show_id) r)
    -- A person whose waiting judge email is being sent right now (a live attempt; an expired one
    -- was released above) is skipped: with that job outside the unique index a new one would be a
    -- second email, and the offer stays up for another tap. A retry hold is merged into.
    AND NOT EXISTS (
      SELECT 1 FROM public.show_lifecycle_email_jobs lj
       WHERE lj.show_id = v_show_id AND lj.step_type = 'judge_changed' AND lj.status = 'ready'
         AND lj.recipient_person_id = p.id AND lj.attempt_id IS NOT NULL AND lj.claimed_until > now()
    )
  ON CONFLICT (show_id, recipient_person_id)
    WHERE step_type = 'judge_changed' AND status = 'ready' AND attempt_id IS NULL
      AND recipient_person_id IS NOT NULL
  DO UPDATE SET
    due_at = now() + interval '5 minutes',
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name,
    -- The earliest "was" for a class already on the waiting job stays.
    judge_changes = excluded.judge_changes || j.judge_changes
  -- Never change a job the sender is sending: it plans its email from judge_changes at claim time
  -- and, once the provider took it, only records it as sent.
  WHERE j.attempt_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.show_lifecycle_email_attempts att
       WHERE att.job_id = j.id AND att.resend_message_id IS NOT NULL
    )
  RETURNING j.recipient_person_id
  ), queued AS (
    SELECT coalesce(array_agg(ins.recipient_person_id), '{}'::uuid[]) AS ids FROM ins
  )
  -- Only people whose job was really inserted or merged are recorded: a leased one stays offered.
  UPDATE public.class_judge_departures d
     SET notified_person_ids = d.notified_person_ids || queued.ids
    FROM queued
   WHERE d.class_id = p_class_id
  RETURNING cardinality(queued.ids) INTO v_count;

  -- Everyone covered: the offer is done. Someone skipped because their email is going out right now:
  -- it stays up for another tap.
  IF v_count >= v_wanted THEN
    UPDATE public.class_judge_departures SET resolved_judge_id = p_judge_id WHERE class_id = p_class_id;
  END IF;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_substitute_judge_emails(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_substitute_judge_emails(uuid, uuid) TO authenticated;
