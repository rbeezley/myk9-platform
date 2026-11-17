-- =============================================================================
-- MYK9-2131: a show's dates are the dates of its trials.
--
-- Plan: docs/plan-show-dates-from-trials.md. Show Edit saved shows.start_date and end_date
-- but never moved trials.date, so a show could say Dec 12-13 while its trials said Dec 5
-- and 6. Run order, confirmation emails and the catalog read the trial dates. Owner
-- decision B (2026-11-17): the stored columns stay (about 40 readers and replication use
-- them) and follow the trials.
--
--   1. private.sync_show_dates_from_trials(show_id): start_date / end_date become the
--      earliest / latest date of the show's live trials, as midnight UTC timestamptz (the
--      stored convention). No live trial: the dates are left alone. Writes only on change.
--   2. AFTER INSERT / DELETE / UPDATE OF date, deleted_at, show_id on trials runs it for
--      the show (old and new on a move). Covers the create RPC, add-trials, Trial Edit,
--      soft delete and restore, hard delete.
--   3. BEFORE UPDATE OF start_date, end_date on shows replaces what a client sent with the
--      derived value whenever the show has a live trial. Its own AFTER-trigger write is
--      already the derived value, so it is a no-op there.
--   4. Backfill: every show with a live trial, with a NOTICE of how many changed.
--
-- The MYK9-2124 email needs nothing new: a trial date change fires
-- trg_queue_show_changed_email_trial on its own. The show-date write here touches neither
-- the venue columns nor the publish gate's columns.
--
-- Rollback: DROP TRIGGER trg_sync_show_dates_from_trial ON public.trials; DROP TRIGGER
-- trg_derive_show_dates ON public.shows; DROP FUNCTION public.sync_show_dates_from_trial_change(),
-- public.derive_show_dates_before_update(), private.sync_show_dates_from_trials(uuid),
-- private.derived_show_dates(uuid). Dates already written stay.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- The derived dates, or no row when the show has no live trial.
CREATE OR REPLACE FUNCTION private.derived_show_dates(p_show_id uuid)
RETURNS TABLE (start_date timestamptz, end_date timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT min(t.date)::timestamp AT TIME ZONE 'UTC',
         max(t.date)::timestamp AT TIME ZONE 'UTC'
    FROM public.trials t
   WHERE t.show_id = p_show_id
     AND t.deleted_at IS NULL
     AND t.date IS NOT NULL
  HAVING count(*) > 0
$$;

REVOKE ALL ON FUNCTION private.derived_show_dates(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.sync_show_dates_from_trials(p_show_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_show_id IS NULL THEN
    RETURN;
  END IF;

  -- Lock the show first, so two transactions changing its trials at once compute in turn:
  -- the second reads the first's committed trials and cannot write stale dates over them.
  PERFORM 1 FROM public.shows s WHERE s.id = p_show_id FOR UPDATE;

  SELECT d.start_date, d.end_date INTO v_start, v_end
    FROM private.derived_show_dates(p_show_id) d;

  IF NOT FOUND THEN
    RETURN;  -- no live trial: keep the show's current dates
  END IF;

  UPDATE public.shows s
     SET start_date = v_start,
         end_date = v_end
   WHERE s.id = p_show_id
     AND (s.start_date IS DISTINCT FROM v_start OR s.end_date IS DISTINCT FROM v_end);
END;
$$;

REVOKE ALL ON FUNCTION private.sync_show_dates_from_trials(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_show_dates_from_trial_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM private.sync_show_dates_from_trials(old.show_id);
    RETURN old;
  END IF;

  IF TG_OP = 'UPDATE' AND old.show_id IS DISTINCT FROM new.show_id THEN
    PERFORM private.sync_show_dates_from_trials(old.show_id);
  END IF;
  PERFORM private.sync_show_dates_from_trials(new.show_id);
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_show_dates_from_trial_change() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_sync_show_dates_from_trial ON public.trials;
CREATE TRIGGER trg_sync_show_dates_from_trial
  AFTER INSERT OR DELETE OR UPDATE OF date, deleted_at, show_id ON public.trials
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_show_dates_from_trial_change();

CREATE OR REPLACE FUNCTION public.derive_show_dates_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  SELECT d.start_date, d.end_date INTO v_start, v_end
    FROM private.derived_show_dates(new.id) d;

  IF FOUND THEN
    new.start_date := v_start;
    new.end_date := v_end;
  END IF;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.derive_show_dates_before_update() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_derive_show_dates ON public.shows;
CREATE TRIGGER trg_derive_show_dates
  BEFORE UPDATE OF start_date, end_date ON public.shows
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_show_dates_before_update();

DO $$
DECLARE
  v_changed integer;
BEGIN
  WITH derived AS (
    SELECT t.show_id,
           min(t.date)::timestamp AT TIME ZONE 'UTC' AS start_date,
           max(t.date)::timestamp AT TIME ZONE 'UTC' AS end_date
      FROM public.trials t
     WHERE t.deleted_at IS NULL AND t.date IS NOT NULL
     GROUP BY t.show_id
  ), changed AS (
    UPDATE public.shows s
       SET start_date = d.start_date,
           end_date = d.end_date
      FROM derived d
     WHERE s.id = d.show_id
       AND (s.start_date IS DISTINCT FROM d.start_date OR s.end_date IS DISTINCT FROM d.end_date)
    RETURNING s.id
  )
  SELECT count(*) INTO v_changed FROM changed;
  RAISE NOTICE 'MYK9-2131: % show(s) had dates that disagreed with their trials and were corrected', v_changed;
END
$$;

COMMIT;
