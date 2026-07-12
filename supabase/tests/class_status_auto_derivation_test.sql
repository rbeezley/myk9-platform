-- Behavioral test for the class-status-auto-derivation migration
-- (20260712180000_class_status_auto_derivation.sql).
--
-- Runs as ONE transaction that seeds minimal fixtures, exercises each behavior,
-- RAISEs EXCEPTION on any failed assertion, and ROLLBACKs so nothing persists.
-- It CANNOT be run by this sub-agent (no DB); the orchestrator runs it against
-- staging, e.g.:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/class_status_auto_derivation_test.sql
-- A clean run prints "3.x PASS ..." lines and ends with ROLLBACK; any failure
-- aborts with a labeled exception. The migration must already be applied.

BEGIN;

-- Silence the push webhooks for the test transaction (rolled back with the txn).
ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_status_push;
ALTER TABLE public.entries DISABLE TRIGGER trg_notify_entry_scoring_push;

DO $$
DECLARE
  v_show  uuid := gen_random_uuid();
  v_trial uuid := gen_random_uuid();
  v_c1 uuid := gen_random_uuid();  -- 3.1 scratched-does-not-block
  v_c2 uuid := gen_random_uuid();  -- 3.2 manual override survives recompute
  v_c3 uuid := gen_random_uuid();  -- 3.3 late entry reopens + clears manual
  v_c4 uuid := gen_random_uuid();  -- 3.4 empty -> upcoming -> in_progress -> absent completes
  v_c5 uuid := gen_random_uuid();  -- 3.5 backfill fixes stuck in_progress
  v_c6 uuid := gen_random_uuid();  -- 3.5 backfill skips manual
  v_e uuid;
  v_status text;
  v_source text;
  v_reopened timestamptz;
  v_scored integer;
BEGIN
  -- Shared parent rows (minimal NOT NULL columns only).
  INSERT INTO public.shows (id, name, type, start_date, end_date, is_nationals)
    VALUES (v_show, 'Test Show', 'All-Breed', current_date, current_date, false);
  INSERT INTO public.trials (id, show_id, name, date)
    VALUES (v_trial, v_show, 'Trial 1', current_date);

  INSERT INTO public.classes (id, trial_id, name, status)
    VALUES (v_c1, v_trial, 'C1', 'upcoming'),
           (v_c2, v_trial, 'C2', 'upcoming'),
           (v_c3, v_trial, 'C3', 'upcoming'),
           (v_c4, v_trial, 'C4', 'upcoming'),
           (v_c5, v_trial, 'C5', 'upcoming'),
           (v_c6, v_trial, 'C6', 'upcoming');

  -- =====================================================================
  -- 3.1 Scratched dog does not block completion.
  --     2 scored qualified + 1 scratched -> class completes.
  -- =====================================================================
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c1, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified'),
           (v_c1, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified'),
           (v_c1, v_show, v_trial, 'scratched',  'no-status',  false, 'pending');

  SELECT status INTO v_status FROM public.classes WHERE id = v_c1;
  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION '3.1 FAIL: expected completed with a scratched entry, got %', v_status;
  END IF;
  RAISE NOTICE '3.1 PASS: scratched dog does not block completion (status=%)', v_status;

  -- =====================================================================
  -- 3.2 Manual override survives recompute (status stays completed,
  --     scored_count still updates).
  -- =====================================================================
  -- Seed two expected, unscored entries while derived (class stays upcoming).
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c2, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending')
    RETURNING id INTO v_e;
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c2, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending');

  -- Secretary manually marks the partially-scored class complete.
  UPDATE public.classes
    SET status = 'completed', status_source = 'manual'
    WHERE id = v_c2;

  -- A further entry is then scored -> UPDATE trigger recomputes.
  UPDATE public.entries
    SET is_scored = true, result_status = 'qualified'
    WHERE id = v_e;

  SELECT status, scored_count INTO v_status, v_scored FROM public.classes WHERE id = v_c2;
  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION '3.2 FAIL: manual override overwritten, status=%', v_status;
  END IF;
  IF v_scored IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '3.2 FAIL: scored_count not refreshed under manual override, got %', v_scored;
  END IF;
  RAISE NOTICE '3.2 PASS: manual override survives recompute (status=%, scored_count=%)', v_status, v_scored;

  -- =====================================================================
  -- 3.3 Late entry INSERT into a manually-closed class reopens it
  --     (in_progress + status_source='derived' + reopened stamp) and
  --     clears the prior manual override.
  -- =====================================================================
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c3, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified');

  SELECT status, status_source INTO v_status, v_source FROM public.classes WHERE id = v_c3;
  IF v_status IS DISTINCT FROM 'completed' OR v_source IS DISTINCT FROM 'derived' THEN
    RAISE EXCEPTION '3.3 SETUP FAIL: expected derived/completed, got %/%', v_source, v_status;
  END IF;

  -- Simulate a prior manual closeout of the same class.
  UPDATE public.classes SET status = 'completed', status_source = 'manual' WHERE id = v_c3;

  -- Late expected entry arrives.
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c3, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending');

  SELECT status, status_source, reopened_after_closeout_at
    INTO v_status, v_source, v_reopened
    FROM public.classes WHERE id = v_c3;
  IF v_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION '3.3 FAIL: late entry did not reopen class, status=%', v_status;
  END IF;
  IF v_source IS DISTINCT FROM 'derived' THEN
    RAISE EXCEPTION '3.3 FAIL: manual override not cleared, status_source=%', v_source;
  END IF;
  IF v_reopened IS NULL THEN
    RAISE EXCEPTION '3.3 FAIL: reopened_after_closeout_at not stamped';
  END IF;
  RAISE NOTICE '3.3 PASS: late entry reopened + cleared manual (status=%, source=%, reopened set)', v_status, v_source;

  -- =====================================================================
  -- 3.4 Empty class stays upcoming; first score -> in_progress;
  --     absent counts as accounted-for and completes the class.
  -- =====================================================================
  PERFORM public.refresh_class_scoring_state(v_c4);
  SELECT status INTO v_status FROM public.classes WHERE id = v_c4;
  IF v_status IS DISTINCT FROM 'upcoming' THEN
    RAISE EXCEPTION '3.4 FAIL: empty class not upcoming, status=%', v_status;
  END IF;
  RAISE NOTICE '3.4a PASS: empty class stays upcoming';

  -- Two expected, unscored entries.
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c4, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending')
    RETURNING id INTO v_e;
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c4, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending')
    RETURNING id INTO v_e;  -- keep the last id (the absent one below)

  -- Score the first entry -> in_progress (2 expected, 1 accounted).
  UPDATE public.entries
    SET is_scored = true, result_status = 'qualified'
    WHERE class_id = v_c4 AND id <> v_e;

  SELECT status INTO v_status FROM public.classes WHERE id = v_c4;
  IF v_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION '3.4 FAIL: first score did not move class to in_progress, status=%', v_status;
  END IF;
  RAISE NOTICE '3.4b PASS: first scoring event -> in_progress';

  -- Record the remaining entry as a no-show (absent, not is_scored).
  UPDATE public.entries SET result_status = 'absent' WHERE id = v_e;

  SELECT status INTO v_status FROM public.classes WHERE id = v_c4;
  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION '3.4 FAIL: absent not counted as accounted-for, status=%', v_status;
  END IF;
  RAISE NOTICE '3.4c PASS: absent counts as accounted-for -> completed';

  -- =====================================================================
  -- 3.5 Backfill recomputes a stuck in_progress class to completed and
  --     skips a manual class. Seed the stuck state with the derivation
  --     trigger disabled so we can simulate stale pre-migration data.
  -- =====================================================================
  ALTER TABLE public.entries DISABLE TRIGGER entries_refresh_class_scoring_state;

  -- C5: would derive to completed (1 scored qualified + 1 scratched) but is
  --     stuck at in_progress as if written by the old buggy code.
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c5, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified'),
           (v_c5, v_show, v_trial, 'scratched',  'no-status',  false, 'pending');
  UPDATE public.classes SET status = 'in_progress', status_source = 'derived' WHERE id = v_c5;

  -- C6: manual, marked completed, but has an unscored expected entry that a
  --     derive would call in_progress. Backfill must leave it alone.
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c6, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending');
  UPDATE public.classes SET status = 'completed', status_source = 'manual' WHERE id = v_c6;

  ALTER TABLE public.entries ENABLE TRIGGER entries_refresh_class_scoring_state;

  -- Simulate the migration's webhook-guarded backfill loop (push already off).
  FOR v_e IN SELECT id FROM public.classes WHERE status_source <> 'manual'
  LOOP
    PERFORM public.refresh_class_scoring_state(v_e);
  END LOOP;

  SELECT status INTO v_status FROM public.classes WHERE id = v_c5;
  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION '3.5 FAIL: backfill did not complete stuck class, status=%', v_status;
  END IF;
  RAISE NOTICE '3.5a PASS: backfill recomputed stuck in_progress -> completed';

  SELECT status, status_source INTO v_status, v_source FROM public.classes WHERE id = v_c6;
  IF v_status IS DISTINCT FROM 'completed' OR v_source IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION '3.5 FAIL: backfill did not preserve manual class, status=%, source=%', v_status, v_source;
  END IF;
  RAISE NOTICE '3.5b PASS: backfill skips manual class (status=%, source=%)', v_status, v_source;

  RAISE NOTICE 'ALL class-status-auto-derivation assertions passed.';
END $$;

ROLLBACK;
