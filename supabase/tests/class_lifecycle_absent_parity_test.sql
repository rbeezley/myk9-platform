-- MYK9-356: exercise installed automatic derivation and both TV functions.
-- Run only via the disposable, fully migrated loopback SQL harness.
BEGIN;
ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_status_push;
ALTER TABLE public.entries DISABLE TRIGGER trg_notify_entry_scoring_push;

DO $$
DECLARE
  v_show uuid := gen_random_uuid();
  v_trial uuid := gen_random_uuid();
  v_class uuid := gen_random_uuid();
  v_empty uuid := gen_random_uuid();
  v_scored uuid;
  v_absent uuid;
  v_status text;
  v_placement integer;
  v_count bigint;
  v_scored_count bigint;
BEGIN
  INSERT INTO public.shows (id, name, organization, start_date, end_date, is_nationals, status)
  VALUES (v_show, 'Absent parity', 'Test Org', current_date, current_date, false, 'published');
  INSERT INTO public.trials (id, show_id, name, date)
  VALUES (v_trial, v_show, 'Trial', current_date);
  INSERT INTO public.classes (id, trial_id, name, status)
  VALUES (v_class, v_trial, 'Lifecycle absent', 'upcoming'),
         (v_empty, v_trial, 'Excluded only', 'upcoming');
  INSERT INTO public.entries
    (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status,
     total_faults, search_time_seconds)
  VALUES (v_class, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified', 0, 38.5)
  RETURNING id INTO v_scored;
  INSERT INTO public.entries
    (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
  VALUES (v_class, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending')
  RETURNING id INTO v_absent;
  SELECT status INTO v_status FROM public.classes WHERE id = v_class;
  IF v_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'MYK9-356 setup: pending active entry must block completion';
  END IF;

  UPDATE public.entries SET entry_status = 'absent' WHERE id = v_absent;
  SELECT status INTO v_status FROM public.classes WHERE id = v_class;
  SELECT final_placement INTO v_placement FROM public.entries WHERE id = v_scored;
  IF v_status IS DISTINCT FROM 'completed' OR v_placement IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'MYK9-356 lifecycle absent: status %, placement %', v_status, v_placement;
  END IF;
  SELECT entry_count, scored_count INTO v_count, v_scored_count
  FROM public.tv_class_entry_counts(v_show, ARRAY[v_class]);
  IF v_count IS DISTINCT FROM 1 OR v_scored_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'MYK9-356 TV expected/scored: %/%', v_count, v_scored_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.tv_board_entries(v_show, ARRAY[v_class]);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'MYK9-356 TV board exposed lifecycle absent';
  END IF;

  -- Active lifecycle with absent RESULT remains expected and accounted.
  UPDATE public.entries SET entry_status = 'checked-in', result_status = 'absent'
  WHERE id = v_absent;
  SELECT status INTO v_status FROM public.classes WHERE id = v_class;
  SELECT entry_count INTO v_count FROM public.tv_class_entry_counts(v_show, ARRAY[v_class]);
  IF v_status IS DISTINCT FROM 'completed' OR v_count IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'MYK9-356 active result absent: status %, count %', v_status, v_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tv_board_entries(v_show, ARRAY[v_class]) WHERE id = v_absent) THEN
    RAISE EXCEPTION 'MYK9-356 TV board must retain active result absent';
  END IF;

  INSERT INTO public.entries
    (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
  VALUES (v_empty, v_show, v_trial, 'absent', 'no-status', false, 'pending');
  SELECT status INTO v_status FROM public.classes WHERE id = v_empty;
  IF v_status IS DISTINCT FROM 'upcoming' THEN
    RAISE EXCEPTION 'MYK9-356 excluded-only fabricated completion: %', v_status;
  END IF;

  -- An excluded INSERT must not clear a manual closeout marker.
  UPDATE public.classes SET status = 'completed', status_source = 'manual' WHERE id = v_class;
  INSERT INTO public.entries
    (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
  VALUES (v_class, v_show, v_trial, 'absent', 'no-status', false, 'pending');
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = v_class AND status_source = 'manual') THEN
    RAISE EXCEPTION 'MYK9-356 absent INSERT cleared manual closeout';
  END IF;
  RAISE NOTICE 'MYK9-356 lifecycle absent parity PASS';
END $$;
ROLLBACK;
