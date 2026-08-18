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

  RAISE NOTICE 'ALL ranking assertions passed (sections 1-2).';
END $$;

-- =====================================================================
-- 3. The empty-class boundary.
--
-- "A soft-deleted entry is left unplaced" used to hold only when
-- recalculate_class_placements actually ran. It did not when the deletion
-- emptied the class: refresh_class_scoring_state tests `v_expected_count = 0`
-- BEFORE the fully-accounted branch, so deleting the last live entry took the
-- terminal branch, never called the ranking function, and cleared only
-- `deleted_at IS NULL` rows -- leaving the tombstone holding its old placement,
-- visible through view_entry_with_results / view_myk9q_entries /
-- view_stats_summary, none of which filter deleted_at.
--
-- Closed by 20260817140000_clear_placement_on_soft_deleted_entries.sql, which
-- drops `AND deleted_at IS NULL` from the three terminal clears while keeping
-- the `AND final_placement IS NOT NULL` guard that bounds them. Section 4
-- asserts that guard is still doing its job.
-- =====================================================================
DO $$
DECLARE
  v_show  uuid := gen_random_uuid();
  v_trial uuid := gen_random_uuid();
  v_class uuid := gen_random_uuid();
  v_only  uuid := gen_random_uuid();
  v_second uuid := gen_random_uuid();
  v_third  uuid := gen_random_uuid();
  v_status text;
  v_p integer;
  v_p2 integer;
BEGIN
  INSERT INTO public.shows (id, name, organization, start_date, end_date, is_nationals)
    VALUES (v_show, 'Placement Empty-Class Show', 'Test Org', current_date, current_date, false);
  INSERT INTO public.trials (id, show_id, name, date)
    VALUES (v_trial, v_show, 'Empty Trial', current_date);
  INSERT INTO public.classes (id, trial_id, name, status)
    VALUES (v_class, v_trial, 'Sole Entry Class', 'upcoming');

  INSERT INTO public.entries
    (id, class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status, total_faults, search_time_seconds)
  VALUES
    (v_only, v_class, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified', 0, 38.50);

  -- 3.1 A single scored qualifier completes the class and places 1st. Guards
  --     the fixture: without this, 3.2 could pass because nothing was ever placed.
  SELECT status FROM public.classes WHERE id = v_class INTO v_status;
  SELECT final_placement FROM public.entries WHERE id = v_only INTO v_p;
  IF v_status IS DISTINCT FROM 'completed' OR v_p IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '3.1 SETUP FAIL: expected completed/1, got %/%', v_status, v_p;
  END IF;
  RAISE NOTICE '3.1 PASS: sole scored qualifier completes the class and places 1st';

  -- 3.2 Soft-deleting the ONLY live entry empties the class. The class reverts
  --     to upcoming (v_expected_count = 0) and the tombstone must not keep the
  --     placement it held while the class was complete.
  UPDATE public.entries SET deleted_at = now() WHERE id = v_only;

  SELECT status FROM public.classes WHERE id = v_class INTO v_status;
  SELECT final_placement FROM public.entries WHERE id = v_only INTO v_p;
  IF v_status IS DISTINCT FROM 'upcoming' THEN
    RAISE EXCEPTION '3.2 SETUP FAIL: emptied class should revert to upcoming, got %', v_status;
  END IF;
  IF v_p IS NOT NULL THEN
    RAISE EXCEPTION
      '3.2 FAIL: emptying the class left the tombstone placed %th -- the terminal '
      'branch is still clearing only deleted_at IS NULL rows', v_p;
  END IF;
  RAISE NOTICE '3.2 PASS: emptying a completed class leaves its tombstone unplaced';

  -- 3.3 Restoring the entry re-completes the class and re-places it. Proves 3.2
  --     clears rather than permanently strands the row.
  UPDATE public.entries SET deleted_at = NULL WHERE id = v_only;
  SELECT status FROM public.classes WHERE id = v_class INTO v_status;
  SELECT final_placement FROM public.entries WHERE id = v_only INTO v_p;
  IF v_status IS DISTINCT FROM 'completed' OR v_p IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '3.3 FAIL: restore did not re-complete/re-place, got %/%', v_status, v_p;
  END IF;
  RAISE NOTICE '3.3 PASS: restoring the sole entry re-completes and re-places it';

  -- 3.4 The ELSE branch: expected > 0 but accounted = 0. Tombstone the 2nd,
  --     then un-score the survivor. Deleting v_second leaves v_only as the sole
  --     scored live entry, so the class stays FULLY ACCOUNTED across that step
  --     and recalculate_class_placements already strips v_second -- this case
  --     therefore proves nothing about tombstones, only that the ELSE branch
  --     clears the live row. Labelled accordingly; 3.5 covers the partial
  --     branch and section 5 covers a tombstone that survives to a clear.
  INSERT INTO public.entries
    (id, class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status, total_faults, search_time_seconds)
  VALUES
    (v_second, v_class, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified', 0, 44.10);

  SELECT final_placement FROM public.entries WHERE id = v_second INTO v_p2;
  IF v_p2 IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION '3.4 SETUP FAIL: second entry should place 2nd, got %', v_p2;
  END IF;

  UPDATE public.entries SET deleted_at = now() WHERE id = v_second;
  UPDATE public.entries SET is_scored = false, result_status = NULL WHERE id = v_only;

  SELECT status FROM public.classes WHERE id = v_class INTO v_status;
  SELECT final_placement FROM public.entries WHERE id = v_only INTO v_p;
  SELECT final_placement FROM public.entries WHERE id = v_second INTO v_p2;
  IF v_status IS DISTINCT FROM 'upcoming' THEN
    RAISE EXCEPTION '3.4 SETUP FAIL: expected the ELSE branch (upcoming), got %', v_status;
  END IF;
  IF v_p IS NOT NULL OR v_p2 IS NOT NULL THEN
    RAISE EXCEPTION
      '3.4 FAIL: ELSE branch left placements attached live=% tombstone=%', v_p, v_p2;
  END IF;
  RAISE NOTICE '3.4 PASS: the accounted = 0 branch clears placements';

  -- 3.5 The PARTIAL branch, 0 < v_accounted_count < v_expected_count. 3.4 never
  --     reaches it, so a regression confined to this branch would have slipped
  --     through. Re-complete the class with two live entries, then un-score one
  --     so exactly one of two remains accounted.
  UPDATE public.entries
    SET is_scored = true, result_status = 'qualified', total_faults = 0, search_time_seconds = 30.0
    WHERE id = v_only;
  INSERT INTO public.entries
    (id, class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status, total_faults, search_time_seconds)
  VALUES
    (v_third, v_class, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified', 0, 35.0);

  SELECT status FROM public.classes WHERE id = v_class INTO v_status;
  SELECT final_placement FROM public.entries WHERE id = v_only INTO v_p;
  SELECT final_placement FROM public.entries WHERE id = v_third INTO v_p2;
  IF v_status IS DISTINCT FROM 'completed' OR v_p IS DISTINCT FROM 1 OR v_p2 IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION '3.5 SETUP FAIL: expected completed with 1/2, got %/%/%', v_status, v_p, v_p2;
  END IF;

  UPDATE public.entries SET is_scored = false, result_status = NULL WHERE id = v_third;

  SELECT status FROM public.classes WHERE id = v_class INTO v_status;
  SELECT final_placement FROM public.entries WHERE id = v_only INTO v_p;
  SELECT final_placement FROM public.entries WHERE id = v_third INTO v_p2;
  IF v_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION
      '3.5 SETUP FAIL: expected the partial branch (in_progress), got % -- this '
      'case is not exercising v_accounted_count > 0', v_status;
  END IF;
  IF v_p IS NOT NULL OR v_p2 IS NOT NULL THEN
    RAISE EXCEPTION '3.5 FAIL: partial branch left placements attached %/%', v_p, v_p2;
  END IF;
  RAISE NOTICE '3.5 PASS: the partial (in_progress) branch clears placements';
END $$;


-- =====================================================================
-- 4. The guard 20260817140000 had to preserve: a show-desk check-in must not
--    rewrite the whole class.
--
-- 20260727235900_avoid_null_placement_noop_updates.sql fixed a check-in that
-- hung inside ringside_update_entry until the client timed out. Its guard is
-- `AND final_placement IS NOT NULL` on the terminal clears. Without it the
-- clear matched EVERY live entry in the class on every refresh, and each
-- matched row pays for the all-column triggers on public.entries --
-- increment_replication_version, update_updated_at_column and
-- broadcast_entries_showday_change, which calls realtime.send() per row -- as
-- well as holding a row lock on all of them for the rest of the transaction.
--
-- 20260817140000 removes the deleted_at predicate from those clears but keeps
-- that guard. This section pins the resulting property through the real
-- show-day path: a version-correct check-in via ringside_update_entry on a
-- derived-status class must leave every OTHER entry in the class byte-identical.
-- entries.version is maintained by the increment_replication_version BEFORE
-- UPDATE trigger, so an unchanged version is proof the row was never written.
-- =====================================================================
reset role;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000178001', 'Placement Guard Club');
insert into public.people (id, first_name, last_name, auth_user_id)
values ('00000000-0000-0000-0000-000000178002', 'Guard', 'Admin',
        '00000000-0000-0000-0000-000000178003');
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000178002', r.id, true,
       '00000000-0000-0000-0000-000000178003'
from public.roles r where r.name = 'site_admin';

insert into public.shows (id, name, organization, start_date, end_date, club_id, status, is_nationals)
values ('00000000-0000-0000-0000-000000178004', 'Placement Guard Show', 'AKC',
        current_date, current_date, '00000000-0000-0000-0000-000000178001', 'published', false);
insert into public.trials (id, show_id, name, date)
values ('00000000-0000-0000-0000-000000178005', '00000000-0000-0000-0000-000000178004',
        'Guard Trial', current_date);
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000178006', '00000000-0000-0000-0000-000000178005',
        'Container Novice A', 'upcoming');

-- Six UNSCORED entries: the exact shape from the original incident, a
-- derived-status class where every final_placement is already NULL.
insert into public.entries (id, class_id, show_id, trial_id, entry_status, check_in_status, is_scored)
select ('00000000-0000-0000-0000-0000001780' || lpad((10 + i)::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000178006',
       '00000000-0000-0000-0000-000000178004',
       '00000000-0000-0000-0000-000000178005',
       'confirmed', 'no-status', false
from generate_series(1, 6) as i;

-- public.entries grants authenticated only a column allowlist, no table-level
-- SELECT, so the versions must be captured as postgres before the role switch.
create temporary table myk9_178_guard (entry_id uuid primary key, version integer) on commit drop;
grant select, insert on myk9_178_guard to authenticated;
insert into myk9_178_guard (entry_id, version)
select id, version from public.entries
 where class_id = '00000000-0000-0000-0000-000000178006';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000178003', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000178003","role":"authenticated"}', true);

do $$
declare
  v_target uuid := '00000000-0000-0000-0000-000000178011';
  v_version integer;
  v_new_version integer;
begin
  select version into strict v_version from myk9_178_guard where entry_id = v_target;

  -- The show-desk check-in itself. check_in_status is in the trigger's UPDATE OF
  -- column list, so this fires handle_entry_scoring_state_change ->
  -- refresh_class_scoring_state -> the terminal clear under test.
  v_new_version := public.ringside_update_entry(
    v_target,
    jsonb_build_object('check_in_status', 'checked-in'),
    v_version
  );
  if v_new_version is null or v_new_version <= v_version then
    raise exception '4.1 FAIL: check-in did not land (version % -> %)', v_version, v_new_version;
  end if;
  raise notice '4.1 PASS: version-correct check-in landed through ringside_update_entry';
end;
$$;

reset role;

do $$
declare
  v_target uuid := '00000000-0000-0000-0000-000000178011';
  v_touched integer;
  v_status text;
begin
  -- 4.2 THE REGRESSION ASSERTION. Every entry except the checked-in one must
  --     still be at the version captured before the write. A non-zero count
  --     means the terminal clear went class-wide again and the ringside stall
  --     20260727235900 fixed is back.
  select count(*) into v_touched
    from public.entries e
    join myk9_178_guard g on g.entry_id = e.id
   where e.id <> v_target
     and e.version is distinct from g.version;

  if v_touched <> 0 then
    raise exception
      '4.2 FAIL: a single check-in rewrote % sibling row(s) in the class -- the '
      'final_placement IS NOT NULL guard on the terminal clear is gone', v_touched;
  end if;
  raise notice '4.2 PASS: check-in touched 0 sibling rows (class-wide no-op write stays fixed)';

  -- 4.3 Sanity: the class really is on the derived path this guard protects.
  --     A manual-source class returns before the clear, which would make 4.2
  --     pass for the wrong reason.
  select status_source into v_status from public.classes
   where id = '00000000-0000-0000-0000-000000178006';
  if v_status is distinct from 'derived' then
    raise exception '4.3 FAIL: class is not derived-status (got %), 4.2 proved nothing', v_status;
  end if;
  raise notice '4.3 PASS: the class under test is derived-status';
end;
$$;


-- =====================================================================
-- 5. The manual-status early return
--    (20260817150000_clear_tombstone_placement_on_manual_classes.sql).
--
-- refresh_class_scoring_state returns early when classes.status_source =
-- 'manual', after refreshing scored_count. Before 20260817150000 that return
-- also skipped every placement clear, so a placed entry soft-deleted in a
-- manually-pinned class kept its final_placement -- the same exposure as the
-- empty-class gap, through a different door.
--
-- The clear added there is TOMBSTONE-SCOPED, and both halves matter:
--   5.2 the tombstone loses its placement, and
--   5.3 the LIVE entries keep theirs.
-- A class-wide clear would satisfy 5.2 and destroy pinned results in 5.3.
-- =====================================================================
DO $$
DECLARE
  v_show  uuid := gen_random_uuid();
  v_trial uuid := gen_random_uuid();
  v_class uuid := gen_random_uuid();
  v_keep  uuid := gen_random_uuid();
  v_gone  uuid := gen_random_uuid();
  v_status text;
  v_keep_placement integer;
  v_gone_placement integer;
BEGIN
  INSERT INTO public.shows (id, name, organization, start_date, end_date, is_nationals)
    VALUES (v_show, 'Placement Manual Show', 'Test Org', current_date, current_date, false);
  INSERT INTO public.trials (id, show_id, name, date)
    VALUES (v_trial, v_show, 'Manual Trial', current_date);
  INSERT INTO public.classes (id, trial_id, name, status)
    VALUES (v_class, v_trial, 'Manual Class', 'upcoming');

  INSERT INTO public.entries
    (id, class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status, total_faults, search_time_seconds)
  VALUES
    (v_keep, v_class, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified', 0, 31.00),
    (v_gone, v_class, v_show, v_trial, 'checked-in', 'checked-in', true, 'qualified', 0, 42.00);

  -- 5.1 Placements are established while the class is still derived, then the
  --     class is pinned. This is the only way a manual class acquires them.
  SELECT final_placement FROM public.entries WHERE id = v_keep INTO v_keep_placement;
  SELECT final_placement FROM public.entries WHERE id = v_gone INTO v_gone_placement;
  IF (v_keep_placement, v_gone_placement) IS DISTINCT FROM (1, 2) THEN
    RAISE EXCEPTION '5.1 SETUP FAIL: expected 1/2 before pinning, got %/%',
      v_keep_placement, v_gone_placement;
  END IF;

  UPDATE public.classes SET status_source = 'manual' WHERE id = v_class;
  RAISE NOTICE '5.1 PASS: class placed 1/2, then pinned to status_source = manual';

  -- 5.2 Soft-deleting the 2nd-placed entry must strip its placement even though
  --     the manual branch returns before every other clear.
  UPDATE public.entries SET deleted_at = now() WHERE id = v_gone;

  SELECT final_placement FROM public.entries WHERE id = v_gone INTO v_gone_placement;
  IF v_gone_placement IS NOT NULL THEN
    RAISE EXCEPTION
      '5.2 FAIL: tombstone in a manual class kept placement % -- the manual '
      'early return is still skipping the clear', v_gone_placement;
  END IF;
  RAISE NOTICE '5.2 PASS: manual-class tombstone is stripped of its placement';

  -- 5.3 THE SAFETY HALF. The surviving entry keeps the placement a human
  --     pinned, and the manual status is untouched. If the manual clear is ever
  --     widened to the class-wide form the derived branches use, this fails.
  SELECT final_placement FROM public.entries WHERE id = v_keep INTO v_keep_placement;
  SELECT status_source FROM public.classes WHERE id = v_class INTO v_status;
  IF v_keep_placement IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION
      '5.3 FAIL: the manual clear wiped a LIVE entry''s placement (got %) -- it '
      'must be scoped to deleted_at IS NOT NULL', v_keep_placement;
  END IF;
  IF v_status IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION '5.3 FAIL: manual status_source was overwritten with %', v_status;
  END IF;
  RAISE NOTICE '5.3 PASS: live placements and the manual pin both survive';
END $$;

do $$
begin
  raise notice 'ALL placement soft-delete ranking assertions passed.';
end;
$$;

ROLLBACK;
