-- Behavioral test for 20261003200000_class_actual_times_from_scoring.sql:
-- ringside scoring stamps a derived class's actual start and finish.
--
-- One transaction, rolled back. A clean run prints "AT.n PASS" lines; any
-- failed assertion aborts with a labeled exception. The migration must already
-- be applied (the CI harness runs every migration first).

BEGIN;

ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_status_push;
ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_results_push;

DO $$
DECLARE
  v_show uuid := gen_random_uuid();
  v_trial uuid := gen_random_uuid();
  v_derived uuid := gen_random_uuid();
  v_manual uuid := gen_random_uuid();
  v_bare uuid := gen_random_uuid();
  v_done uuid := gen_random_uuid();
  v_absent_class uuid := gen_random_uuid();
  v_d uuid;
  v_version_before integer;
  v_version_after integer;
  v_a uuid;
  v_b uuid;
  v_m uuid;
  v_n uuid;
  v_status text;
  v_start timestamptz;
  v_end timestamptz;
  t_ring constant timestamptz := '2026-10-10 13:55:00+00';
  t_score_a constant timestamptz := '2026-10-10 14:00:00+00';
  t_score_b constant timestamptz := '2026-10-10 14:30:00+00';
  t_manual constant timestamptz := '2026-10-10 09:00:00+00';
BEGIN
  INSERT INTO public.shows (id, name, organization, start_date, end_date, is_nationals)
    VALUES (v_show, 'Actual times', 'Test Org', current_date, current_date, false);
  INSERT INTO public.trials (id, show_id, name, date)
    VALUES (v_trial, v_show, 'Trial 1', current_date);
  INSERT INTO public.classes (id, trial_id, name, status)
    VALUES (v_derived, v_trial, 'Derived', 'upcoming'),
           (v_bare, v_trial, 'No timestamps', 'upcoming');
  INSERT INTO public.classes (id, trial_id, name, status, status_source, actual_start_time)
    VALUES (v_manual, v_trial, 'Manual', 'in_progress', 'manual', t_manual);

  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_derived, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending')
    RETURNING id INTO v_a;
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_derived, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending')
    RETURNING id INTO v_b;

  -- AT.1 First dog scored: in_progress, start = its ring entry (earlier than its score).
  UPDATE public.entries
    SET is_scored = true, result_status = 'qualified',
        ring_entry_time = t_ring, scoring_completed_at = t_score_a
    WHERE id = v_a;
  SELECT status, actual_start_time, actual_end_time INTO v_status, v_start, v_end
    FROM public.classes WHERE id = v_derived;
  IF v_status IS DISTINCT FROM 'in_progress' OR v_start IS DISTINCT FROM t_ring OR v_end IS NOT NULL THEN
    RAISE EXCEPTION 'AT.1 FAIL: status %, start %, end %', v_status, v_start, v_end;
  END IF;
  RAISE NOTICE 'AT.1 PASS: first score starts the class at the first ring entry';

  -- AT.2 Last dog scored: completed, start kept, finish = the last score.
  UPDATE public.entries
    SET is_scored = true, result_status = 'qualified', scoring_completed_at = t_score_b
    WHERE id = v_b;
  SELECT status, actual_start_time, actual_end_time INTO v_status, v_start, v_end
    FROM public.classes WHERE id = v_derived;
  IF v_status IS DISTINCT FROM 'completed' OR v_start IS DISTINCT FROM t_ring
     OR v_end IS DISTINCT FROM t_score_b THEN
    RAISE EXCEPTION 'AT.2 FAIL: status %, start %, end %', v_status, v_start, v_end;
  END IF;
  RAISE NOTICE 'AT.2 PASS: last score finishes the class';

  -- AT.3 A score is withdrawn: back to in_progress, finish cleared, start kept.
  UPDATE public.entries
    SET is_scored = false, result_status = 'pending', scoring_completed_at = NULL
    WHERE id = v_b;
  SELECT status, actual_start_time, actual_end_time INTO v_status, v_start, v_end
    FROM public.classes WHERE id = v_derived;
  IF v_status IS DISTINCT FROM 'in_progress' OR v_start IS DISTINCT FROM t_ring OR v_end IS NOT NULL THEN
    RAISE EXCEPTION 'AT.3 FAIL: status %, start %, end %', v_status, v_start, v_end;
  END IF;
  RAISE NOTICE 'AT.3 PASS: reopening clears the finish and keeps the start';

  -- AT.4 Every score withdrawn: back to upcoming, both cleared.
  UPDATE public.entries
    SET is_scored = false, result_status = 'pending', scoring_completed_at = NULL, ring_entry_time = NULL
    WHERE id = v_a;
  SELECT status, actual_start_time, actual_end_time INTO v_status, v_start, v_end
    FROM public.classes WHERE id = v_derived;
  IF v_status IS DISTINCT FROM 'upcoming' OR v_start IS NOT NULL OR v_end IS NOT NULL THEN
    RAISE EXCEPTION 'AT.4 FAIL: status %, start %, end %', v_status, v_start, v_end;
  END IF;
  RAISE NOTICE 'AT.4 PASS: a class back to not started has no timing';

  -- AT.5 A manual class keeps the secretary's start through scoring.
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_manual, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending')
    RETURNING id INTO v_m;
  UPDATE public.entries
    SET is_scored = true, result_status = 'qualified', scoring_completed_at = t_score_a
    WHERE id = v_m;
  SELECT actual_start_time INTO v_start FROM public.classes WHERE id = v_manual;
  IF v_start IS DISTINCT FROM t_manual THEN
    RAISE EXCEPTION 'AT.5 FAIL: manual start overwritten, got %', v_start;
  END IF;
  RAISE NOTICE 'AT.5 PASS: a manually stamped start is never overwritten';

  -- AT.6 No recorded moment on the entry: the start falls back to now().
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_bare, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending')
    RETURNING id INTO v_n;
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_bare, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending');
  UPDATE public.entries SET is_scored = true, result_status = 'qualified' WHERE id = v_n;
  SELECT status, actual_start_time INTO v_status, v_start FROM public.classes WHERE id = v_bare;
  IF v_status IS DISTINCT FROM 'in_progress' OR v_start IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'AT.6 FAIL: status %, start % (now %)', v_status, v_start, now();
  END IF;
  RAISE NOTICE 'AT.6 PASS: with no timestamps the start is the moment of the first score';

  -- AT.7 No-op suppression: a repeat refresh of an in_progress class (start
  -- set) and of a completed class (both set) writes nothing -- no version bump,
  -- so no broadcast or replication churn on every entry change.
  INSERT INTO public.classes (id, trial_id, name, status)
    VALUES (v_done, v_trial, 'Done', 'upcoming');
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_done, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending')
    RETURNING id INTO v_d;
  UPDATE public.entries
    SET is_scored = true, result_status = 'qualified', scoring_completed_at = t_score_a
    WHERE id = v_d;
  SELECT version INTO v_version_before FROM public.classes WHERE id = v_bare;
  PERFORM public.refresh_class_scoring_state(v_bare);
  SELECT version INTO v_version_after FROM public.classes WHERE id = v_bare;
  IF v_version_after IS DISTINCT FROM v_version_before THEN
    RAISE EXCEPTION 'AT.7 FAIL: in_progress no-op rewrote the class (version % -> %)',
      v_version_before, v_version_after;
  END IF;
  SELECT version INTO v_version_before FROM public.classes WHERE id = v_done;
  PERFORM public.refresh_class_scoring_state(v_done);
  SELECT version INTO v_version_after FROM public.classes WHERE id = v_done;
  IF v_version_after IS DISTINCT FROM v_version_before THEN
    RAISE EXCEPTION 'AT.7 FAIL: completed no-op rewrote the class (version % -> %)',
      v_version_before, v_version_after;
  END IF;
  RAISE NOTICE 'AT.7 PASS: a repeat refresh writes nothing';

  -- AT.8 Every dog absent: completed with a start and a finish, finish >= start.
  INSERT INTO public.classes (id, trial_id, name, status)
    VALUES (v_absent_class, v_trial, 'All absent', 'upcoming');
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_absent_class, v_show, v_trial, 'checked-in', 'checked-in', false, 'absent');
  SELECT status, actual_start_time, actual_end_time INTO v_status, v_start, v_end
    FROM public.classes WHERE id = v_absent_class;
  IF v_status IS DISTINCT FROM 'completed' OR v_start IS NULL OR v_end IS NULL OR v_end < v_start THEN
    RAISE EXCEPTION 'AT.8 FAIL: status %, start %, end %', v_status, v_start, v_end;
  END IF;
  RAISE NOTICE 'AT.8 PASS: an all-absent class completes with timing';

  -- AT.9 Its only entry withdrawn: no expected entries, upcoming, timing cleared.
  UPDATE public.entries SET entry_status = 'withdrawn' WHERE id = v_d;
  SELECT status, actual_start_time, actual_end_time INTO v_status, v_start, v_end
    FROM public.classes WHERE id = v_done;
  IF v_status IS DISTINCT FROM 'upcoming' OR v_start IS NOT NULL OR v_end IS NOT NULL THEN
    RAISE EXCEPTION 'AT.9 FAIL: status %, start %, end %', v_status, v_start, v_end;
  END IF;
  RAISE NOTICE 'AT.9 PASS: an emptied class has no timing';
END;
$$;

ROLLBACK;
