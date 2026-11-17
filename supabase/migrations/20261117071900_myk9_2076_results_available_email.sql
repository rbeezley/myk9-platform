-- =============================================================================
-- MYK9-2076: the "Results available" lifecycle email gets a producer.
--
-- Plan: docs/plan-show-closeout.md, Phase 4b, decision 6. When the LAST class of a
-- show is released, every exhibitor with a dog in the show is queued ONE email,
-- "Results from {show} are ready", linking to their own results on My Shows
-- (/exhibitor/entries?showId=...). It lists nobody's results.
--
-- Shape (the closest existing producer is the decision emails, which also write
-- `ready` rows into show_lifecycle_email_jobs for the secretary to review and send
-- from the Scheduled emails panel through send-lifecycle-email's existing `send`
-- action, so no new sender is built):
--   * An AFTER UPDATE OF results_released_at trigger on classes. Every release path
--     (Results tab, bulk release, auto release) writes that column, so one
--     trigger covers them all; a scheduled scan would add a cron for no gain.
--   * "Last" = no class of the show is still waiting for release. A class waits when
--     it is not soft-deleted, not cancelled, has at least one dog that ran (the same
--     "expected" set the app's tally uses: accepted or running, not pending, not
--     withdrawn, scratched, absent, moved or not accepted, not pulled) and has no
--     results_released_at. A cancelled class and a class with no dogs never block.
--   * The step's per-show switch (show_lifecycle_email_steps.is_enabled) is honoured:
--     switched off at that moment, nothing is queued.
--   * Idempotent per (show, exhibitor), on the server:
--       - a partial UNIQUE index on (show_id, recipient_person_id) for the step, so
--         a second row for one exhibitor cannot exist whatever the writer;
--       - the function does nothing once the show has ANY results_available row
--         (sent, skipped or dismissed included), so a class released later, or a
--         release undone and redone, queues nothing, not even for an exhibitor who
--         entered after the first round;
--       - inserts use ON CONFLICT DO NOTHING.
--   * One email per exhibitor: the recipient is the dog's owner (the rule the other
--     steps use), grouped by person across all their dogs and entries. An owner
--     with no email address is left out (nothing to send).
--   * The decision is re-run when the last waiting class stops waiting some other way
--     (cancelled or soft-deleted), and when the step's switch is turned on after
--     every class was released. Accepted gap: no trigger on entries, so a last dog
--     withdrawn AFTER every other class was released does not queue the email by
--     itself; the next release, cancel or switch change does.
--   * Serialised per show by an advisory transaction lock, so two classes released
--     in concurrent transactions cannot each see the other as still waiting.
--
-- Rollback: DROP TRIGGER trg_queue_results_available_emails ON public.classes;
-- DROP TRIGGER trg_queue_results_available_on_enable ON public.show_lifecycle_email_steps;
-- DROP FUNCTION public.queue_results_available_emails();
-- DROP FUNCTION public.queue_results_available_on_enable();
-- DROP FUNCTION public.queue_results_available_for_show(uuid); DROP INDEX
-- show_lifecycle_email_jobs_one_results_per_person.
-- =============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS show_lifecycle_email_jobs_one_results_per_person
  ON public.show_lifecycle_email_jobs (show_id, recipient_person_id)
  WHERE step_type = 'results_available' AND recipient_person_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.queue_results_available_for_show(p_show_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_name text;
  v_step_id uuid;
BEGIN
  -- One decision at a time per show: two classes released in concurrent
  -- transactions must not each see the other as still waiting.
  PERFORM pg_advisory_xact_lock(hashtextextended('results_available:' || p_show_id::text, 0));

  -- The per-show switch.
  SELECT s.id INTO v_step_id
    FROM public.show_lifecycle_email_steps s
   WHERE s.show_id = p_show_id
     AND s.step_type = 'results_available'
     AND s.is_enabled;
  IF v_step_id IS NULL THEN
    RETURN;
  END IF;

  -- Already queued for this show (in any state): a later release sends nothing.
  IF EXISTS (
    SELECT 1 FROM public.show_lifecycle_email_jobs j
     WHERE j.show_id = p_show_id AND j.step_type = 'results_available'
  ) THEN
    RETURN;
  END IF;

  -- A class still waits: live, not cancelled, an expected dog, not released.
  IF EXISTS (
    SELECT 1
      FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id
     WHERE t.show_id = p_show_id
       AND t.deleted_at IS NULL
       AND c.deleted_at IS NULL
       AND c.results_released_at IS NULL
       AND lower(btrim(coalesce(c.status, ''))) NOT IN ('cancelled', 'canceled')
       AND EXISTS (
         SELECT 1 FROM public.entries e
          WHERE e.class_id = c.id
            AND e.deleted_at IS NULL
            AND e.entry_status IN (
              'confirmed', 'accepted', 'scheduled', 'checked-in', 'at-gate',
              'in-ring', 'competing', 'completed', 'move-up-requested', 'move_up_requested'
            )
            AND e.check_in_status IS DISTINCT FROM 'pulled'
       )
  ) THEN
    RETURN;
  END IF;

  -- Something must have been released.
  IF NOT EXISTS (
    SELECT 1
      FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id
     WHERE t.show_id = p_show_id
       AND t.deleted_at IS NULL
       AND c.deleted_at IS NULL
       AND c.results_released_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  SELECT sh.name INTO v_show_name FROM public.shows sh WHERE sh.id = p_show_id;

  INSERT INTO public.show_lifecycle_email_jobs (
    show_id, step_id, step_type, status, recipient_scope, recipient_person_id,
    recipient_email, recipient_name, subject, body, idempotency_key, due_at
  )
  SELECT
    p_show_id,
    v_step_id,
    'results_available',
    'ready',
    'show_recipient',
    p.id,
    btrim(p.email),
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    'Results from ' || coalesce(v_show_name, 'the show') || ' are ready',
    'Hi ' || coalesce(nullif(btrim(p.first_name), ''), 'there') || E',\n\n'
      || 'Results from ' || coalesce(v_show_name, 'the show') || ' are ready.' || E'\n\n'
      || 'View your results: https://myk9show.com/exhibitor/entries?showId=' || p_show_id::text
      || E'\n\nPlease contact the show secretary with questions.',
    'show-lifecycle-email:' || p_show_id::text || ':results_available:person:' || p.id::text,
    now()
  FROM public.people p
  WHERE nullif(btrim(coalesce(p.email, '')), '') IS NOT NULL
    AND p.deleted_at IS NULL
    AND p.id IN (
      -- The dog's owner and the entry's handler each get one (deduplicated per person):
      -- My Shows lists the entry for both.
      SELECT r.person_id
        FROM public.entries e
        JOIN public.dogs d ON d.id = e.dog_id
        JOIN public.classes c ON c.id = e.class_id
        JOIN public.trials t ON t.id = c.trial_id
        CROSS JOIN LATERAL (VALUES (d.owner_id), (e.handler_id)) AS r(person_id)
       WHERE e.show_id = p_show_id
         AND t.show_id = p_show_id
         AND t.deleted_at IS NULL
         AND c.deleted_at IS NULL
         AND lower(btrim(coalesce(c.status, ''))) NOT IN ('cancelled', 'canceled')
         AND e.deleted_at IS NULL
         AND e.entry_status IN (
           'confirmed', 'accepted', 'scheduled', 'checked-in', 'at-gate',
              'in-ring', 'competing', 'completed', 'move-up-requested', 'move_up_requested'
         )
         AND e.check_in_status IS DISTINCT FROM 'pulled'
         AND r.person_id IS NOT NULL
         AND d.deleted_at IS NULL
    )
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_results_available_for_show(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.queue_results_available_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
BEGIN
  SELECT t.show_id INTO v_show_id
    FROM public.trials t
   WHERE t.id = new.trial_id AND t.deleted_at IS NULL;
  IF v_show_id IS NOT NULL THEN
    PERFORM public.queue_results_available_for_show(v_show_id);
  END IF;
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Queuing an email must never block releasing a class's results.
  RAISE WARNING 'queue_results_available_emails: % (%)', SQLERRM, SQLSTATE;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_results_available_emails() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_queue_results_available_emails ON public.classes;
CREATE TRIGGER trg_queue_results_available_emails
  AFTER UPDATE OF results_released_at, status, deleted_at ON public.classes
  FOR EACH ROW
  WHEN (
    (new.results_released_at IS NOT NULL AND old.results_released_at IS DISTINCT FROM new.results_released_at)
    OR (new.deleted_at IS NOT NULL AND old.deleted_at IS NULL)
    OR (
      old.status IS DISTINCT FROM new.status
      AND lower(btrim(coalesce(new.status, ''))) IN ('cancelled', 'canceled')
    )
  )
  EXECUTE FUNCTION public.queue_results_available_emails();

CREATE OR REPLACE FUNCTION public.queue_results_available_on_enable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.queue_results_available_for_show(new.show_id);
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'queue_results_available_on_enable: % (%)', SQLERRM, SQLSTATE;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_results_available_on_enable() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_queue_results_available_on_enable ON public.show_lifecycle_email_steps;
CREATE TRIGGER trg_queue_results_available_on_enable
  AFTER UPDATE OF is_enabled ON public.show_lifecycle_email_steps
  FOR EACH ROW
  WHEN (new.step_type = 'results_available' AND new.is_enabled AND NOT old.is_enabled)
  EXECUTE FUNCTION public.queue_results_available_on_enable();

COMMIT;
