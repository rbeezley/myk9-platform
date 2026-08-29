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
  v_c7 uuid := gen_random_uuid();  -- 3.6 manually-STARTED class not reopened by late entry
  v_c8 uuid := gen_random_uuid();  -- 3.7 DELETE of unscored entry completes class
  v_c9 uuid := gen_random_uuid();  -- 3.8 ordinary check-in must not rewrite the class row
  v_before_updated timestamptz;
  v_after_updated timestamptz;
  v_before_version integer;
  v_after_version integer;
  v_before_scored integer;
  v_e uuid;
  v_status text;
  v_source text;
  v_reopened timestamptz;
  v_scored integer;
BEGIN
  -- Shared parent rows (minimal NOT NULL columns only).
  INSERT INTO public.shows (id, name, organization, start_date, end_date, is_nationals)
    VALUES (v_show, 'Test Show', 'Test Org', current_date, current_date, false);
  INSERT INTO public.trials (id, show_id, name, date)
    VALUES (v_trial, v_show, 'Trial 1', current_date);

  INSERT INTO public.classes (id, trial_id, name, status)
    VALUES (v_c1, v_trial, 'C1', 'upcoming'),
           (v_c2, v_trial, 'C2', 'upcoming'),
           (v_c3, v_trial, 'C3', 'upcoming'),
           (v_c4, v_trial, 'C4', 'upcoming'),
           (v_c5, v_trial, 'C5', 'upcoming'),
           (v_c6, v_trial, 'C6', 'upcoming'),
           (v_c7, v_trial, 'C7', 'upcoming'),
           (v_c8, v_trial, 'C8', 'upcoming');

  -- =====================================================================
  -- 3.1 Scratched dog does not block completion.
  --     2 scored qualified + 1 scratched -> class completes.
  -- =====================================================================
-- `trg_entries_require_dog_registration` (20260828210000) refuses an entry whose dog
-- holds no registration for the trial's registry. These fixtures predate that rule
-- and are about something else entirely, so give every dog an AKC number -- every
-- trial in this file is AKC -- rather than reshaping the test around it.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC (American Kennel Club)', 'SR' || upper(substr(md5(d.id::text), 1, 8)), true
FROM public.dogs d
WHERE NOT EXISTS (
  SELECT 1 FROM public.dog_registrations r WHERE r.dog_id = d.id
);

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

  -- =====================================================================
  -- 3.6 A manually-STARTED class (in_progress + status_source='manual') is
  --     NOT reopened by a routine late expected-entry INSERT. The reopen
  --     guard keys on closeout ('completed') only, so the manual marker and
  --     reopened_after_closeout_at must survive. (Review finding 3 regression.)
  -- =====================================================================
  -- Seed one expected, unscored entry while derived (class stays upcoming).
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c7, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending');

  -- Secretary manually marks the class started (Mark Started).
  UPDATE public.classes
    SET status = 'in_progress', status_source = 'manual'
    WHERE id = v_c7;

  -- A late expected entry arrives (routine late registration / move-up target).
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c7, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending');

  SELECT status, status_source, reopened_after_closeout_at
    INTO v_status, v_source, v_reopened
    FROM public.classes WHERE id = v_c7;
  IF v_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION '3.6 FAIL: manually-started class status changed, got %', v_status;
  END IF;
  IF v_source IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION '3.6 FAIL: manual marker cleared by late entry, status_source=%', v_source;
  END IF;
  IF v_reopened IS NOT NULL THEN
    RAISE EXCEPTION '3.6 FAIL: false reopened_after_closeout_at stamp on non-closed class';
  END IF;
  RAISE NOTICE '3.6 PASS: manually-started class not reopened by late entry (status=%, source=%, reopened NULL)', v_status, v_source;

  -- =====================================================================
  -- 3.7 DELETE path: a class with 1 scored + 1 unscored expected entry is
  --     in_progress; deleting the unscored entry accounts-for all remaining
  --     expected, so the DELETE trigger derives the class to 'completed'.
  -- =====================================================================
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c8, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified');
  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c8, v_show, v_trial, 'checked-in', 'checked-in', false, 'pending')
    RETURNING id INTO v_e;

  SELECT status INTO v_status FROM public.classes WHERE id = v_c8;
  IF v_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION '3.7 SETUP FAIL: expected in_progress before delete, got %', v_status;
  END IF;

  -- Remove the unscored expected entry -> all remaining expected accounted-for.
  DELETE FROM public.entries WHERE id = v_e;

  SELECT status INTO v_status FROM public.classes WHERE id = v_c8;
  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION '3.7 FAIL: DELETE did not re-derive class to completed, got %', v_status;
  END IF;
  RAISE NOTICE '3.7 PASS: DELETE of unscored entry completes class (status=%)', v_status;

  -- =====================================================================
  -- 3.8 MYK9-248: an ordinary check-in transition must not rewrite the
  --     class row.
  --
  --     `check_in_status` reaches refresh_class_scoring_state through only one
  --     predicate — `check_in_status IS DISTINCT FROM 'pulled'` — so the six
  --     non-pulled values are interchangeable to every count it computes. A
  --     transition among them therefore cannot change status or scored_count,
  --     yet the trigger fires and the function rewrites the class row anyway.
  --
  --     That rewrite is not free: `classes` carries an unconditional realtime
  --     broadcast, a replication version increment and an updated_at bump, and
  --     it takes a row-exclusive lock the judge scoring that class must queue
  --     behind. Asserting updated_at and version are unchanged is what proves
  --     the write was actually suppressed rather than merely made idempotent.
  -- =====================================================================
  INSERT INTO public.classes (id, trial_id, name, level, element, judge_name,
                              entry_fee, status, time_limit_seconds, num_areas,
                              display_order, version)
    VALUES (v_c9, v_trial, '3.8 Check-in Churn', 'Novice', 'Container', 'Test Judge',
            30.00, 'upcoming', 120, 1, 9, 1);

  INSERT INTO public.entries (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status)
    VALUES (v_c9, v_show, v_trial, 'confirmed', 'no-status', false, 'pending')
    RETURNING id INTO v_e;

  SELECT updated_at, version, scored_count
    INTO v_before_updated, v_before_version, v_before_scored
    FROM public.classes WHERE id = v_c9;

  -- The ordinary progression a dog walks through at a show.
  UPDATE public.entries SET check_in_status = 'checked-in' WHERE id = v_e;
  UPDATE public.entries SET check_in_status = 'at-gate' WHERE id = v_e;
  UPDATE public.entries SET check_in_status = 'come-to-gate' WHERE id = v_e;
  UPDATE public.entries SET check_in_status = 'in-ring' WHERE id = v_e;

  SELECT updated_at, version, scored_count
    INTO v_after_updated, v_after_version, v_scored
    FROM public.classes WHERE id = v_c9;

  IF v_scored IS DISTINCT FROM v_before_scored THEN
    RAISE EXCEPTION '3.8 FAIL: ordinary check-in changed scored_count (% -> %)',
      v_before_scored, v_scored;
  END IF;
  IF v_after_version IS DISTINCT FROM v_before_version THEN
    RAISE EXCEPTION '3.8 FAIL: ordinary check-in bumped classes.version (% -> %) — the class row was rewritten and a replication delta published for a no-op',
      v_before_version, v_after_version;
  END IF;
  IF v_after_updated IS DISTINCT FROM v_before_updated THEN
    RAISE EXCEPTION '3.8 FAIL: ordinary check-in bumped classes.updated_at (% -> %) — every replicating device will re-pull this class for a write that changed nothing',
      v_before_updated, v_after_updated;
  END IF;
  RAISE NOTICE '3.8 PASS: ordinary check-in left the class row untouched (version=%, scored=%)',
    v_after_version, v_scored;

  -- =====================================================================
  -- 3.9 MYK9-248: a transition into 'pulled' MUST still re-derive.
  --     This is the one check_in_status value the rollup reads, so
  --     narrowing the trigger must not narrow it away.
  -- =====================================================================
  UPDATE public.entries SET check_in_status = 'pulled' WHERE id = v_e;

  SELECT status INTO v_status FROM public.classes WHERE id = v_c9;
  IF v_status IS DISTINCT FROM 'upcoming' THEN
    RAISE EXCEPTION '3.9 FAIL: pulling the only expected entry left status=%, expected upcoming', v_status;
  END IF;
  RAISE NOTICE '3.9 PASS: transition into pulled still re-derived (status=%)', v_status;

  -- =====================================================================
  -- 3.10 MYK9-248: a transition OUT of 'pulled' must re-derive too.
  --      Guarding only one direction would leave a class stuck.
  -- =====================================================================
  UPDATE public.entries
    SET check_in_status = 'checked-in', is_scored = true, result_status = 'qualified'
    WHERE id = v_e;

  SELECT status INTO v_status FROM public.classes WHERE id = v_c9;
  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION '3.10 FAIL: un-pulling and scoring the entry left status=%, expected completed', v_status;
  END IF;
  RAISE NOTICE '3.10 PASS: transition out of pulled re-derived (status=%)', v_status;

  RAISE NOTICE 'ALL class-status-auto-derivation assertions passed.';
END $$;

ROLLBACK;
