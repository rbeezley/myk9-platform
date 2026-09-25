-- Behavioral test for 20260925201300_myk9_753_class_judge_day_availability.sql.
--
-- MYK9-753: the cart needs every judge day's real remaining spots, not only
-- each class's tightest day. A line in a class with two confirmed judges takes
-- a spot on BOTH judges' days, so a read that names one day per class cannot
-- tell the cart what the other day has left.
--
-- Why each case earns its place:
--   1. The two-judge class returns one row PER judge day: Alma's day is full
--      (another exhibitor's entry in her other class filled it), Bert's is not.
--      A read that returned only the tightest day (the old shape) fails here.
--   2. That class's verdict is 'full' (no wait list), because payment refuses
--      it: evaluate_entry_capacity answers 'denied' on the same fixture.
--   3. A single-judge class is unchanged: one row, and its figure equals
--      get_show_class_availability's judge_day_available for it.
--   4. A class with no confirmed judge has one row with NULL day columns and
--      its class spots (max_entries - count).
--   5. Parity: every row's day_remaining equals get_judge_day_capacity_live's
--      available_spots for that day, and every class's "some day or the class
--      has no room" equals evaluate_entry_capacity refusing it.
--   6. A draft show and a soft-deleted show return no rows to an exhibitor.
--   7. Grants: anon cannot call the read; authenticated cannot call the
--      internal helper; authenticated CAN call the read (positive control).
--
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000753010', 'MYK9-753 Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, pre_entry_fee,
                          default_judge_day_capacity)
VALUES
  ('00000000-0000-0000-0000-000000753100', 'MYK9-753 Two Judge Show', 'AKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000753010', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, 30, 125),
  ('00000000-0000-0000-0000-000000753101', 'MYK9-753 Draft Show', 'AKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000753010', 'draft',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, 30, 125),
  ('00000000-0000-0000-0000-000000753102', 'MYK9-753 Deleted Show', 'AKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000753010', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, 30, 125);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES
  ('00000000-0000-0000-0000-000000753200', '00000000-0000-0000-0000-000000753100',
   'MYK9-753 Saturday Trial', current_date + 5, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000000753201', '00000000-0000-0000-0000-000000753101',
   'MYK9-753 Draft Trial', current_date + 5, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000000753202', '00000000-0000-0000-0000-000000753102',
   'MYK9-753 Deleted Trial', current_date + 5, 'AKC', 'Scent Work');

-- No class takes a wait list, so evaluate_entry_capacity answers 'denied' for a
-- full one and never inserts a wait-list row.
INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source,
                            entry_fee, max_entries, allow_waitlist)
VALUES
  -- Judged by Alma AND Bert.
  ('00000000-0000-0000-0000-000000753301', '00000000-0000-0000-0000-000000753200',
   'Interior Novice A', 'Interior', 'Novice', 'upcoming', 'manual', 30, NULL, false),
  -- Alma only; Otto's entry here fills Alma's day.
  ('00000000-0000-0000-0000-000000753302', '00000000-0000-0000-0000-000000753200',
   'Container Novice A', 'Container', 'Novice', 'upcoming', 'manual', 30, NULL, false),
  -- Bert only.
  ('00000000-0000-0000-0000-000000753303', '00000000-0000-0000-0000-000000753200',
   'Exterior Novice A', 'Exterior', 'Novice', 'upcoming', 'manual', 30, NULL, false),
  -- No judge yet; a class limit of 2 with one entry.
  ('00000000-0000-0000-0000-000000753304', '00000000-0000-0000-0000-000000753200',
   'Buried Novice A', 'Buried', 'Novice', 'upcoming', 'manual', 30, 2, false),
  ('00000000-0000-0000-0000-000000753305', '00000000-0000-0000-0000-000000753201',
   'Draft Interior Novice', 'Interior', 'Novice', 'upcoming', 'manual', 30, NULL, false),
  ('00000000-0000-0000-0000-000000753306', '00000000-0000-0000-0000-000000753202',
   'Deleted Interior Novice', 'Interior', 'Novice', 'upcoming', 'manual', 30, NULL, false);

-- Soft-delete after the children exist.
UPDATE public.shows SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-000000753102';

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000753001', 'Ann', 'Exhibitor', 'myk9-753-ann@example.test'),
  ('00000000-0000-0000-0000-000000753002', 'Otto', 'Other', 'myk9-753-otto@example.test'),
  ('00000000-0000-0000-0000-000000753003', 'Alma', 'Judge', 'myk9-753-alma@example.test'),
  ('00000000-0000-0000-0000-000000753004', 'Bert', 'Judge', 'myk9-753-bert@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000753101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-753-ann@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

-- Alma: a one-dog day. Bert: a three-dog day. Both judge the Interior class.
INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status,
                                      day_capacity_override)
VALUES
  ('00000000-0000-0000-0000-000000753003', '00000000-0000-0000-0000-000000753100',
   '00000000-0000-0000-0000-000000753200', '00000000-0000-0000-0000-000000753301', 'confirmed', 1),
  ('00000000-0000-0000-0000-000000753003', '00000000-0000-0000-0000-000000753100',
   '00000000-0000-0000-0000-000000753200', '00000000-0000-0000-0000-000000753302', 'confirmed', 1),
  ('00000000-0000-0000-0000-000000753004', '00000000-0000-0000-0000-000000753100',
   '00000000-0000-0000-0000-000000753200', '00000000-0000-0000-0000-000000753301', 'confirmed', 3),
  ('00000000-0000-0000-0000-000000753004', '00000000-0000-0000-0000-000000753100',
   '00000000-0000-0000-0000-000000753200', '00000000-0000-0000-0000-000000753303', 'confirmed', 3);

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES
  ('00000000-0000-0000-0000-000000753401', 'MYK9-753 Ann Dog', 'Annie', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000753001'),
  ('00000000-0000-0000-0000-000000753402', 'MYK9-753 Otto Dog', 'Oddie', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000753002');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000000753401', 'AKC', 'SR75300001', true),
  ('00000000-0000-0000-0000-000000753402', 'AKC', 'SR75300002', true);

INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, entry_status)
VALUES
  ('00000000-0000-0000-0000-000000753501', '00000000-0000-0000-0000-000000753100',
   '00000000-0000-0000-0000-000000753200', '00000000-0000-0000-0000-000000753302',
   '00000000-0000-0000-0000-000000753402', 'confirmed'),
  ('00000000-0000-0000-0000-000000753502', '00000000-0000-0000-0000-000000753100',
   '00000000-0000-0000-0000-000000753200', '00000000-0000-0000-0000-000000753304',
   '00000000-0000-0000-0000-000000753402', 'paid');

-- ============================================================================
-- 1-4, 6-7. The read, as Ann.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000753101', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000753101","role":"authenticated"}', true);

DO $$
DECLARE
  v_show CONSTANT uuid := '00000000-0000-0000-0000-000000753100';
  v_alma CONSTANT uuid := '00000000-0000-0000-0000-000000753003';
  v_bert CONSTANT uuid := '00000000-0000-0000-0000-000000753004';
  v_rows int;
  r record;
  legacy record;
BEGIN
  -- The RLS premise: the entry that fills Alma's day is Otto's, and Ann cannot
  -- read it, so the figures below came from the server rule, not her rows.
  SELECT count(*) INTO v_rows FROM public.entries
  WHERE class_id = '00000000-0000-0000-0000-000000753302';
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FIXTURE Ann reads % of Otto''s entries directly; the RLS premise is gone', v_rows;
  END IF;
  RAISE NOTICE 'PASS Ann''s own RLS returns 0 entries on Alma''s full day';

  -- 1. One row per judge day for the two-judge class.
  SELECT count(*) INTO v_rows
  FROM public.get_show_class_judge_day_availability(v_show)
  WHERE class_id = '00000000-0000-0000-0000-000000753301';
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'FAIL the two-judge class returned % judge-day rows, not 2', v_rows;
  END IF;

  SELECT * INTO r FROM public.get_show_class_judge_day_availability(v_show)
  WHERE class_id = '00000000-0000-0000-0000-000000753301' AND judge_id = v_alma;
  IF r.day_remaining IS DISTINCT FROM 0 OR r.day_capacity IS DISTINCT FROM 1
     OR r.day_taken IS DISTINCT FROM 1 OR r.show_date IS DISTINCT FROM current_date + 5 THEN
    RAISE EXCEPTION 'FAIL Alma''s full day read as capacity %, taken %, remaining %, date %',
      r.day_capacity, r.day_taken, r.day_remaining, r.show_date;
  END IF;

  SELECT * INTO r FROM public.get_show_class_judge_day_availability(v_show)
  WHERE class_id = '00000000-0000-0000-0000-000000753301' AND judge_id = v_bert;
  IF r.day_remaining IS DISTINCT FROM 3 OR r.day_taken IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FAIL Bert''s open day read as taken %, remaining %', r.day_taken, r.day_remaining;
  END IF;
  RAISE NOTICE 'PASS a two-judge class returns each judge''s day: Alma 0 left, Bert 3 left';

  -- 2. The class verdict is what payment does: no room on Alma's day, no wait list.
  IF r.self_service_block IS DISTINCT FROM 'full' OR r.class_full OR r.class_remaining IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL two-judge class verdict %, class_full %, class_remaining %',
      r.self_service_block, r.class_full, r.class_remaining;
  END IF;
  RAISE NOTICE 'PASS the two-judge class verdict is full because one of its days is';

  -- 3. A single-judge class: one row, the same figure the wizard read reports.
  SELECT count(*) INTO v_rows
  FROM public.get_show_class_judge_day_availability(v_show)
  WHERE class_id = '00000000-0000-0000-0000-000000753303';
  SELECT * INTO r FROM public.get_show_class_judge_day_availability(v_show)
  WHERE class_id = '00000000-0000-0000-0000-000000753303';
  SELECT * INTO legacy FROM public.get_show_class_availability(v_show)
  WHERE class_id = '00000000-0000-0000-0000-000000753303';
  IF v_rows <> 1 OR r.judge_id IS DISTINCT FROM v_bert OR r.day_remaining IS DISTINCT FROM 3
     OR legacy.judge_day_available IS DISTINCT FROM r.day_remaining
     OR legacy.judge_id IS DISTINCT FROM r.judge_id OR r.self_service_block IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL single-judge class: % rows, judge %, remaining %, wizard read %/%',
      v_rows, r.judge_id, r.day_remaining, legacy.judge_id, legacy.judge_day_available;
  END IF;
  -- The wizard read still names the tightest day for the two-judge class.
  SELECT * INTO legacy FROM public.get_show_class_availability(v_show)
  WHERE class_id = '00000000-0000-0000-0000-000000753301';
  IF legacy.judge_id IS DISTINCT FROM v_alma OR legacy.judge_day_available <> 0
     OR NOT legacy.judge_day_full OR legacy.self_service_block IS DISTINCT FROM 'full' THEN
    RAISE EXCEPTION 'FAIL the wizard read changed for the two-judge class: judge %, available %, block %',
      legacy.judge_id, legacy.judge_day_available, legacy.self_service_block;
  END IF;
  RAISE NOTICE 'PASS a single-judge class is unchanged, and the wizard read still names the tightest day';

  -- 4. No confirmed judge: one row, NULL day columns, class spots.
  SELECT count(*) INTO v_rows
  FROM public.get_show_class_judge_day_availability(v_show)
  WHERE class_id = '00000000-0000-0000-0000-000000753304';
  SELECT * INTO r FROM public.get_show_class_judge_day_availability(v_show)
  WHERE class_id = '00000000-0000-0000-0000-000000753304';
  IF v_rows <> 1 OR r.judge_id IS NOT NULL OR r.day_remaining IS NOT NULL
     OR r.class_max_entries IS DISTINCT FROM 2 OR r.class_entry_count IS DISTINCT FROM 1
     OR r.class_remaining IS DISTINCT FROM 1 OR r.class_full OR r.self_service_block IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL judgeless class: % rows, judge %, max %, count %, remaining %',
      v_rows, r.judge_id, r.class_max_entries, r.class_entry_count, r.class_remaining;
  END IF;
  RAISE NOTICE 'PASS a class with no confirmed judge has one row with its class spots';

  -- 6. Draft and soft-deleted shows return nothing to an exhibitor.
  SELECT count(*) INTO v_rows
  FROM public.get_show_class_judge_day_availability('00000000-0000-0000-0000-000000753101');
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL an exhibitor read % rows for a draft show', v_rows;
  END IF;
  SELECT count(*) INTO v_rows
  FROM public.get_show_class_judge_day_availability('00000000-0000-0000-0000-000000753102');
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL an exhibitor read % rows for a soft-deleted show', v_rows;
  END IF;
  RAISE NOTICE 'PASS draft and soft-deleted shows return no rows';

  -- 7. The internal helper is not client-callable.
  BEGIN
    PERFORM public.class_judge_day_capacity(ARRAY['00000000-0000-0000-0000-000000753301'::uuid]);
    RAISE EXCEPTION 'FAIL authenticated executed the unscoped class_judge_day_capacity';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS authenticated cannot call class_judge_day_capacity';
  END;
END;
$$;

RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $$
BEGIN
  PERFORM public.get_show_class_judge_day_availability('00000000-0000-0000-0000-000000753100');
  RAISE EXCEPTION 'FAIL anon executed get_show_class_judge_day_availability';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS anon cannot call get_show_class_judge_day_availability';
END;
$$;

RESET ROLE;

-- ============================================================================
-- 5. Parity with the payment-time rule, as the webhook runs it (service_role).
-- ============================================================================

SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_show CONSTANT uuid := '00000000-0000-0000-0000-000000753100';
  v_dog CONSTANT uuid := '00000000-0000-0000-0000-000000753401';
  r record;
  cap record;
  v_blocked boolean;
  v_outcome text;
  v_checked int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.get_show_class_judge_day_availability(v_show) WHERE judge_id IS NOT NULL
  LOOP
    SELECT * INTO cap FROM public.get_judge_day_capacity_live(r.judge_id, v_show, r.show_date);
    IF COALESCE(cap.available_spots, 0) IS DISTINCT FROM r.day_remaining THEN
      RAISE EXCEPTION 'FAIL class % judge % day_remaining % but get_judge_day_capacity_live says %',
        r.class_id, r.judge_id, r.day_remaining, cap.available_spots;
    END IF;
    v_checked := v_checked + 1;
  END LOOP;
  IF v_checked <> 4 THEN
    RAISE EXCEPTION 'FAIL parity walked % judge-day rows, expected 4', v_checked;
  END IF;
  RAISE NOTICE 'PASS every day_remaining equals get_judge_day_capacity_live''s self-service figure';

  v_checked := 0;
  FOR r IN
    SELECT class_id,
           bool_or(class_full) OR COALESCE(bool_or(day_remaining <= 0), false) AS no_room
    FROM public.get_show_class_judge_day_availability(v_show)
    GROUP BY class_id
  LOOP
    SELECT outcome INTO v_outcome
    FROM public.evaluate_entry_capacity(r.class_id, v_dog, NULL, NULL, 'self_service', false);
    v_blocked := v_outcome <> 'available';
    IF v_blocked IS DISTINCT FROM r.no_room THEN
      RAISE EXCEPTION 'FAIL class %: the read says no_room %, payment says %',
        r.class_id, r.no_room, v_outcome;
    END IF;
    v_checked := v_checked + 1;
  END LOOP;
  IF v_checked <> 4 THEN
    RAISE EXCEPTION 'FAIL parity walked % classes, expected 4', v_checked;
  END IF;
  RAISE NOTICE 'PASS every class the read says has no room is the one payment refuses, and only those';
END;
$$;

RESET ROLE;

ROLLBACK;
