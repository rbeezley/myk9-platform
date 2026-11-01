-- MYK9-1595: show-day fixture shows stop piling up, and say what they are.
--
-- ROOT CAUSE. public.seed_demo_restore_show_day_fixture() (MYK9-731) inserts 14
-- entries of its own (ids prefixed dededede-0000-0000-0731-, 'confirmed' /
-- 'paid', no Stripe or payment rows). public.seed_demo_retire_stale_fixture_shows()
-- (MYK9-1309) skipped any show with ANY entry, so every populated fixture was
-- permanently unretirable and a "Heartland Scent Work Week" piled up on Find
-- Shows for every walk that minted one.
--
-- CHANGES (CREATE OR REPLACE of both; owner, SECURITY mode, search_path and the
-- REVOKE / GRANT set are unchanged, and CREATE OR REPLACE keeps the ACL):
--   1. Retire ignores entries whose id is in the fixture's own marker range
--      (dededede-0000-0000-0731-*). Every other hang condition is unchanged:
--      a non-prefixed entry, an enrollment, a waitlist join, a cart or cart
--      item, a Stripe order, a payment, a payout, a payment link, a money lock,
--      a refund request still keeps the show.
--      The one exception is trial_packet_snapshots: secretary walks generate 1 to 6
--      per fixture, and trial_packet_snapshots_show_id_fkey is ON DELETE RESTRICT
--      with no triggers on the table, so keeping the show for them left every
--      fixture unretirable (owner decision 2026-11-01). The retire deletes a
--      fixture's snapshots itself, inside the per-show sub-block, so a failed show
--      delete rolls the snapshot delete back with it.
--   2. Retire only touches STALE fixtures, and never the show
--      public.seed_demo_show_day_fixture_today() returns. Before this change
--      the seeded entries accidentally protected today's live fixture; without
--      this restriction ignoring them would delete the fixture the walks use.
--      "Stale" is the fixture's last trial day before today in America/Chicago
--      (the zone the restore dates the fixture in); a show with no trials falls
--      back to its end date. One more case is retired: a show that is not stale
--      but holds NO fixture entries at all (a same-day reseed has just deleted
--      them, so nothing seeded is left to protect, and the restore is about to
--      mint a replacement). That is exactly what the pre-change function did.
--   3. The restore names the show "Show-day fixture · <Mon D>" from its start
--      date (middle dot U+00B7, month abbreviation, day without a leading zero),
--      and calls the retire function once immediately before minting. When a
--      ready fixture exists it still returns it and writes nothing.
--
-- MONEY SAFETY. Deleting a fixture show cascades to its seeded 'paid' entries.
-- Every DELETE-firing trigger on entries and on the tables the shows -> trials
-- -> classes -> entries cascade reaches was read (MYK9-1595):
--   entries: broadcast_entries_showday_change (realtime.send, no table write),
--     entries_clear_stale_results_verified_delete and
--     entries_refresh_class_scoring_state_insert_delete (UPDATE public.classes
--     only), trg_entries_refresh_enrollment_total (touches only an enrollment
--     the entry names through registration_id, which fixture entries leave
--     NULL).
--   classes: broadcast_classes_showday_change (realtime.send).
--   judge_assignments: trg_touch_class_on_judge_assignment_write (UPDATE
--     public.classes).
-- None writes refund_requests, show_payments, a Stripe row, an alert or an email.
-- supabase/tests/myk9_1309_seed_fixture_functions_test.sql asserts the counts
-- of both tables are unchanged by a retirement.

-- ---------------------------------------------------------------------------
-- 1. Retire stale fixture shows.
-- Body from 20261022034100 (the latest definition).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_demo_retire_stale_fixture_shows()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_show record;
  v_hangs boolean;
  v_retired integer := 0;
  -- The same notion of "today" the restore uses: the fixture's own timezone.
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_ready uuid := public.seed_demo_show_day_fixture_today();
BEGIN
  FOR v_show IN
    SELECT s.id, s.name,
           coalesce((SELECT max(t.date) FROM public.trials t WHERE t.show_id = s.id),
                    (s.end_date AT TIME ZONE 'UTC')::date) AS last_day,
           EXISTS (SELECT 1 FROM public.entries fe
                   WHERE fe.id >= 'dededede-0000-0000-0731-000000000000'::uuid
                     AND fe.id <  'dededede-0000-0000-0732-000000000000'::uuid
                     AND (fe.show_id = s.id
                          OR fe.trial_id IN (SELECT t.id FROM public.trials t WHERE t.show_id = s.id)
                          OR fe.class_id IN (SELECT c.id FROM public.classes c
                                             JOIN public.trials t ON t.id = c.trial_id
                                             WHERE t.show_id = s.id))) AS has_fixture_entries
    FROM public.shows s
    WHERE s.id >= 'dededede-0000-0000-0731-000000000000'::uuid
      AND s.id <  'dededede-0000-0000-0732-000000000000'::uuid
  LOOP
    -- Today's ready fixture is the one the walks are using.
    CONTINUE WHEN v_show.id IS NOT DISTINCT FROM v_ready;
    -- A fixture still running with its seeded entries is in use; one that lost
    -- them (a same-day reseed) or has aged out is not.
    CONTINUE WHEN v_show.last_day >= v_today AND v_show.has_fixture_entries;

    SELECT
      EXISTS (SELECT 1 FROM public.entries e
              WHERE NOT (e.id >= 'dededede-0000-0000-0731-000000000000'::uuid
                         AND e.id <  'dededede-0000-0000-0732-000000000000'::uuid)
                AND (e.show_id = v_show.id
                     OR e.trial_id IN (SELECT t.id FROM public.trials t WHERE t.show_id = v_show.id)
                     OR e.class_id IN (SELECT c.id FROM public.classes c
                                       JOIN public.trials t ON t.id = c.trial_id
                                       WHERE t.show_id = v_show.id)))
      OR EXISTS (SELECT 1 FROM public.enrollments en WHERE en.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.waitlist_entries we
                 WHERE we.class_id IN (SELECT c.id FROM public.classes c
                                       JOIN public.trials t ON t.id = c.trial_id
                                       WHERE t.show_id = v_show.id))
      OR EXISTS (SELECT 1 FROM public.entry_carts ec WHERE ec.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.entry_cart_items eci
                 WHERE eci.class_id IN (SELECT c.id FROM public.classes c
                                        JOIN public.trials t ON t.id = c.trial_id
                                        WHERE t.show_id = v_show.id))
      OR EXISTS (SELECT 1 FROM public.stripe_orders so WHERE so.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.show_payments sp WHERE sp.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.show_payouts spo WHERE spo.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.entry_payment_links epl WHERE epl.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.show_money_locks sml WHERE sml.show_id = v_show.id)
      OR EXISTS (SELECT 1 FROM public.refund_requests rr WHERE rr.show_id = v_show.id)
    INTO v_hangs;

    IF NOT v_hangs THEN
      BEGIN
        DELETE FROM public.trial_packet_snapshots WHERE show_id = v_show.id;
        DELETE FROM public.shows WHERE id = v_show.id;
        v_retired := v_retired + 1;
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
        RAISE WARNING 'seed-demo: kept fixture show % (%): %', v_show.id, v_show.name, SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN v_retired;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Restore: named fixture, retire before minting.
-- Body from 20261006014300 (the only definition).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_demo_restore_show_day_fixture()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  c_club  constant uuid := 'dededede-0000-0000-0000-000000000001';
  c_tz    constant text := 'America/Chicago';
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_show uuid;
  v_exhibitor uuid;
  v_secretary uuid;
  v_secretary_auth uuid;
  v_judge uuid;
  v_n integer;
  -- Fresh ids in the marker namespace: the prefix, then 48 random bits.
  v_trials uuid[] := ARRAY(
    SELECT ('dededede-0000-0000-0731-' || substr(md5(pg_catalog.gen_random_uuid()::text), 1, 12))::uuid
    FROM generate_series(0, 6));
  v_classes uuid[] := ARRAY(
    SELECT ('dededede-0000-0000-0731-' || substr(md5(pg_catalog.gen_random_uuid()::text), 1, 12))::uuid
    FROM generate_series(0, 6));
BEGIN
  -- One run at a time, so two callers cannot both find nothing and both insert.
  PERFORM pg_catalog.pg_advisory_xact_lock(731, 14);

  v_show := public.seed_demo_show_day_fixture_today();
  IF v_show IS NOT NULL THEN
    RETURN jsonb_build_object('show_id', v_show, 'created', false, 'today', v_today);
  END IF;

  -- The seed's own club, accounts and dogs; the fixture never creates them.
  IF NOT EXISTS (SELECT 1 FROM public.clubs cl WHERE cl.id = c_club) THEN
    RAISE EXCEPTION 'show-day fixture: the Heartland demo club % does not exist; run the full seed (supabase/seed-demo.sql) (MYK9-731)', c_club
      USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*), min(p.id::text)::uuid INTO v_n, v_exhibitor
  FROM public.people p WHERE lower(p.email) = 'exhibitor@myk9t.com';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'show-day fixture: expected exactly 1 person for exhibitor@myk9t.com, found % (MYK9-731)', v_n;
  END IF;
  SELECT count(*), min(p.id::text)::uuid, min(p.auth_user_id::text)::uuid
    INTO v_n, v_secretary, v_secretary_auth
  FROM public.people p WHERE lower(p.email) = 'secretary@myk9t.com';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'show-day fixture: expected exactly 1 person for secretary@myk9t.com, found % (MYK9-731)', v_n;
  END IF;
  -- The announcements' author (show_announcements.author_id is NOT NULL).
  IF v_secretary_auth IS NULL THEN
    RAISE EXCEPTION 'show-day fixture: secretary@myk9t.com has no sign-in account (people.auth_user_id is null), so the announcements have no author (MYK9-731)';
  END IF;
  SELECT count(*), min(p.id::text)::uuid INTO v_n, v_judge
  FROM public.people p WHERE lower(p.email) = 'judge@myk9t.com';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'show-day fixture: expected exactly 1 person for judge@myk9t.com, found % (MYK9-731)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.dogs d
  WHERE d.id IN ('dededede-0000-0000-0000-000000000041', 'dededede-0000-0000-0000-000000000046')
    AND d.deleted_at IS NULL;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'show-day fixture: the seeded dogs Willow (...041) and Cooper (...046) must both exist and be live, found %; run the full seed (MYK9-731)', v_n;
  END IF;

  -- MYK9-1595: this is the mint path, so retire the stale fixtures first. The retire
  -- function only deletes what nothing of money or a person's work hangs off, and
  -- never today's ready fixture (there is none here). A walk that mints a fixture
  -- therefore leaves at most the stale ones a person touched.
  PERFORM public.seed_demo_retire_stale_fixture_shows();

  v_show := ('dededede-0000-0000-0731-' || substr(md5(pg_catalog.gen_random_uuid()::text), 1, 12))::uuid;

  -- The show: AKC, under the Heartland club so the demo secretary manages it,
  -- one trial a day from today to today + 6, entries closed (it is running).
  INSERT INTO public.shows (
    id, name, organization, description,
    start_date, end_date, entry_open_date, entry_close_date,
    location, city, state, latitude, longitude, status, club_id,
    pre_entry_fee, day_of_show_fee,
    allow_non_owner_handlers, results_visible_to_all,
    starting_armband_number, default_judge_day_capacity,
    mail_in_strategy, mail_in_auto_release, waitlist_payment_deadline_hours,
    accept_check_payments, accept_cash_payments,
    cc_secretary_on_exhibitor_emails,
    style, experience_is_published, experience_published_content,
    brand_color, version, is_nationals, online_entries_enabled
  )
  VALUES (
    v_show, 'Show-day fixture · ' || to_char(v_today, 'Mon FMDD'), 'AKC',
    'A week of one-day AKC Scent Work trials, one each day, so a trial is always running on show day.',
    (v_today::timestamp AT TIME ZONE 'UTC'), ((v_today + 6)::timestamp AT TIME ZONE 'UTC'),
    ((v_today - 30)::timestamp AT TIME ZONE 'UTC'), ((v_today - 3)::timestamp AT TIME ZONE 'UTC'),
    '100 Dog Show Lane, Tulsa, OK 74101', 'Tulsa', 'Oklahoma', 36.15, -95.99,
    'published', c_club,
    30.00, 35.00,
    true, true,
    200, 125,
    'none', false, 48,
    true, true,
    true,
    'headline', false, '{}'::jsonb,
    '#0d4d4f', 1, false, true
  );

  -- 'open' preset like the demo show, with self-check-in on.
  INSERT INTO public.show_visibility_settings (
    show_id, preset, placement_timing, qualification_timing,
    time_timing, faults_timing, self_checkin_enabled
  )
  VALUES (v_show, 'open', 'class_complete', 'immediate', 'immediate', 'immediate', true);

  INSERT INTO public.trials (
    id, show_id, name, date, trial_number, status,
    planned_start_time, allow_self_checkin, trial_type, pipeline_stage,
    display_order, category, registry_id, timezone, version
  )
  SELECT v_trials[o.n + 1], v_show,
         'Trial ' || (o.n + 1), v_today + o.n, 'Trial ' || (o.n + 1), 'upcoming',
         '8:00 AM', true, 'scent_work', 1, o.n + 1, 'Trial ' || (o.n + 1), 'AKC', c_tz, 1
  FROM generate_series(0, 6) AS o(n);

  -- start_time is the class's published time on the exhibitor's schedule
  -- (services/database/trials/timeline.ts).
  INSERT INTO public.classes (
    id, trial_id, name, level, element, section,
    entry_fee, status, time_limit_seconds, num_hides, num_areas,
    has_blank, timer_mode, hides_known, display_order, start_time, version
  )
  SELECT v_classes[o.n + 1], v_trials[o.n + 1],
         'Container Novice A', 'Novice', 'Container', 'A',
         30.00, 'upcoming', 120, 1, 1, false, 'single', true, 1, '09:00'::time, 1
  FROM generate_series(0, 6) AS o(n);

  -- One armband per dog per show, matching the entries' numbers.
  INSERT INTO public.armbands (id, show_id, dog_id, armband_number, is_available, assigned_at, version)
  SELECT ('dededede-0000-0000-0731-' || substr(md5(pg_catalog.gen_random_uuid()::text), 1, 12))::uuid,
         v_show, v.dog_id, v.num, false, ((v_today - 3)::timestamp AT TIME ZONE 'UTC'), 1
  FROM (VALUES
    ('dededede-0000-0000-0000-000000000041'::uuid, '200'),
    ('dededede-0000-0000-0000-000000000046'::uuid, '201')
  ) AS v(dog_id, num);

  -- The running order in every class: the demo exhibitor's Willow run 1, the
  -- secretary's Cooper run 2.
  INSERT INTO public.entries (
    id, dog_id, class_id, show_id, trial_id, handler_id, handler,
    entry_status, payment_status, entry_fee, armband, run_order, move_up_requested, version
  )
  SELECT ('dededede-0000-0000-0731-' || substr(md5(pg_catalog.gen_random_uuid()::text), 1, 12))::uuid,
         k.dog_id, v_classes[o.n + 1], v_show, v_trials[o.n + 1], k.handler_id, k.handler,
         'confirmed', 'paid', 30.00, k.armband, k.run_order, false, 1
  FROM generate_series(0, 6) AS o(n)
  CROSS JOIN (VALUES
    ('dededede-0000-0000-0000-000000000041'::uuid, v_exhibitor, 'Casey Morgan', '200', 1),
    ('dededede-0000-0000-0000-000000000046'::uuid, v_secretary, 'Jordan Ellis', '201', 2)
  ) AS k(dog_id, handler_id, handler, armband, run_order);

  -- The judge fixture judges every day, at class level (seed section 11
  -- explains why a trial-level row never reaches the judge's dashboard).
  INSERT INTO public.judge_assignments (
    id, person_id, show_id, trial_id, class_id, status, confirmed_at, created_at, updated_at
  )
  SELECT ('dededede-0000-0000-0731-' || substr(md5(pg_catalog.gen_random_uuid()::text), 1, 12))::uuid,
         v_judge, v_show, v_trials[o.n + 1], v_classes[o.n + 1], 'confirmed', now(), now(), now()
  FROM generate_series(0, 6) AS o(n);

  -- Two announcements posted this morning, priority 'normal' ON PURPOSE:
  -- on_announcement_insert_push fires only for 'high' / 'urgent', and a fixture
  -- must never push to anyone.
  INSERT INTO public.show_announcements (
    id, show_id, author_id, author_role, author_name, title, content, priority,
    expires_at, is_active, created_at, updated_at
  )
  SELECT ('dededede-0000-0000-0731-' || substr(md5(pg_catalog.gen_random_uuid()::text), 1, 12))::uuid,
         v_show, v_secretary_auth, 'secretary', 'Jordan Ellis', v.title, v.content, 'normal',
         NULL, true,
         ((v_today::timestamp + v.at) AT TIME ZONE c_tz),
         ((v_today::timestamp + v.at) AT TIME ZONE c_tz)
  FROM (VALUES
    (INTERVAL '06:30:00', 'Welcome to Scent Work Week',
     'Check-in opens at 8:00 AM at the main tent. Container Novice A starts at 9:00 AM. Please keep dogs crated until your armband is called.'),
    (INTERVAL '07:15:00', 'Parking update',
     'The front lot is full. Please use the overflow field behind the barn; volunteers will direct you.')
  ) AS v(at, title, content);

  IF public.seed_demo_show_day_fixture_today() IS DISTINCT FROM v_show THEN
    RAISE EXCEPTION 'show-day fixture: the new fixture % is not ready after inserting it (MYK9-731)', v_show;
  END IF;

  RETURN jsonb_build_object('show_id', v_show, 'created', true, 'today', v_today);
END;
$fn$;

COMMENT ON FUNCTION public.seed_demo_retire_stale_fixture_shows() IS
  'Seed maintenance (MYK9-1309, MYK9-1595). Deletes STALE show-day fixture shows (id range dededede-0000-0000-0731-*, last trial before today in America/Chicago, or no fixture entries left) that nothing of a person or of money hangs off; the fixture''s own minted entries (same id range) do not count. Never deletes the show seed_demo_show_day_fixture_today() returns. Keeps and warns on an unlisted FK. Returns the number deleted. Called by supabase/seed-demo.sql section 0 and by seed_demo_restore_show_day_fixture(); never by a client.';
COMMENT ON FUNCTION public.seed_demo_restore_show_day_fixture() IS
  'Seed maintenance (MYK9-731, MYK9-1595). Returns today''s ready staging show-day fixture, or retires the stale ones and inserts a brand-new one named "Show-day fixture · <Mon D>" (fresh dededede-0000-0000-0731- ids). Writes nothing when a ready fixture exists. Called by supabase/seed-demo.sql section 19 and by an operator; never by a client.';

-- The ACL is unchanged (CREATE OR REPLACE keeps it); restated so the grant
-- decision is recorded in this file. Not application RPCs: service_role and the
-- postgres owner only.
REVOKE ALL ON FUNCTION public.seed_demo_retire_stale_fixture_shows() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_retire_stale_fixture_shows() TO service_role;
REVOKE ALL ON FUNCTION public.seed_demo_restore_show_day_fixture() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_restore_show_day_fixture() TO service_role;
