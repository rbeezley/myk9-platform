-- MYK9-2347: a show or judge edit while a ready job is leased by the email drain queues a
-- job of its own, instead of overwriting the row that is being sent.
--
-- show_changed (MYK9-2124) and judge_changed (MYK9-2125) kept one ready job per
-- (show, person) through a partial unique index that ignored claimed_until, and their
-- ON CONFLICT ... DO UPDATE had no lease guard. The drain leases a job by setting
-- claimed_until while status is still 'ready'; an edit in that window merged into the
-- in-flight row, and when the send finished and marked the row 'sent' the newer change was
-- lost. entry_changed (20261119045700), substitute_judge (20261119043500) and pull_out_money
-- (20261120053700) already guard on claimed_until IS NULL; this backports the same rule:
--   1. the partial unique indexes only cover unleased ready rows, so a leased row is not a
--      conflict and the new edit inserts a second ready row;
--   2. the DO UPDATE re-checks the lock-time row (WHERE j.claimed_until IS NULL) for the race
--      where the lease lands between the index probe and the row lock.
--
-- The two producer bodies are copied from their latest definition (20261117094700 and
-- 20261117191300; no later migration replaces them), changing only the above.
-- A function replace keeps the existing grants; the REVOKEs are repeated anyway.
--
-- Rollback: first drain or merge any duplicate ready jobs per (show_id, recipient_person_id,
-- step_type) (a leased job plus its follow-up is a legal pair now, and would make the old
-- unique index fail to build), then recreate both indexes without "AND claimed_until IS NULL"
-- and re-run the two producer bodies from their original migrations.

DROP INDEX IF EXISTS public.show_lifecycle_email_jobs_one_ready_show_changed;
CREATE UNIQUE INDEX show_lifecycle_email_jobs_one_ready_show_changed
  ON public.show_lifecycle_email_jobs (show_id, recipient_person_id)
  WHERE step_type = 'show_changed' AND status = 'ready' AND claimed_until IS NULL
    AND recipient_person_id IS NOT NULL;

DROP INDEX IF EXISTS public.show_lifecycle_email_jobs_one_ready_judge_changed;
CREATE UNIQUE INDEX show_lifecycle_email_jobs_one_ready_judge_changed
  ON public.show_lifecycle_email_jobs (show_id, recipient_person_id)
  WHERE step_type = 'judge_changed' AND status = 'ready' AND claimed_until IS NULL
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
  -- Another edit in the same sitting: the one waiting job stays and waits again. A job the
  -- drain has leased (claimed_until set) is not in the index: it is in flight, so the new edit
  -- becomes a job of its own instead of mutating the row the drain is sending.
  ON CONFLICT (show_id, recipient_person_id)
    WHERE step_type = 'show_changed' AND status = 'ready' AND claimed_until IS NULL
      AND recipient_person_id IS NOT NULL
  DO UPDATE SET
    due_at = now() + interval '5 minutes',
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name
  -- The conflict is found through the index, but the row is re-read after its lock: if the
  -- drain leased it in that instant, leave the in-flight job alone (the entry_changed rule).
  WHERE j.claimed_until IS NULL AND j.status = 'ready';
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
  -- before the FIRST change. A job the drain has leased (claimed_until set) is not in the
  -- index: it is in flight, so the new edit becomes a job of its own.
  ON CONFLICT (show_id, recipient_person_id)
    WHERE step_type = 'judge_changed' AND status = 'ready' AND claimed_until IS NULL
      AND recipient_person_id IS NOT NULL
  DO UPDATE SET
    due_at = now() + interval '5 minutes',
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name,
    judge_changes = excluded.judge_changes || j.judge_changes
  -- The conflict is found through the index, but the row is re-read after its lock: if the
  -- drain leased it in that instant, leave the in-flight job alone (the entry_changed rule).
  WHERE j.claimed_until IS NULL AND j.status = 'ready';
END;
$$;

REVOKE ALL ON FUNCTION public.queue_judge_changed_email_for_class(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
