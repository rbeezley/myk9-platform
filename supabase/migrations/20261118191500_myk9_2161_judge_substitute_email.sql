-- =============================================================================
-- MYK9-2161: tell exhibitors who the substitute is, once a vacant class gets a new judge.
-- Follows MYK9-2125 (judge_changed jobs). When a judge left and the class had no confirmed
-- replacement at send time, the email said "A new judge for <class> has not been named yet".
-- Nothing followed once a substitute was confirmed.
--
--   1. public.judge_vacancy_notices: one row per (class, person) who is being told "not named
--      yet". Written by claim_due_auto_email_jobs IN THE SAME STATEMENT (so the same
--      transaction) that claims the job, so it exists BEFORE the first delivery attempt and
--      survives a failed, reconciled or interrupted send. The row keeps the judge the person
--      first knew (from_person_id), so the follow-up reads "was X, now Y".
--   2. claim_due_auto_email_jobs (copied from its latest definition, 20261117094700) gains a
--      data-modifying CTE that writes those rows for claimed judge_changed jobs: the class has
--      no confirmed class-level judge now, the person still has a live entry in it, and the
--      trial day is not past (the same three tests the sender uses to say "not named yet").
--   3. queue_judge_changed_email_for_class gains an inner twin that can be limited to named
--      people; the original two-argument function stays as a wrapper with the same ACL.
--   4. An AFTER INSERT / UPDATE trigger on a confirmed class-level judge_assignments row
--      consumes the class's rows and queues one judge_changed job per recorded person, through
--      the same producer (published show, step on, one ready job per person, merged). A class
--      with no row (it never had a judge, or nobody was told "not named yet") queues nothing.
--      The old judge coming back queues nothing: the sender would skip it as "not news".
--
-- Rollback: DROP TRIGGER trg_queue_judge_substitute_email_insert and
-- trg_queue_judge_substitute_email_update ON public.judge_assignments; DROP FUNCTION
-- public.queue_judge_substitute_emails_from_assignment(),
-- public.queue_judge_changed_email_for_people(uuid, uuid, uuid[]); restore
-- queue_judge_changed_email_for_class from 20261117191300 and claim_due_auto_email_jobs from
-- 20261117094700; DROP TABLE public.judge_vacancy_notices.
-- =============================================================================

BEGIN;

-- No foreign keys on purpose: hard_delete_show refuses to run when a foreign key into shows
-- or classes is not in its reviewed manifest, and a row here is transient (consumed by the
-- next confirmed judge, ignored once its class or show is gone: the claim and the producer
-- both check the class and show are live).
CREATE TABLE IF NOT EXISTS public.judge_vacancy_notices (
  class_id uuid NOT NULL,
  person_id uuid NOT NULL,
  from_person_id uuid NOT NULL,
  show_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, person_id)
);

COMMENT ON TABLE public.judge_vacancy_notices IS
  'MYK9-2161: people told by a judge_changed email that a class has no judge named yet. Consumed (deleted) when a substitute is confirmed, which queues the follow-up email. Server-only.';

ALTER TABLE public.judge_vacancy_notices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.judge_vacancy_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.judge_vacancy_notices TO service_role;

-- The claim, as 20261117094700 defined it, plus the vacancy rows. A data-modifying CTE runs
-- to completion even though the final SELECT does not read it, and in the same statement as
-- the claim UPDATE, so a claimed job always has its rows.
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
  ),
  claimed AS (
    UPDATE public.show_lifecycle_email_jobs j
       SET attempt_id = gen_random_uuid(),
           claimed_until = p_lease_until
      FROM due
     WHERE j.id = due.id
       AND p_lease_until > now()
    RETURNING j.id AS id, j.attempt_id AS attempt_id, j.show_id AS show_id,
              j.step_type AS step_type, j.recipient_person_id AS recipient_person_id,
              j.recipient_email AS recipient_email, j.recipient_name AS recipient_name,
              j.idempotency_key AS idempotency_key, j.due_at AS due_at,
              j.judge_changes AS judge_changes
  ),
  vacancies AS (
    INSERT INTO public.judge_vacancy_notices (class_id, person_id, from_person_id, show_id)
    SELECT cls.class_id, c.recipient_person_id, cls.from_person_id, c.show_id
      FROM claimed c
     CROSS JOIN LATERAL (
       SELECT e.key::uuid AS class_id, e.value::uuid AS from_person_id
         FROM jsonb_each_text(c.judge_changes) AS e
     ) AS cls
      JOIN public.classes k ON k.id = cls.class_id AND k.deleted_at IS NULL
      JOIN public.trials t ON t.id = k.trial_id AND t.deleted_at IS NULL AND t.show_id = c.show_id
     WHERE c.step_type = 'judge_changed'
       AND c.recipient_person_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.judge_assignments ja
          WHERE ja.class_id = cls.class_id
            AND ja.status = 'confirmed'
       )
       -- The sender tells nobody about a class whose trial day is past.
       AND t.date >= (
         now() AT TIME ZONE coalesce(
           (SELECT z.name FROM public.timezone_names z WHERE z.name = t.timezone),
           'America/New_York'
         )
       )::date
       AND EXISTS (
         SELECT 1
           FROM public.live_entry_person_class_pairs(c.show_id) AS pairs
          WHERE pairs.person_id = c.recipient_person_id
            AND pairs.class_id = cls.class_id
       )
    ON CONFLICT (class_id, person_id) DO NOTHING
    RETURNING 1
  )
  SELECT c.id, c.attempt_id, c.show_id, c.step_type, c.recipient_person_id,
         c.recipient_email, c.recipient_name, c.idempotency_key, c.due_at
    FROM claimed c;
$$;

REVOKE ALL ON FUNCTION public.claim_due_auto_email_jobs(integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_auto_email_jobs(integer, timestamptz)
  TO service_role;

-- The producer from 20261117191300, now with an optional list of people to limit it to.
CREATE OR REPLACE FUNCTION public.queue_judge_changed_email_for_people(
  p_class_id uuid,
  p_from_person_id uuid,
  p_person_ids uuid[]
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
    AND (p_person_ids IS NULL OR p.id = ANY (p_person_ids))
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

REVOKE ALL ON FUNCTION public.queue_judge_changed_email_for_people(uuid, uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;

-- The MYK9-2125 entry point: everyone with a live entry in the class.
CREATE OR REPLACE FUNCTION public.queue_judge_changed_email_for_class(
  p_class_id uuid,
  p_from_person_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.queue_judge_changed_email_for_people(p_class_id, p_from_person_id, NULL);
$$;

REVOKE ALL ON FUNCTION public.queue_judge_changed_email_for_class(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- A substitute is confirmed: queue the follow-up for everyone who was told "not named yet".
CREATE OR REPLACE FUNCTION public.queue_judge_substitute_emails_from_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group record;
BEGIN
  IF new.class_id IS NULL OR new.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NULL;
  END IF;

  -- Consume the rows in this statement's transaction: if queuing fails below, the
  -- exception handler rolls the delete back with it and the rows stay for the next try.
  FOR v_group IN
    WITH gone AS (
      DELETE FROM public.judge_vacancy_notices n
       WHERE n.class_id = new.class_id
      RETURNING n.person_id, n.from_person_id
    )
    SELECT gone.from_person_id, array_agg(gone.person_id) AS person_ids
      FROM gone
     GROUP BY gone.from_person_id
  LOOP
    -- The old judge coming back is not news.
    IF v_group.from_person_id IS DISTINCT FROM new.person_id THEN
      PERFORM public.queue_judge_changed_email_for_people(
        new.class_id, v_group.from_person_id, v_group.person_ids
      );
    END IF;
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Queuing an email must never block the edit.
  RAISE WARNING 'queue_judge_substitute_emails_from_assignment: % (%)', SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_judge_substitute_emails_from_assignment()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_queue_judge_substitute_email_insert ON public.judge_assignments;
CREATE TRIGGER trg_queue_judge_substitute_email_insert
  AFTER INSERT ON public.judge_assignments
  FOR EACH ROW
  WHEN (new.class_id IS NOT NULL AND new.status = 'confirmed')
  EXECUTE FUNCTION public.queue_judge_substitute_emails_from_assignment();

DROP TRIGGER IF EXISTS trg_queue_judge_substitute_email_update ON public.judge_assignments;
CREATE TRIGGER trg_queue_judge_substitute_email_update
  AFTER UPDATE OF person_id, status, class_id ON public.judge_assignments
  FOR EACH ROW
  WHEN (
    new.class_id IS NOT NULL
    AND new.status = 'confirmed'
    AND (
      old.status IS DISTINCT FROM 'confirmed'
      OR old.class_id IS DISTINCT FROM new.class_id
      OR old.person_id IS DISTINCT FROM new.person_id
    )
  )
  EXECUTE FUNCTION public.queue_judge_substitute_emails_from_assignment();

COMMIT;
