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
-- writes the class ids the email calls "not named yet" to show_lifecycle_email_jobs.unnamed_class_ids,
-- BEFORE it delivers (so an interrupted send that a later drain only finishes keeps it). A person was
-- told when their latest SENT judge_changed job lists the class there. They still need a live entry in
-- the class, an email, and a trial day that is not past (the sender's own rule for a vacancy). A person
-- whose "was" judge is the current judge (the original judge came back) is not offered: the sender
-- skips that email as "not news".
--
-- Follow-up state, with no new table: the tap records, on the job it queues or merges into,
-- substitute_followups = { class id: when }. A person is "pending" until they have a follow-up: a
-- ready judge_changed job covering the class (the tap's, a bundled waiting job, or the 2125
-- trigger's), one sent since the confirmation, or a tap since the confirmation whose job was skipped
-- (a step switched off before it sent). A person is "sent" once a ready or sent job carries a tap
-- since the confirmation.
--
--   substitute_judge_email_audience(class)  internal, nobody can call it
--   substitute_judge_email_offer(class)     jsonb { pending_count, sent_count }
--   queue_substitute_judge_emails(class)    queues the jobs, returns how many people
--
-- Both public RPCs are SECURITY DEFINER, authorized like set_class_judge (site admin or the
-- show's office manager: secretary, club admin), execute for authenticated only. The queued
-- jobs are the MYK9-2125 ones: ready, auto_send, due in 5 minutes, one per person (merged
-- into the person's waiting job when there is one). A draft show or a switched-off step
-- queues nothing.
--
-- Rollback: DROP FUNCTION public.queue_substitute_judge_emails(uuid),
-- public.substitute_judge_email_offer(uuid), public.substitute_judge_email_audience(uuid),
-- public.substitute_judge_email_show(uuid); ALTER TABLE public.show_lifecycle_email_jobs DROP COLUMN
-- unnamed_class_ids, DROP COLUMN substitute_followups.
-- =============================================================================

BEGIN;

ALTER TABLE public.show_lifecycle_email_jobs
  ADD COLUMN IF NOT EXISTS unnamed_class_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS substitute_followups jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.show_lifecycle_email_jobs.unnamed_class_ids IS
  'MYK9-2161: for a judge_changed job, the class ids its email called "not named yet", written by the sender before delivery. Server-written only.';
COMMENT ON COLUMN public.show_lifecycle_email_jobs.substitute_followups IS
  'MYK9-2161: for a judge_changed job, { class id: when the secretary asked to tell the exhibitors who the substitute is }. Server-written only.';

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
    SELECT DISTINCT ON (j.recipient_person_id)
           j.recipient_person_id AS person_id,
           j.sent_at,
           (j.judge_changes ->> p_class_id::text)::uuid AS from_person_id
      FROM public.show_lifecycle_email_jobs j
      JOIN show_of ON show_of.show_id = j.show_id
      CROSS JOIN cur
     WHERE j.step_type = 'judge_changed'
       AND j.status = 'sent'
       AND j.unnamed_class_ids ? p_class_id::text
       AND j.recipient_person_id IS NOT NULL
       AND j.judge_changes ? p_class_id::text
     ORDER BY j.recipient_person_id, j.sent_at DESC
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
                OR (r.status = 'sent' AND r.sent_at >= cur.at)
                OR (
                  r.status IN ('sent', 'skipped')
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

-- Shared guard: the class's show, or an error. Same authorization as set_class_judge.
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
  IF v_show_id IS NULL THEN
    RAISE EXCEPTION 'substitute judge emails: class % not found', p_class_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.is_site_admin() OR public.is_show_office_manager(v_show_id)) THEN
    RAISE EXCEPTION 'substitute judge emails: not permitted for this show'
      USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.queue_substitute_judge_emails(p_class_id uuid)
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
    substitute_followups = j.substitute_followups || excluded.substitute_followups;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_substitute_judge_emails(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_substitute_judge_emails(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
