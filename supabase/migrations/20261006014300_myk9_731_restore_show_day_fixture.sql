-- MYK9-731: a staging show-day fixture that never goes stale, without a full
-- reseed.
--
-- WHY. The fixture used to be one fixed show (dededede-...-000000000014),
-- dated from the reseed day, so it went stale a week after any reseed, and a
-- full reseed is no longer safe on a schedule: seed_demo_assert_no_paid_strays()
-- aborts it while real paid entries sit on a real club show. On 2026-10-01 the
-- demo secretary also soft-deleted that show from the app, and the October 5
-- walk found zero live classes. Repairing the fixed show in place was tried
-- and abandoned: every reset of an existing row fires triggers (scoring
-- rollup, armband propagation, withdrawn_at stamping, class touch, move-up
-- links, replication versions) that reach rows the fixture does not own.
--
-- DESIGN: INSERT-ONLY. public.seed_demo_restore_show_day_fixture() never
-- UPDATEs or DELETEs an existing row. If a ready fixture already exists it
-- returns that show and writes nothing; otherwise it INSERTs a brand-new
-- fixture show with fresh ids. Earlier fixture shows are left as they are and
-- simply age into the past.
--
-- THE MARKER. Every row the function mints has an id beginning
-- 'dededede-0000-0000-0731-'. That prefix sits in the seed's own 'dededede-'
-- namespace and has version nibble 0, which gen_random_uuid() and
-- uuid_generate_v4() (version 4) can never produce, so no real club show can
-- carry it. The walks find today's fixture with
-- public.seed_demo_show_day_fixture_today(), which matches that prefix, the
-- demo club, and every readiness condition, never a fixed id.
--
-- ONE SOURCE OF TRUTH. Section 19 of supabase/seed-demo.sql calls the same
-- function.
--
-- "TODAY" is the trial's own day: now() in America/Chicago.

-- Today's ready show-day fixture, or NULL. Read-only; also the walks' lookup.
CREATE OR REPLACE FUNCTION public.seed_demo_show_day_fixture_today()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $fn$
  SELECT s.id
  FROM public.shows s
  JOIN public.show_visibility_settings vs ON vs.show_id = s.id AND vs.self_checkin_enabled
  JOIN public.trials t ON t.show_id = s.id
  JOIN public.classes c ON c.trial_id = t.id
  JOIN public.entries e ON e.class_id = c.id
  JOIN public.people p ON p.id = e.handler_id
  WHERE s.id >= 'dededede-0000-0000-0731-000000000000'::uuid
    AND s.id <  'dededede-0000-0000-0732-000000000000'::uuid
    AND s.club_id = 'dededede-0000-0000-0000-000000000001'
    AND s.status = 'published'
    AND s.deleted_at IS NULL AND t.deleted_at IS NULL
    AND c.deleted_at IS NULL AND e.deleted_at IS NULL
    AND t.date = (now() AT TIME ZONE t.timezone)::date
    AND t.allow_self_checkin
    AND c.start_time IS NOT NULL
    AND e.run_order IS NOT NULL
    AND lower(p.email) = 'exhibitor@myk9t.com'
    AND EXISTS (SELECT 1 FROM public.show_announcements sa
                WHERE sa.show_id = s.id AND sa.is_active
                  AND (sa.expires_at IS NULL OR sa.expires_at > now()))
  ORDER BY s.created_at DESC, s.id
  LIMIT 1;
$fn$;

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
    v_show, 'Heartland Scent Work Week', 'AKC',
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

COMMENT ON FUNCTION public.seed_demo_show_day_fixture_today() IS
  'Seed maintenance (MYK9-731). The newest ready staging show-day fixture (id prefix dededede-0000-0000-0731-, demo club, a live trial dated today in its own timezone, self-check-in, a published time, the demo exhibitor''s entry, an active announcement), or NULL. Read-only.';
COMMENT ON FUNCTION public.seed_demo_restore_show_day_fixture() IS
  'Seed maintenance (MYK9-731). Returns today''s ready staging show-day fixture, inserting a brand-new one (fresh dededede-0000-0000-0731- ids) when none exists. Never updates or deletes an existing row. Called by supabase/seed-demo.sql section 19 and by an operator; never by a client.';

-- Not application RPCs: service_role (and the postgres owner) only.
REVOKE ALL ON FUNCTION public.seed_demo_show_day_fixture_today() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_demo_show_day_fixture_today() FROM anon;
REVOKE ALL ON FUNCTION public.seed_demo_show_day_fixture_today() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_show_day_fixture_today() TO service_role;

REVOKE ALL ON FUNCTION public.seed_demo_restore_show_day_fixture() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_demo_restore_show_day_fixture() FROM anon;
REVOKE ALL ON FUNCTION public.seed_demo_restore_show_day_fixture() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_restore_show_day_fixture() TO service_role;
