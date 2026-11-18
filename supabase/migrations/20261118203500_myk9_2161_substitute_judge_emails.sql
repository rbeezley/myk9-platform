-- =============================================================================
-- MYK9-2161: once a substitute judge is confirmed for a class, the secretary can email the
-- exhibitors in that class who the new judge is. Owner decision 2026-11-18 (option A, simplify):
-- no inference from past emails. Show Desk offers ONE action on the class, and the tap queues one
-- ordinary MYK9-2125 judge_changed job per exhibitor with a live entry in the class.
--
-- State, one small table: class_judge_departures keeps, per class, the judge who last stopped being
-- its confirmed judge (written by a trigger on judge_assignments, published shows only) and
-- resolved_judge_id, the judge the offer was last sent or dismissed for.
--
--   offer shows  =  a departure row exists
--               AND the class has a confirmed judge now, who is not the one who left
--               AND resolved_judge_id is not that judge
--               AND the show is published (published, upcoming, in_progress) with the
--                   judge_changed step on
-- A class that never had a judge has no departure row, so it offers nothing and emails nobody. A
-- departure with no judge named yet offers nothing until one is.
--
--   class_substitute_judge_offer(class)            jsonb {} or { judge_id, recipient_count }
--   queue_substitute_judge_emails(class, judge)    integer: how many jobs it queued or merged into
--   dismiss_substitute_judge_email_offer(class, judge)
--
-- Recipients are the live_entry_person_class_pairs rule (MYK9-2125) with an email on file. The job is
-- the 2125 one (ready, auto_send, due in 5 minutes, one per person; judge_changes names the judge who
-- left, so the email reads "was X, now Y" exactly as the automatic one). A job the sender has claimed
-- (leased, or the provider took it) is never changed: the unique index allows one ready job per
-- person, so that person is skipped, the offer stays up, and the secretary taps again once it is out.
--
-- All three are SECURITY DEFINER, authorized like set_class_judge (site admin or the show's office
-- manager). A class the caller may not manage answers like a missing one (P0002), so a draft show's
-- class ids do not leak.
--
-- hard_delete_show is restated from 20261115231300 with the new table's edge in its FK manifest.
--
-- Rollback: DROP FUNCTION public.dismiss_substitute_judge_email_offer(uuid, uuid),
-- public.queue_substitute_judge_emails(uuid, uuid), public.class_substitute_judge_offer(uuid),
-- public.substitute_judge_email_show(uuid); DROP TRIGGER trg_record_class_judge_departure_delete
-- and ..._update ON public.judge_assignments; DROP FUNCTION public.record_class_judge_departure();
-- DROP TABLE public.class_judge_departures; restore hard_delete_show from 20261115231300.
-- =============================================================================

BEGIN;

CREATE TABLE public.class_judge_departures (
  class_id uuid PRIMARY KEY REFERENCES public.classes (id) ON DELETE CASCADE,
  left_person_id uuid NOT NULL REFERENCES public.people (id) ON DELETE CASCADE,
  left_at timestamptz NOT NULL DEFAULT now(),
  resolved_judge_id uuid REFERENCES public.people (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.class_judge_departures IS
  'MYK9-2161: the judge who last stopped being a class''s confirmed judge on a published show, and the judge the secretary''s "email the exhibitors" offer was last sent or dismissed for. Server-written only.';

ALTER TABLE public.class_judge_departures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_judge_departures FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.class_judge_departures TO service_role;

CREATE OR REPLACE FUNCTION public.record_class_judge_departure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF old.class_id IS NULL OR old.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NULL;
  END IF;
  -- Published shows only: a draft is still being set up and tells nobody anything.
  IF EXISTS (
    SELECT 1
      FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id AND t.deleted_at IS NULL
      JOIN public.shows sh ON sh.id = t.show_id AND sh.deleted_at IS NULL
     WHERE c.id = old.class_id
       AND c.deleted_at IS NULL
       AND sh.status IN ('published', 'upcoming', 'in_progress')
  ) THEN
    INSERT INTO public.class_judge_departures (class_id, left_person_id, left_at, resolved_judge_id)
    VALUES (old.class_id, old.person_id, now(), NULL)
    ON CONFLICT (class_id) DO UPDATE
      SET left_person_id = excluded.left_person_id,
          left_at = excluded.left_at,
          resolved_judge_id = NULL;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Recording must never block the edit.
  RAISE WARNING 'record_class_judge_departure: % (%)', SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_class_judge_departure()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_record_class_judge_departure_delete ON public.judge_assignments;
CREATE TRIGGER trg_record_class_judge_departure_delete
  AFTER DELETE ON public.judge_assignments
  FOR EACH ROW
  WHEN (old.class_id IS NOT NULL AND old.status = 'confirmed')
  EXECUTE FUNCTION public.record_class_judge_departure();

DROP TRIGGER IF EXISTS trg_record_class_judge_departure_update ON public.judge_assignments;
CREATE TRIGGER trg_record_class_judge_departure_update
  AFTER UPDATE OF person_id, status, class_id ON public.judge_assignments
  FOR EACH ROW
  WHEN (
    old.class_id IS NOT NULL
    AND old.status = 'confirmed'
    AND (
      old.person_id IS DISTINCT FROM new.person_id
      OR new.status IS DISTINCT FROM 'confirmed'
      OR old.class_id IS DISTINCT FROM new.class_id
    )
  )
  EXECUTE FUNCTION public.record_class_judge_departure();

-- Same authorization as set_class_judge. A class the caller may not manage reads as missing.
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

-- The judge to tell people about: the class's confirmed judge, when a different judge left it and
-- the offer was not yet sent or dismissed for that judge. NULL otherwise.
CREATE OR REPLACE FUNCTION public.substitute_judge_email_target(p_class_id uuid, p_show_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT cur.person_id
    FROM public.class_judge_departures d
    JOIN public.shows sh ON sh.id = p_show_id
                        AND sh.deleted_at IS NULL
                        AND sh.status IN ('published', 'upcoming', 'in_progress')
    JOIN public.show_lifecycle_email_steps s
      ON s.show_id = sh.id AND s.step_type = 'judge_changed' AND s.is_enabled
    CROSS JOIN LATERAL (
      SELECT ja.person_id
        FROM public.judge_assignments ja
        JOIN public.people jp ON jp.id = ja.person_id AND jp.deleted_at IS NULL
       WHERE ja.class_id = p_class_id AND ja.status = 'confirmed'
       ORDER BY ja.id
       LIMIT 1
    ) cur
   WHERE d.class_id = p_class_id
     AND cur.person_id <> d.left_person_id
     AND d.resolved_judge_id IS DISTINCT FROM cur.person_id;
$$;

REVOKE ALL ON FUNCTION public.substitute_judge_email_target(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.class_substitute_judge_offer(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid := public.substitute_judge_email_show(p_class_id);
  v_judge uuid := public.substitute_judge_email_target(p_class_id, v_show_id);
  v_count integer;
BEGIN
  IF v_judge IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  SELECT count(DISTINCT p.id) INTO v_count
    FROM public.live_entry_person_class_pairs(v_show_id) pairs
    JOIN public.people p ON p.id = pairs.person_id
                        AND p.deleted_at IS NULL
                        AND nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL
   WHERE pairs.class_id = p_class_id;
  RETURN jsonb_build_object('judge_id', v_judge, 'recipient_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.class_substitute_judge_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.class_substitute_judge_offer(uuid) TO authenticated;

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

  v_target := public.substitute_judge_email_target(p_class_id, v_show_id);
  IF v_target IS NULL OR v_target IS DISTINCT FROM p_judge_id THEN
    -- Nothing to send, or the class has another judge than the one on the secretary's screen.
    RAISE EXCEPTION 'The judge for this class changed. Check again.' USING ERRCODE = 'P0001';
  END IF;

  SELECT sh.name, s.id INTO v_show_name, v_step_id
    FROM public.shows sh
    JOIN public.show_lifecycle_email_steps s
      ON s.show_id = sh.id AND s.step_type = 'judge_changed' AND s.is_enabled
   WHERE sh.id = v_show_id;
  SELECT d.left_person_id INTO v_from FROM public.class_judge_departures d WHERE d.class_id = p_class_id;

  SELECT count(DISTINCT p.id) INTO v_wanted
    FROM public.live_entry_person_class_pairs(v_show_id) pairs
    JOIN public.people p ON p.id = pairs.person_id
                        AND p.deleted_at IS NULL
                        AND nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL
   WHERE pairs.class_id = p_class_id;

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
  WHERE p.deleted_at IS NULL
    AND nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL
    AND p.id IN (
      SELECT pairs.person_id
        FROM public.live_entry_person_class_pairs(v_show_id) pairs
       WHERE pairs.class_id = p_class_id
    )
  ON CONFLICT (show_id, recipient_person_id)
    WHERE step_type = 'judge_changed' AND status = 'ready' AND recipient_person_id IS NOT NULL
  DO UPDATE SET
    due_at = now() + interval '5 minutes',
    recipient_email = excluded.recipient_email,
    recipient_name = excluded.recipient_name,
    -- The earliest "was" for a class already on the waiting job stays.
    judge_changes = excluded.judge_changes || j.judge_changes
  -- Never change a job the sender has claimed: it plans its email from judge_changes at claim time
  -- and, once the provider took it, only records it as sent.
  WHERE (j.claimed_until IS NULL OR j.claimed_until <= now())
    AND NOT EXISTS (
      SELECT 1 FROM public.show_lifecycle_email_attempts att
       WHERE att.job_id = j.id AND att.resend_message_id IS NOT NULL
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

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

CREATE OR REPLACE FUNCTION public.dismiss_substitute_judge_email_offer(p_class_id uuid, p_judge_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.substitute_judge_email_show(p_class_id);
  UPDATE public.class_judge_departures SET resolved_judge_id = p_judge_id WHERE class_id = p_class_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_substitute_judge_email_offer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_substitute_judge_email_offer(uuid, uuid) TO authenticated;

-- hard_delete_show: restated from its latest definition (20261115231300, MYK9-2064) with one added
-- manifest row, class_judge_departures_class_id_fkey, disposable (planning data, cascades from classes).
CREATE OR REPLACE FUNCTION public.hard_delete_show(p_show_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Regenerate from pg_constraint when the drift check names an edge. A new
  -- edge is 'retain' unless a reviewer can say why its rows are not
  -- participant, money, delivery or audit evidence. Every 'disposable' edge
  -- must be ON DELETE CASCADE from shows, trials or classes.
  v_fk_manifest CONSTANT pg_catalog.jsonb := $manifest$
  [
    {"constraint_schema" : "public", "constraint_name" : "announcements_show_id_fkey", "child_schema" : "public", "child_table" : "announcements", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "armbands_show_id_fkey", "child_schema" : "public", "child_table" : "armbands", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "calendar_feed_tokens_show_id_fkey", "child_schema" : "public", "child_table" : "calendar_feed_tokens", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "dog_favorites_show_id_fkey", "child_schema" : "public", "child_table" : "dog_favorites", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "dogs_created_from_show_id_fkey", "child_schema" : "public", "child_table" : "dogs", "child_column" : "created_from_show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "email_log_show_id_fkey", "child_schema" : "public", "child_table" : "email_log", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "registrations_show_id_fkey", "child_schema" : "public", "child_table" : "enrollments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entries_show_id_fkey", "child_schema" : "public", "child_table" : "entries", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_carts_show_id_fkey", "child_schema" : "public", "child_table" : "entry_carts", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_form_notes_show_id_fkey", "child_schema" : "public", "child_table" : "entry_form_notes", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_payment_links_show_id_fkey", "child_schema" : "public", "child_table" : "entry_payment_links", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "judge_assignments_show_id_fkey", "child_schema" : "public", "child_table" : "judge_assignments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "paperwork_prints_show_id_fkey", "child_schema" : "public", "child_table" : "paperwork_prints", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "people_created_from_show_id_fkey", "child_schema" : "public", "child_table" : "people", "child_column" : "created_from_show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "premium_generation_attempts_show_id_fkey", "child_schema" : "public", "child_table" : "premium_generation_attempts", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "premium_generations_show_id_fkey", "child_schema" : "public", "child_table" : "premium_generations", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "refund_requests_show_id_fkey", "child_schema" : "public", "child_table" : "refund_requests", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "result_submissions_show_id_fkey", "child_schema" : "public", "child_table" : "result_submissions", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "ringside_sessions_show_id_fkey", "child_schema" : "public", "child_table" : "ringside_sessions", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "role_requests_show_id_fkey", "child_schema" : "public", "child_table" : "role_requests", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "secretary_tasks_show_id_fkey", "child_schema" : "public", "child_table" : "secretary_tasks", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_announcements_show_id_fkey", "child_schema" : "public", "child_table" : "show_announcements", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_close_notes_show_id_fkey", "child_schema" : "public", "child_table" : "show_close_notes", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_committee_members_show_id_fkey", "child_schema" : "public", "child_table" : "show_committee_members", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_eve_nudge_log_show_id_fkey", "child_schema" : "public", "child_table" : "show_eve_nudge_log", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_incidents_show_id_fkey", "child_schema" : "public", "child_table" : "show_incidents", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_judge_supplies_show_id_fkey", "child_schema" : "public", "child_table" : "show_judge_supplies", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_lifecycle_email_jobs_show_id_fkey", "child_schema" : "public", "child_table" : "show_lifecycle_email_jobs", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_lifecycle_email_steps_show_id_fkey", "child_schema" : "public", "child_table" : "show_lifecycle_email_steps", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_message_threads_show_id_fkey", "child_schema" : "public", "child_table" : "show_message_threads", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_messages_show_id_fkey", "child_schema" : "public", "child_table" : "show_messages", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_money_locks_show_id_fkey", "child_schema" : "public", "child_table" : "show_money_locks", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_officials_show_id_fkey", "child_schema" : "public", "child_table" : "show_officials", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_passcodes_show_id_fkey", "child_schema" : "public", "child_table" : "show_passcodes", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "show_payments_show_id_fkey", "child_schema" : "public", "child_table" : "show_payments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "RESTRICT", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_payouts_show_id_fkey", "child_schema" : "public", "child_table" : "show_payouts", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_visibility_settings_show_id_fkey", "child_schema" : "public", "child_table" : "show_visibility_settings", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "stripe_orders_show_id_fkey", "child_schema" : "public", "child_table" : "stripe_orders", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "RESTRICT", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "support_tickets_show_id_fkey", "child_schema" : "public", "child_table" : "support_tickets", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_packet_generation_claims_show_id_fkey", "child_schema" : "public", "child_table" : "trial_packet_generation_claims", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_packet_print_reminders_show_id_fkey", "child_schema" : "public", "child_table" : "trial_packet_print_reminders", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_packet_snapshots_show_id_fkey", "child_schema" : "public", "child_table" : "trial_packet_snapshots", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "RESTRICT", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trials_show_id_fkey", "child_schema" : "public", "child_table" : "trials", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "user_roles_show_id_fkey", "child_schema" : "public", "child_table" : "user_roles", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "volunteer_general_assignments_show_id_fkey", "child_schema" : "public", "child_table" : "volunteer_general_assignments", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "volunteers_show_id_fkey", "child_schema" : "public", "child_table" : "volunteers", "child_column" : "show_id", "parent_schema" : "public", "parent_table" : "shows", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "activity_log_trial_id_fkey", "child_schema" : "public", "child_table" : "activity_log", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "announcements_trial_id_fkey", "child_schema" : "public", "child_table" : "announcements", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "armbands_trial_id_fkey", "child_schema" : "public", "child_table" : "armbands", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "classes_trial_id_fkey", "child_schema" : "public", "child_table" : "classes", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "entries_trial_id_fkey", "child_schema" : "public", "child_table" : "entries", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "judge_assignments_trial_id_fkey", "child_schema" : "public", "child_table" : "judge_assignments", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "paperwork_prints_trial_id_fkey", "child_schema" : "public", "child_table" : "paperwork_prints", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "result_submissions_trial_id_fkey", "child_schema" : "public", "child_table" : "result_submissions", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_incidents_trial_id_fkey", "child_schema" : "public", "child_table" : "show_incidents", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_checklist_state_trial_id_fkey", "child_schema" : "public", "child_table" : "trial_checklist_state", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "trial_lunch_orders_trial_id_fkey", "child_schema" : "public", "child_table" : "trial_lunch_orders", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "trial_visibility_overrides_trial_id_fkey", "child_schema" : "public", "child_table" : "trial_visibility_overrides", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "volunteer_general_assignments_trial_id_fkey", "child_schema" : "public", "child_table" : "volunteer_general_assignments", "child_column" : "trial_id", "parent_schema" : "public", "parent_table" : "trials", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "class_judge_departures_class_id_fkey", "child_schema" : "public", "child_table" : "class_judge_departures", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "cart_spot_holds_class_id_fkey", "child_schema" : "public", "child_table" : "cart_spot_holds", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "class_visibility_overrides_class_id_fkey", "child_schema" : "public", "child_table" : "class_visibility_overrides", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "entries_class_id_fkey", "child_schema" : "public", "child_table" : "entries", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "entry_cart_items_class_id_fkey", "child_schema" : "public", "child_table" : "entry_cart_items", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "NO ACTION", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "judge_assignments_class_id_fkey", "child_schema" : "public", "child_table" : "judge_assignments", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "disposable"},
    {"constraint_schema" : "public", "constraint_name" : "paperwork_prints_class_id_fkey", "child_schema" : "public", "child_table" : "paperwork_prints", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_incidents_class_id_fkey", "child_schema" : "public", "child_table" : "show_incidents", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "volunteer_class_assignments_class_id_fkey", "child_schema" : "public", "child_table" : "volunteer_class_assignments", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "waitlist_entries_class_id_fkey", "child_schema" : "public", "child_table" : "waitlist_entries", "child_column" : "class_id", "parent_schema" : "public", "parent_table" : "classes", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "show_lifecycle_email_jobs_step_id_fkey", "child_schema" : "public", "child_table" : "show_lifecycle_email_jobs", "child_column" : "step_id", "parent_schema" : "public", "parent_table" : "show_lifecycle_email_steps", "parent_column" : "id", "delete_action" : "CASCADE", "disposition" : "retain"},
    {"constraint_schema" : "public", "constraint_name" : "ringside_sessions_show_passcode_id_fkey", "child_schema" : "public", "child_table" : "ringside_sessions", "child_column" : "show_passcode_id", "parent_schema" : "public", "parent_table" : "show_passcodes", "parent_column" : "id", "delete_action" : "SET NULL", "disposition" : "retain"}
  ]
  $manifest$::pg_catalog.jsonb;
  v_edge record;
  v_fk_drift text;
  v_orders integer;
  v_has_retained_child boolean;
  v_parent_scope text;


NOTIFY pgrst, 'reload schema';

COMMIT;
