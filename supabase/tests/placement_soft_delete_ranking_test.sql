-- Behavioral test for placement ranking vs. soft-deleted entries
-- (20260817120000_placement_ranking_ignores_soft_deleted_entries.sql).
--
-- recalculate_class_placements ranked with ROW_NUMBER() over every scored +
-- qualified entry in the class, without filtering entries.deleted_at. A
-- soft-deleted entry therefore consumed a rank slot and pushed every live
-- entry below it down by one (1, 2, 3 -> soft-delete the 2nd -> survivors
-- placed 1 and 3 instead of 1 and 2).
--
-- Runs as ONE transaction that seeds minimal fixtures, exercises each behavior,
-- RAISEs EXCEPTION on any failed assertion, and ROLLBACKs so nothing persists.
-- The orchestrator runs it against a locally migrated database, e.g.:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/placement_soft_delete_ranking_test.sql
-- A clean run prints "N.x PASS ..." lines and ends with ROLLBACK; any failure
-- aborts with a labeled exception. The migration must already be applied.

BEGIN;

-- Silence the push webhooks for the test transaction (rolled back with the txn).
ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_status_push;
ALTER TABLE public.entries DISABLE TRIGGER trg_notify_entry_scoring_push;

DO $$
DECLARE
  v_show     uuid := gen_random_uuid();  -- regular (faults/time) ranking
  v_trial    uuid := gen_random_uuid();
  v_class    uuid := gen_random_uuid();
  v_e1 uuid := gen_random_uuid();  -- fastest  -> 1st
  v_e2 uuid := gen_random_uuid();  -- middle   -> 2nd, soft-deleted mid-test
  v_e3 uuid := gen_random_uuid();  -- slowest  -> 3rd, must become 2nd

  v_nat_show  uuid := gen_random_uuid();  -- nationals (points/time) ranking
  v_nat_trial uuid := gen_random_uuid();
  v_nat_class uuid := gen_random_uuid();
  v_n1 uuid := gen_random_uuid();  -- most points -> 1st
  v_n2 uuid := gen_random_uuid();  -- middle      -> 2nd, soft-deleted mid-test
  v_n3 uuid := gen_random_uuid();  -- fewest      -> 3rd, must become 2nd

  v_p1 integer;
  v_p2 integer;
  v_p3 integer;
  v_status text;
  v_dupes integer;
BEGIN
  -- =====================================================================
  -- Fixtures. Three qualified, scored entries per class so the class
  -- derives to 'completed' and refresh_class_scoring_state calls
  -- recalculate_class_placements.
  -- =====================================================================
  INSERT INTO public.shows (id, name, organization, start_date, end_date, is_nationals)
    VALUES (v_show, 'Placement Soft-Delete Show', 'Test Org', current_date, current_date, false);
  INSERT INTO public.trials (id, show_id, name, date)
    VALUES (v_trial, v_show, 'Trial 1', current_date);
  INSERT INTO public.classes (id, trial_id, name, status)
    VALUES (v_class, v_trial, 'Regular Class', 'upcoming');

  INSERT INTO public.entries
    (id, class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status, total_faults, search_time_seconds)
  VALUES
    (v_e1, v_class, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified', 0, 38.50),
    (v_e2, v_class, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified', 0, 41.20),
    (v_e3, v_class, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified', 0, 45.80);

  -- =====================================================================
  -- 1.1 Baseline: all three live -> 1, 2, 3 by ascending search time.
  --     Guards the fixture itself; if this fails the class never completed
  --     and the rest of the file would pass vacuously.
  -- =====================================================================
  SELECT status INTO v_status FROM public.classes WHERE id = v_class;
  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION '1.1 SETUP FAIL: class did not derive to completed, got %', v_status;
  END IF;

  SELECT final_placement INTO v_p1 FROM public.entries WHERE id = v_e1;
  SELECT final_placement INTO v_p2 FROM public.entries WHERE id = v_e2;
  SELECT final_placement INTO v_p3 FROM public.entries WHERE id = v_e3;
  IF (v_p1, v_p2, v_p3) IS DISTINCT FROM (1, 2, 3) THEN
    RAISE EXCEPTION '1.1 SETUP FAIL: expected baseline 1/2/3, got %/%/%', v_p1, v_p2, v_p3;
  END IF;
  RAISE NOTICE '1.1 PASS: baseline regular ranking is 1/2/3';

  -- =====================================================================
  -- 1.2 Soft-deleting the 2nd-placed entry closes the gap: the survivors
  --     must be 1 and 2, NOT 1 and 3. This is the regression under test.
  -- =====================================================================
  UPDATE public.entries SET deleted_at = now() WHERE id = v_e2;

  SELECT final_placement INTO v_p1 FROM public.entries WHERE id = v_e1;
  SELECT final_placement INTO v_p3 FROM public.entries WHERE id = v_e3;
  IF v_p1 IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '1.2 FAIL: first-placed entry should stay 1st, got %', v_p1;
  END IF;
  IF v_p3 IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION
      '1.2 FAIL: entry below a soft-deleted one should move up to 2nd, got % '
      '(a tombstoned entry is still consuming a ROW_NUMBER slot)', v_p3;
  END IF;
  RAISE NOTICE '1.2 PASS: soft-deleted entry no longer consumes a rank slot (survivors 1/2)';

  -- =====================================================================
  -- 1.3 The soft-deleted entry is left unplaced. The stale-clearing UPDATE
  --     deliberately still touches tombstoned rows: if it skipped them the
  --     deleted entry would keep placement 2 while the live entry is
  --     reassigned 2, and view_entry_with_results / view_myk9q_entries /
  --     view_stats_summary do not filter deleted_at.
  -- =====================================================================
  SELECT final_placement INTO v_p2 FROM public.entries WHERE id = v_e2;
  IF v_p2 IS NOT NULL THEN
    RAISE EXCEPTION '1.3 FAIL: soft-deleted entry kept a stale placement of %', v_p2;
  END IF;

  SELECT count(*) INTO v_dupes
  FROM (
    SELECT final_placement
    FROM public.entries
    WHERE class_id = v_class AND final_placement IS NOT NULL
    GROUP BY final_placement
    HAVING count(*) > 1
  ) d;
  IF v_dupes <> 0 THEN
    RAISE EXCEPTION '1.3 FAIL: % duplicated placement value(s) in the class', v_dupes;
  END IF;
  RAISE NOTICE '1.3 PASS: soft-deleted entry unplaced, no duplicate placements';

  -- =====================================================================
  -- 1.4 Restoring the entry restores the original ranking. The entries
  --     trigger fires on deleted_at, so the recalculation is automatic.
  -- =====================================================================
  UPDATE public.entries SET deleted_at = NULL WHERE id = v_e2;

  SELECT final_placement INTO v_p1 FROM public.entries WHERE id = v_e1;
  SELECT final_placement INTO v_p2 FROM public.entries WHERE id = v_e2;
  SELECT final_placement INTO v_p3 FROM public.entries WHERE id = v_e3;
  IF (v_p1, v_p2, v_p3) IS DISTINCT FROM (1, 2, 3) THEN
    RAISE EXCEPTION '1.4 FAIL: restore did not re-rank to 1/2/3, got %/%/%', v_p1, v_p2, v_p3;
  END IF;
  RAISE NOTICE '1.4 PASS: restoring a soft-deleted entry re-ranks it back in';

  -- =====================================================================
  -- 2.1 The nationals branch (points DESC, then time) has the same filter.
  --     Both ranking branches are separate UPDATEs; fixing one is not
  --     evidence for the other.
  -- =====================================================================
  INSERT INTO public.shows (id, name, organization, start_date, end_date, is_nationals)
    VALUES (v_nat_show, 'Placement Nationals Show', 'Test Org', current_date, current_date, true);
  INSERT INTO public.trials (id, show_id, name, date)
    VALUES (v_nat_trial, v_nat_show, 'Nationals Trial', current_date);
  INSERT INTO public.classes (id, trial_id, name, status)
    VALUES (v_nat_class, v_nat_trial, 'Nationals Class', 'upcoming');

  INSERT INTO public.entries
    (id, class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status, points_earned, search_time_seconds)
  VALUES
    (v_n1, v_nat_class, v_nat_show, v_nat_trial, 'checked-in', 'checked-in', true, 'qualified', 100, 38.50),
    (v_n2, v_nat_class, v_nat_show, v_nat_trial, 'checked-in', 'checked-in', true, 'qualified',  90, 41.20),
    (v_n3, v_nat_class, v_nat_show, v_nat_trial, 'checked-in', 'checked-in', true, 'qualified',  80, 45.80);

  SELECT final_placement INTO v_p1 FROM public.entries WHERE id = v_n1;
  SELECT final_placement INTO v_p2 FROM public.entries WHERE id = v_n2;
  SELECT final_placement INTO v_p3 FROM public.entries WHERE id = v_n3;
  IF (v_p1, v_p2, v_p3) IS DISTINCT FROM (1, 2, 3) THEN
    RAISE EXCEPTION '2.1 SETUP FAIL: expected nationals baseline 1/2/3, got %/%/%', v_p1, v_p2, v_p3;
  END IF;
  RAISE NOTICE '2.1 PASS: baseline nationals ranking is 1/2/3';

  -- =====================================================================
  -- 2.2 Same gap-closing behavior on the nationals branch.
  -- =====================================================================
  UPDATE public.entries SET deleted_at = now() WHERE id = v_n2;

  SELECT final_placement INTO v_p1 FROM public.entries WHERE id = v_n1;
  SELECT final_placement INTO v_p2 FROM public.entries WHERE id = v_n2;
  SELECT final_placement INTO v_p3 FROM public.entries WHERE id = v_n3;
  IF v_p1 IS DISTINCT FROM 1 OR v_p3 IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION
      '2.2 FAIL: nationals survivors should be 1 and 2, got % and %', v_p1, v_p3;
  END IF;
  IF v_p2 IS NOT NULL THEN
    RAISE EXCEPTION '2.2 FAIL: soft-deleted nationals entry kept a stale placement of %', v_p2;
  END IF;
  RAISE NOTICE '2.2 PASS: nationals branch also skips soft-deleted entries';

  -- =====================================================================
  -- KNOWN GAP (pre-existing, deliberately not closed here).
  --
  -- "A soft-deleted entry is left unplaced" holds whenever
  -- recalculate_class_placements actually runs. It does not hold when the
  -- deletion empties the class: refresh_class_scoring_state tests
  -- `v_expected_count = 0` BEFORE the fully-accounted branch, so deleting the
  -- last live entry takes the terminal branch, never calls the ranking
  -- function, and clears only `deleted_at IS NULL` rows -- leaving the
  -- tombstone holding its old placement.
  --
  -- Unchanged by this migration: the same sequence produced the same result
  -- before it. It is not fixed here because dropping the caller's deleted_at
  -- filter would make the tombstone -- which is the very row the outer
  -- statement just updated -- eligible for a nested same-row UPDATE from the
  -- AFTER trigger, the failure mode 20260727235900 was written to remove
  -- after it stalled ringside_update_entry. That needs its own change with
  -- its own ringside regression coverage.
  -- =====================================================================

  RAISE NOTICE 'ALL placement soft-delete ranking assertions passed.';
END $$;

ROLLBACK;
