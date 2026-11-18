-- =============================================================================
-- MYK9-2161: when a judge leaves a class and no replacement is confirmed by the time the
-- MYK9-2125 judge_changed email goes out, the email says "A new judge for <class> has not
-- been named yet. The trial secretary will tell you who it is." Nothing followed up once a
-- substitute was confirmed. Owner decision (2026-11-17, option 1): an explicit secretary
-- action, never an automatic trigger. When a substitute is confirmed for such a class the
-- class panel offers "Email the N exhibitors who were told no judge yet"; the tap queues the
-- existing judge_changed job for exactly those people.
--
-- Who was told "not named yet". The sender records it: when it plans a judge_changed email it
-- writes class_notices = { class id: 'unnamed' | 'named' } to show_lifecycle_email_jobs, one key for
-- each class the email actually talks about (not the candidates in judge_changes that the plan left
-- out), BEFORE it delivers, so an interrupted send that a later drain only finishes keeps it. A job
-- with no record (NULL) is unknown: an email the old sender delivered, or one it delivers before the
-- edge function is redeployed. For those the saved rendered_body says what was sent (the class name,
-- and the "has not been named yet" sentence); no body, no evidence, nobody is offered. Judge history
-- is never consulted: a judge who was named and later replaced must not turn an old email into a
-- vacancy notice.
-- A person was told when their LATEST sent judge_changed email that talks about the class called it
-- "not named yet" (a later email that named a judge supersedes it). They still need a live entry in
-- the class, an email, and a trial day that is not past (the sender's own rule for a vacancy). A person
-- whose "was" judge is the current judge (the original judge came back) is not offered: the sender
-- skips that email as "not news".
--
-- Follow-up state, with no new table: the tap records, on the job it queues or merges into,
-- substitute_followups = { class id: when }. A person is "pending" until they have a follow-up: a
-- ready judge_changed job covering the class (the tap's, a bundled waiting job, or the 2125
-- trigger's), a job SENT since the confirmation whose email named a judge for the class, or a tap
-- since the confirmation whose job was skipped (a step switched off before it sent). A person is
-- "sent" once a ready job, or a sent job that named a judge, carries a tap since the confirmation.
-- A job already claimed by the sender (leased, or the provider took it and the drain has yet to
-- record it) is never changed: the person stays pending and the secretary taps again once it is out.
--
--   substitute_judge_email_audience(class)  internal, nobody can call it
--   substitute_judge_email_offer(class)     jsonb { pending_count, sent_count }
--   queue_substitute_judge_emails(class, judge)  queues the jobs, returns how many people; refuses
--                                           (P0001) when the class's confirmed judge is not `judge`
--
-- Both public RPCs are SECURITY DEFINER, authorized like set_class_judge (site admin or the
-- show's office manager: secretary, club admin), execute for authenticated only. A class the caller
-- may not manage answers exactly like a missing one (P0002), so a draft show's class ids do not leak. The queued
-- jobs are the MYK9-2125 ones: ready, auto_send, due in 5 minutes, one per person (merged
-- into the person's waiting job when there is one). A draft show or a switched-off step
-- queues nothing.
--
-- Rollback: DROP FUNCTION public.queue_substitute_judge_emails(uuid, uuid),
-- public.substitute_judge_email_offer(uuid), public.substitute_judge_email_audience(uuid),
-- public.substitute_judge_email_show(uuid), public.judge_email_class_notice(jsonb, text, uuid);
-- ALTER TABLE public.show_lifecycle_email_jobs DROP COLUMN class_notices, DROP COLUMN
-- substitute_followups.
-- =============================================================================

BEGIN;

ALTER TABLE public.show_lifecycle_email_jobs
  ADD COLUMN IF NOT EXISTS class_notices jsonb,
  ADD COLUMN IF NOT EXISTS substitute_followups jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.show_lifecycle_email_jobs.class_notices IS
  'MYK9-2161: for a judge_changed job, { class id: ''unnamed'' | ''named'' } for each class its email talks about, written by the sender before delivery. NULL = not recorded (read rendered_body instead). Server-written only.';
COMMENT ON COLUMN public.show_lifecycle_email_jobs.substitute_followups IS
  'MYK9-2161: for a judge_changed job, { class id: when the secretary asked to tell the exhibitors who the substitute is }. Server-written only.';

-- What a delivered judge_changed email said about one class: 'unnamed' (a judge "has not been named
-- yet"), 'named', or NULL (it does not talk about the class, or nothing says). The sender's record
-- wins; without one, the saved body does (the class name as renderJudgeChangedEmail writes it).
CREATE OR REPLACE FUNCTION public.judge_email_class_notice(
  p_notices jsonb,
  p_body text,
  p_class_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_notices IS NOT NULL THEN p_notices ->> p_class_id::text
    WHEN nullif(p_body, '') IS NULL THEN NULL
    ELSE (
      SELECT CASE
        WHEN position(n.name IN p_body) = 0 THEN NULL
        WHEN position('A new judge for ' || n.name || ' (' IN p_body) > 0
          OR position('A new judge for ' || n.name || ' has not been named yet' IN p_body) > 0
          THEN 'unnamed'
        ELSE 'named'
      END
      FROM (
        SELECT coalesce(
                 nullif(btrim(c.name), ''),
                 nullif(btrim(concat_ws(' ', nullif(btrim(c.element), ''), nullif(btrim(c.level), ''), nullif(btrim(c.section), ''))), ''),
                 'your class'
               ) AS name
          FROM public.classes c
         WHERE c.id = p_class_id
      ) n
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.judge_email_class_notice(jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.substitute_judge_email_audience(p_class_id uuid)
RETURNS TABLE (
  person_id uuid,
  from_person_id uuid,
  followed_up boolean,
  sent_after boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH cur AS (
    SELECT ja.person_id AS judge_id,
           coalesce(ja.confirmed_at, ja.created_at) AS at
      FROM public.judge_assignments ja
      JOIN public.people jp ON jp.id = ja.person_id AND jp.deleted_at IS NULL
     WHERE ja.class_id = p_class_id
       AND ja.status = 'confirmed'
     ORDER BY ja.id
     LIMIT 1
  ),
  show_of AS (
    SELECT t.show_id
      FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id
     WHERE c.id = p_class_id
       -- The trial day is not past in its own time zone (the sender skips a vacancy email then).
       AND t.date::date >= (now() AT TIME ZONE coalesce(nullif(btrim(t.timezone), ''), 'America/New_York'))::date
  ),
  last_sent AS (
    SELECT latest.person_id, latest.sent_at, latest.from_person_id
      FROM (
        SELECT DISTINCT ON (j.recipient_person_id)
               j.recipient_person_id AS person_id,
               j.sent_at,
               notice.state,
               (j.judge_changes ->> p_class_id::text)::uuid AS from_person_id
          FROM public.show_lifecycle_email_jobs j
          JOIN show_of ON show_of.show_id = j.show_id
          CROSS JOIN cur
          CROSS JOIN LATERAL (
            SELECT public.judge_email_class_notice(j.class_notices, j.rendered_body, p_class_id) AS state
          ) notice
         WHERE j.step_type = 'judge_changed'
           AND j.status = 'sent'
           AND j.recipient_person_id IS NOT NULL
           AND j.judge_changes ? p_class_id::text
           -- Only an email that talks about the class can supersede an earlier notice.
           AND notice.state IS NOT NULL
           -- The secretary's own follow-up is not a notice that supersedes the one it follows.
           AND NOT coalesce((j.substitute_followups ->> p_class_id::text)::timestamptz > cur.at, false)
         ORDER BY j.recipient_person_id, j.sent_at DESC
      ) latest
     WHERE latest.state = 'unnamed'
  )
  SELECT ls.person_id,
         ls.from_person_id,
         EXISTS (
           SELECT 1 FROM public.show_lifecycle_email_jobs r
            WHERE r.show_id = show_of.show_id
              AND r.step_type = 'judge_changed'
              AND r.recipient_person_id = ls.person_id
              AND r.judge_changes ? p_class_id::text
              AND (
                r.status = 'ready'
                OR (
                  r.status = 'sent'
                  -- Only an email that named a judge for the class is a follow-up: one that was
                  -- delivered late, still saying "not named yet", is not.
                  AND public.judge_email_class_notice(r.class_notices, r.rendered_body, p_class_id) = 'named'
                  AND (
                    r.sent_at >= cur.at
                    OR (r.substitute_followups ->> p_class_id::text)::timestamptz > cur.at
                  )
                )
                OR (
                  r.status = 'skipped'
                  AND (r.substitute_followups ->> p_class_id::text)::timestamptz > cur.at
                )
              )
         ) AS followed_up,
         EXISTS (
           SELECT 1 FROM public.show_lifecycle_email_jobs r
            WHERE r.show_id = show_of.show_id
              AND r.step_type = 'judge_changed'
              AND r.status IN ('ready', 'sent')
              AND r.recipient_person_id = ls.person_id
              AND r.judge_changes ? p_class_id::text
              AND (r.substitute_followups ->> p_class_id::text)::timestamptz > cur.at
              AND (
                r.status = 'ready'
                OR public.judge_email_class_notice(r.class_notices, r.rendered_body, p_class_id) = 'named'
              )
         ) AS sent_after
    FROM last_sent ls
    CROSS JOIN cur
    CROSS JOIN show_of
    JOIN public.people p
      ON p.id = ls.person_id
     AND p.deleted_at IS NULL
     AND nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL
   WHERE ls.from_person_id IS NOT NULL
     AND ls.from_person_id <> cur.judge_id
     AND ls.person_id IN (
       SELECT pairs.person_id
         FROM public.live_entry_person_class_pairs(show_of.show_id) AS pairs
        WHERE pairs.class_id = p_class_id
     );
$$;

REVOKE ALL ON FUNCTION public.substitute_judge_email_audience(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Shared guard: the class's show, or an error. Same authorization as set_class_judge; a class the
-- caller may not manage reads as missing (P0002).
CREATE OR REPLACE FUNCTION public.substitute_judge_email_show(p_class_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
BEGIN
  SELECT tr.show_id INTO v_show_id
    FROM public.classes c
    JOIN public.trials tr ON tr.id = c.trial_id
   WHERE c.id = p_class_id
     AND c.deleted_at IS NULL;
  -- This definer reads past the class SELECT policy, so a class the caller may not manage (a draft
  -- show's, another club's) must answer exactly like one that does not exist.
  IF v_show_id IS NULL
     OR NOT (public.is_site_admin() OR public.is_show_office_manager(v_show_id)) THEN
    RAISE EXCEPTION 'substitute judge emails: class % not found', p_class_id
      USING ERRCODE = 'P0002';
  END IF;
  RETURN v_show_id;
END;
$$;

REVOKE ALL ON FUNCTION public.substitute_judge_email_show(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.substitute_judge_email_offer(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid := public.substitute_judge_email_show(p_class_id);
  v_pending integer := 0;
  v_sent integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.shows sh
      JOIN public.show_lifecycle_email_steps s
        ON s.show_id = sh.id AND s.step_type = 'judge_changed' AND s.is_enabled
     WHERE sh.id = v_show_id
       AND sh.deleted_at IS NULL
       AND sh.status IN ('published', 'upcoming', 'in_progress')
  ) THEN
    SELECT count(*) FILTER (WHERE NOT a.followed_up),
           count(*) FILTER (WHERE a.sent_after)
      INTO v_pending, v_sent
      FROM public.substitute_judge_email_audience(p_class_id) a;
  END IF;
  RETURN jsonb_build_object('pending_count', v_pending, 'sent_count', v_sent);
END;
$$;

REVOKE ALL ON FUNCTION public.substitute_judge_email_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.substitute_judge_email_offer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_substitute_judge_emails(p_class_id uuid, p_judge_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid := public.substitute_judge_email_show(p_class_id);
  v_show_name text;
  v_step_id uuid;
  v_count integer;
BEGIN
  -- A double tap waits here; the second sees the first one's ready jobs and queues nothing.
  PERFORM pg_advisory_xact_lock(hashtextextended('queue_substitute_judge_emails:' || p_class_id::text, 0));

  -- The secretary tapped for the judge on their screen; if the class has another judge now, say
  -- so instead of telling people about a judge who is no longer the one.
  IF p_judge_id IS DISTINCT FROM (
    SELECT ja.person_id
      FROM public.judge_assignments ja
      JOIN public.people jp ON jp.id = ja.person_id AND jp.deleted_at IS NULL
     WHERE ja.class_id = p_class_id AND ja.status = 'confirmed'
     ORDER BY ja.id
     LIMIT 1
  ) THEN
    RAISE EXCEPTION 'The judge for this class changed. Check again.' USING ERRCODE = 'P0001';
  END IF;

  SELECT sh.name, s.id INTO v_show_name, v_step_id
    FROM public.shows sh
    JOIN public.show_lifecycle_email_steps s
      ON s.show_id = sh.id AND s.step_type = 'judge_changed' AND s.is_enabled
   WHERE sh.id = v_show_id
     AND sh.deleted_at IS NULL
     AND sh.status IN ('published', 'upcoming', 'in_progress');
  IF v_step_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.show_lifecycle_email_jobs AS j (
    show_id, step_id, step_type, status, recipient_scope, recipient_person_id,
    recipient_email, recipient_name, subject, idempotency_key, due_at, auto_send,
    judge_changes, substitute_followups
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
    'show-lifecycle-email:' || v_show_id::text || ':judge_changed:person:' || p.id::text
      || ':' || gen_random_uuid()::text,
    now() + interval '5 minutes',
    true,
    jsonb_build_object(p_class_id::text, a.from_person_id::text),
    jsonb_build_object(p_class_id::text, now())
  FROM public.substitute_judge_email_audience(p_class_id) a
  JOIN public.people p ON p.id = a.person_id
  WHERE NOT a.followed_up
  ON CONFLICT (show_id, recipient_person_id)
    WHERE step_type = 'judge_changed' AND status = 'ready' AND recipient_person_id IS NOT NULL
  DO UPDATE SET
    due_at = now() + interval '5 minutes',
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name,
    judge_changes = excluded.judge_changes || j.judge_changes,
    substitute_followups = j.substitute_followups || excluded.substitute_followups
  -- Never change a job the sender has claimed: it plans its email from judge_changes at claim time
  -- and, once the provider took it, only records it as sent, so a class added now would never go out
  -- and would still read as followed up. That person stays pending for the next tap.
  WHERE (j.claimed_until IS NULL OR j.claimed_until <= now())
    AND NOT EXISTS (
      SELECT 1 FROM public.show_lifecycle_email_attempts att
       WHERE att.job_id = j.id AND att.resend_message_id IS NOT NULL
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_substitute_judge_emails(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_substitute_judge_emails(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
