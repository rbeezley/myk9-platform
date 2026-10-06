-- MYK9-731: public.seed_demo_restore_show_day_fixture() re-dates and repairs
-- the staging show-day fixture (show dededede-0000-0000-0000-000000000014,
-- "Heartland Scent Work Week") without a full reseed.
--
-- WHY. The fixture is built by section 19 of supabase/seed-demo.sql, dated
-- from the reseed day, so it goes stale a week after any reseed. A full reseed
-- is no longer safe to run on a schedule: seed_demo_assert_no_paid_strays()
-- aborts it while real paid entries sit on a real club show. The October 5
-- show-day walk found the fixture's seven trials ending October 1 AND zero
-- live classes; the second was not the dates. The demo secretary account
-- soft-deleted the whole show from the app on 2026-10-01, and the cascade
-- soft-deleted its trials, classes and entries in one stamp.
--
-- ONE SOURCE OF TRUTH. Section 19 of the seed now calls this function after it
-- has created the show row, so the reseed and the repair run the same body.
--
-- WHAT IT TOUCHES. Only rows the seed mints for this fixture, named by their
-- fixed ids (d = day offset 0..6):
--   show      dededede-0000-0000-0000-000000000014   (must already exist)
--   visibility show_visibility_settings row of that show
--   trials    dededede-0000-0000-0014-00000000000d
--   classes   dec1a55e-0000-0000-0014-00000000000d
--   entries   dededede-0000-0000-0014-00000000010d (Willow, exhibitor@)
--             dededede-0000-0000-0014-00000000020d (Cooper, secretary@)
--   armbands  dededede-0000-0000-0014-0000000002a1 / ...2a2
--   judges    dededede-0000-0000-0014-00000000030d
--   notices   dededede-0000-0000-0014-0000000004a1 / ...4a2
-- It never touches another show, a person, a dog, or any payment, refund or
-- Stripe row. An entry a walk created on the fixture (any id not above) is
-- left exactly as it is, deleted or not.
--
-- FAIL CLOSED. It refuses, before writing anything, when the show is missing
-- or is not under the Heartland demo club, when a demo account it needs does
-- not resolve to exactly one person, when the fixture's dogs are missing or
-- deleted, or when any money sits on the show (the MONEY GUARD below).
--
-- NOTHING IS DELETED. A drifted fixture entry is reset IN PLACE, so its id,
-- its children (status history, a walk's move-up destination pointing at it)
-- and its replication version survive; the version trigger bumps the version,
-- so a device's queued offline edit still rebases.
--
-- TRIGGER CONTAINMENT. Resetting an entry fires the scoring rollup
-- (refresh_class_scoring_state), which re-derives that entry's class row and
-- final_placement on every entry in the class, and nothing else. So it also
-- refuses (a) while a fixture entry sits outside the fixture's classes, and
-- (b) while a walk's entry in a fixture class holds a placement or a live
-- result. Inside those limits the rollup writes only fixture rows.
--
-- IDEMPOTENT. Every write is guarded by IS DISTINCT FROM, so a second run on
-- the same day writes no rows and bumps no version. It returns the per-table
-- row counts it wrote.
--
-- "TODAY" is the trial's own day: now() in America/Chicago, the fixture's
-- timezone, exactly as section 19 always read it.

CREATE OR REPLACE FUNCTION public.seed_demo_restore_show_day_fixture()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  c_show  constant uuid := 'dededede-0000-0000-0000-000000000014';
  c_club  constant uuid := 'dededede-0000-0000-0000-000000000001';
  c_tz    constant text := 'America/Chicago';
  -- The entry columns a walk can change, reset in place by step 6.
  c_reset constant text[] := ARRAY[
    'dog_id', 'class_id', 'show_id', 'trial_id', 'handler_id', 'handler', 'entry_status',
    'payment_status', 'entry_fee', 'armband', 'run_order', 'move_up_requested', 'deleted_at',
    'deleted_by', 'check_in_status', 'is_in_ring', 'is_scored', 'result_status',
    'ring_entry_time', 'ring_exit_time', 'scoring_started_at', 'scoring_completed_at',
    'search_time_seconds', 'area1_time_seconds', 'area2_time_seconds', 'area3_time_seconds',
    'area4_time_seconds', 'total_correct_finds', 'total_incorrect_finds', 'total_faults',
    'no_finish_count', 'area1_correct', 'area1_incorrect', 'area1_faults', 'area2_correct',
    'area2_incorrect', 'area2_faults', 'area3_correct', 'area3_incorrect', 'area3_faults',
    'total_score', 'points_earned', 'points_possible', 'bonus_points', 'penalty_points',
    'time_over_limit', 'time_limit_exceeded_seconds', 'final_placement', 'judge_notes',
    'judge_signature', 'judge_signature_timestamp', 'disqualification_reason',
    'withdrawn_at', 'withdrawal_reason', 'withdrawal_reason_code', 'is_day_of_show'];
  v_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  v_club uuid;
  v_exhibitor uuid;
  v_secretary uuid;
  v_secretary_auth uuid;
  v_judge uuid;
  v_n integer;
  v_hits text;
  v_ready integer;
  v_counts jsonb := '{}'::jsonb;
  v_entry_ids uuid[] := ARRAY(
    SELECT ('dededede-0000-0000-0014-0000000' || k.kind || lpad(o.n::text, 2, '0'))::uuid
    FROM generate_series(0, 6) AS o(n) CROSS JOIN (VALUES ('001'), ('002')) AS k(kind));
  v_class_ids uuid[] := ARRAY(
    SELECT ('dec1a55e-0000-0000-0014-' || lpad(o.n::text, 12, '0'))::uuid
    FROM generate_series(0, 6) AS o(n));
BEGIN
  -- One run at a time.
  PERFORM pg_catalog.pg_advisory_xact_lock(731, 14);

  SELECT s.club_id INTO v_club FROM public.shows s WHERE s.id = c_show FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'show-day fixture: show % does not exist; run the full seed (supabase/seed-demo.sql) to create it (MYK9-731)', c_show
      USING ERRCODE = 'P0002';
  END IF;
  IF v_club IS DISTINCT FROM c_club THEN
    RAISE EXCEPTION 'show-day fixture: show % is no longer under the Heartland demo club (club_id %); refusing to touch it (MYK9-731)', c_show, v_club;
  END IF;

  -- The demo accounts the fixture attaches to, each exactly once (the seed's
  -- own preflight rule). A missing account would seed null handlers silently.
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

  -- Willow and Cooper belong to the main seed, not to this fixture: never
  -- undelete or create a dog here.
  SELECT count(*) INTO v_n FROM public.dogs d
  WHERE d.id IN ('dededede-0000-0000-0000-000000000041', 'dededede-0000-0000-0000-000000000046')
    AND d.deleted_at IS NULL;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'show-day fixture: the seeded dogs Willow (...041) and Cooper (...046) must both exist and be live, found %; run the full seed (MYK9-731)', v_n;
  END IF;

  -- MONEY GUARD. Same predicate as seed_demo_assert_no_paid_strays()'s
  -- `substantiated` arm, aimed at everything on this show, with ONE omission:
  -- entry_status_history, which the reseed guard counts only because its
  -- cascade would destroy it. This function deletes nothing.
  -- Show-level money aborts outright, with no trail split: a paid enrollment,
  -- a Stripe order, a ledger row, a cart line, or any refund request.
  WITH fixture_entries AS (
    SELECT e.* FROM public.entries e
    WHERE e.show_id = c_show
       OR e.trial_id IN (SELECT t.id FROM public.trials t WHERE t.show_id = c_show)
       OR e.class_id IN (SELECT c.id FROM public.classes c
                         JOIN public.trials t ON t.id = c.trial_id WHERE t.show_id = c_show)
       OR e.id = ANY (v_entry_ids)
  ),
  money AS (
    SELECT 'entry ' || e.id AS what FROM fixture_entries e
    WHERE e.payment_status IN ('paid', 'refunded')
      AND (e.stripe_payment_intent_id IS NOT NULL
        OR e.payment_reference IS NOT NULL
        OR e.refunded_at IS NOT NULL
        OR e.refund_amount IS NOT NULL
        OR e.refund_decided_at IS NOT NULL
        OR (e.payment_method IS NOT NULL AND e.payment_method <> 'waived'
            AND (e.payment_method <> 'secretary_paid' OR coalesce(e.entry_fee, 0) > 0))
        OR e.payment_received_on IS NOT NULL
        OR e.payment_notes IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.stripe_orders o WHERE o.entry_ids @> ARRAY[e.id]))
    UNION ALL
    -- A Stripe intent or a refund is money whatever the entry's status says.
    SELECT 'entry ' || e.id FROM fixture_entries e
    WHERE e.stripe_payment_intent_id IS NOT NULL OR e.refunded_at IS NOT NULL
    UNION ALL
    SELECT 'enrollment ' || en.id FROM public.enrollments en
    WHERE en.show_id = c_show
      AND en.payment_status IN ('paid', 'paid_online', 'paid_by_cash', 'paid_by_check', 'refunded', 'partial_refund')
    UNION ALL
    SELECT 'stripe_order ' || o.id FROM public.stripe_orders o
    WHERE o.show_id = c_show
       OR o.enrollment_id IN (SELECT en.id FROM public.enrollments en WHERE en.show_id = c_show)
       OR o.entry_ids && ARRAY(SELECT e.id FROM fixture_entries e)
    UNION ALL
    SELECT 'show_payment ' || sp.id FROM public.show_payments sp
    WHERE sp.show_id = c_show OR sp.entry_id IN (SELECT e.id FROM fixture_entries e)
    UNION ALL
    SELECT 'entry_cart_item ' || ci.id FROM public.entry_cart_items ci
    WHERE ci.entry_id IN (SELECT e.id FROM fixture_entries e)
    UNION ALL
    SELECT 'refund_request ' || rr.id FROM public.refund_requests rr
    WHERE rr.show_id = c_show
  )
  SELECT string_agg(DISTINCT m.what, ', ') INTO v_hits FROM money m;

  IF v_hits IS NOT NULL THEN
    RAISE EXCEPTION 'show-day fixture: money sits on show %, refusing to touch it: %. Resolve those rows deliberately; never widen this guard to get past it (MYK9-731)', c_show, left(v_hits, 1000);
  END IF;

  -- TRIGGER CONTAINMENT (see the header). (a) A fixture entry moved into
  -- another show's class: resetting it would re-derive that class.
  SELECT string_agg(e.id::text, ', ' ORDER BY e.id) INTO v_hits
  FROM public.entries e
  WHERE e.id = ANY (v_entry_ids)
    AND e.class_id IS NOT NULL
    AND e.class_id <> ALL (v_class_ids);
  IF v_hits IS NOT NULL THEN
    RAISE EXCEPTION 'show-day fixture: fixture entr(ies) % sit in a class outside the fixture; resetting them would re-derive another show''s class. Move them back or run the full seed (MYK9-731)', v_hits;
  END IF;

  -- (b) A walk's entry in a fixture class that holds a placement, or is live
  -- with a result: re-deriving the class could clear or move its placement.
  SELECT string_agg(e.id::text, ', ' ORDER BY e.id) INTO v_hits
  FROM public.entries e
  WHERE e.class_id = ANY (v_class_ids)
    AND e.id <> ALL (v_entry_ids)
    AND (e.final_placement IS NOT NULL
         OR (e.deleted_at IS NULL
             AND (e.is_scored OR coalesce(e.result_status, 'pending') <> 'pending')));
  IF v_hits IS NOT NULL THEN
    RAISE EXCEPTION 'show-day fixture: entr(ies) % that a walk created in a fixture class carry a result or placement, which resetting the class would re-derive; remove them through the app first (MYK9-731)', v_hits;
  END IF;

  -- 1. The show: re-dated and undeleted. Fees, settings and organization stay
  -- as the seed created them.
  UPDATE public.shows s
     SET name             = 'Heartland Scent Work Week',
         description      = 'A week of one-day AKC Scent Work trials, one each day, so a trial is always running on show day.',
         start_date       = (v_today::timestamp AT TIME ZONE 'UTC'),
         end_date         = ((v_today + 6)::timestamp AT TIME ZONE 'UTC'),
         entry_open_date  = ((v_today - 30)::timestamp AT TIME ZONE 'UTC'),
         entry_close_date = ((v_today - 3)::timestamp AT TIME ZONE 'UTC'),
         status           = 'published',
         deleted_at       = NULL,
         deleted_by       = NULL
   WHERE s.id = c_show
     AND (s.name, s.description, s.start_date, s.end_date, s.entry_open_date, s.entry_close_date,
          s.status, s.deleted_at, s.deleted_by)
         IS DISTINCT FROM
         ('Heartland Scent Work Week',
          'A week of one-day AKC Scent Work trials, one each day, so a trial is always running on show day.',
          (v_today::timestamp AT TIME ZONE 'UTC'), ((v_today + 6)::timestamp AT TIME ZONE 'UTC'),
          ((v_today - 30)::timestamp AT TIME ZONE 'UTC'), ((v_today - 3)::timestamp AT TIME ZONE 'UTC'),
          'published', NULL::timestamptz, NULL::uuid);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('shows', v_n);

  -- 2. 'open' preset like the demo show, with self-check-in on.
  INSERT INTO public.show_visibility_settings AS v (
    show_id, preset, placement_timing, qualification_timing,
    time_timing, faults_timing, self_checkin_enabled
  )
  VALUES (c_show, 'open', 'class_complete', 'immediate', 'immediate', 'immediate', true)
  ON CONFLICT (show_id) DO UPDATE
    SET preset               = EXCLUDED.preset,
        placement_timing     = EXCLUDED.placement_timing,
        qualification_timing = EXCLUDED.qualification_timing,
        time_timing          = EXCLUDED.time_timing,
        faults_timing        = EXCLUDED.faults_timing,
        self_checkin_enabled = EXCLUDED.self_checkin_enabled
    WHERE (v.preset, v.placement_timing, v.qualification_timing, v.time_timing,
           v.faults_timing, v.self_checkin_enabled)
          IS DISTINCT FROM
          (EXCLUDED.preset, EXCLUDED.placement_timing, EXCLUDED.qualification_timing,
           EXCLUDED.time_timing, EXCLUDED.faults_timing, EXCLUDED.self_checkin_enabled);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('show_visibility_settings', v_n);

  -- 3. Seven one-day trials, TODAY .. TODAY + 6, ids fixed per day OFFSET.
  INSERT INTO public.trials AS t (
    id, show_id, name, date, trial_number, status,
    planned_start_time, allow_self_checkin, trial_type, pipeline_stage,
    display_order, category, registry_id, timezone, version
  )
  SELECT
    ('dededede-0000-0000-0014-' || lpad(o.n::text, 12, '0'))::uuid, c_show,
    'Trial ' || (o.n + 1), v_today + o.n, 'Trial ' || (o.n + 1), 'upcoming',
    '8:00 AM', true, 'scent_work', 1, o.n + 1, 'Trial ' || (o.n + 1), 'AKC', c_tz, 1
  FROM generate_series(0, 6) AS o(n)
  ON CONFLICT (id) DO UPDATE
    SET show_id            = EXCLUDED.show_id,
        name               = EXCLUDED.name,
        date               = EXCLUDED.date,
        trial_number       = EXCLUDED.trial_number,
        status             = EXCLUDED.status,
        allow_self_checkin = EXCLUDED.allow_self_checkin,
        registry_id        = EXCLUDED.registry_id,
        timezone           = EXCLUDED.timezone,
        deleted_at         = NULL,
        deleted_by         = NULL
    WHERE (t.show_id, t.name, t.date, t.trial_number, t.status, t.allow_self_checkin,
           t.registry_id, t.timezone, t.deleted_at, t.deleted_by)
          IS DISTINCT FROM
          (EXCLUDED.show_id, EXCLUDED.name, EXCLUDED.date, EXCLUDED.trial_number, EXCLUDED.status,
           EXCLUDED.allow_self_checkin, EXCLUDED.registry_id, EXCLUDED.timezone,
           NULL::timestamptz, NULL::uuid);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('trials', v_n);

  -- 4. One class per trial. start_time is the class's published time on the
  -- exhibitor's schedule (services/database/trials/timeline.ts); the scoring
  -- columns return to "not started" because a walk scores these classes.
  INSERT INTO public.classes AS c (
    id, trial_id, name, level, element, section,
    entry_fee, status, time_limit_seconds, num_hides, num_areas,
    has_blank, timer_mode, hides_known, display_order, start_time, version
  )
  SELECT
    ('dec1a55e-0000-0000-0014-' || lpad(o.n::text, 12, '0'))::uuid,
    ('dededede-0000-0000-0014-' || lpad(o.n::text, 12, '0'))::uuid,
    'Container Novice A', 'Novice', 'Container', 'A',
    30.00, 'upcoming', 120, 1, 1, false, 'single', true, 1, '09:00'::time, 1
  FROM generate_series(0, 6) AS o(n)
  ON CONFLICT (id) DO UPDATE
    SET trial_id             = EXCLUDED.trial_id,
        name                 = EXCLUDED.name,
        level                = EXCLUDED.level,
        element              = EXCLUDED.element,
        section              = EXCLUDED.section,
        status               = EXCLUDED.status,
        start_time           = EXCLUDED.start_time,
        is_scoring_finalized = false,
        scored_count         = 0,
        results_released_at  = NULL,
        actual_start_time    = NULL,
        actual_end_time      = NULL,
        deleted_at           = NULL,
        deleted_by           = NULL
    WHERE (c.trial_id, c.name, c.level, c.element, c.section, c.status, c.start_time,
           c.is_scoring_finalized, c.scored_count, c.results_released_at,
           c.actual_start_time, c.actual_end_time, c.deleted_at, c.deleted_by)
          IS DISTINCT FROM
          (EXCLUDED.trial_id, EXCLUDED.name, EXCLUDED.level, EXCLUDED.element, EXCLUDED.section,
           EXCLUDED.status, EXCLUDED.start_time, false, 0, NULL::timestamptz,
           NULL::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::uuid);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('classes', v_n);

  -- 5. One armband per dog per show, matching the entries' numbers. Before the
  -- entries: a fixture entry going back to 'confirmed' fires
  -- auto_assign_armband_on_accept, which must find this armband, not mint one.
  INSERT INTO public.armbands AS a (id, show_id, dog_id, armband_number, is_available, assigned_at, version)
  SELECT v.id, c_show, v.dog_id, v.num, false,
         ((v_today - 3)::timestamp AT TIME ZONE 'UTC'), 1
  FROM (VALUES
    ('dededede-0000-0000-0014-0000000002a1'::uuid, 'dededede-0000-0000-0000-000000000041'::uuid, '200'),
    ('dededede-0000-0000-0014-0000000002a2'::uuid, 'dededede-0000-0000-0000-000000000046'::uuid, '201')
  ) AS v(id, dog_id, num)
  ON CONFLICT (id) DO UPDATE
    SET show_id        = EXCLUDED.show_id,
        dog_id         = EXCLUDED.dog_id,
        armband_number = EXCLUDED.armband_number,
        is_available   = EXCLUDED.is_available
    WHERE (a.show_id, a.dog_id, a.armband_number, a.is_available)
          IS DISTINCT FROM
          (EXCLUDED.show_id, EXCLUDED.dog_id, EXCLUDED.armband_number, EXCLUDED.is_available);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('armbands', v_n);

  -- 6. The running order: Willow run 1, Cooper run 2, in every class. A
  -- missing row is inserted. An existing one that drifted (deleted, scratched,
  -- checked in, scored, moved) is reset IN PLACE: every column in c_reset goes
  -- back to EXCLUDED, which holds the seed's value or the column default. Money
  -- columns are not in the list; the money guard has proved they hold nothing.
  -- Dynamic only so the one column list drives both the SET and the
  -- IS DISTINCT FROM test; the list and the ids are constants.
  EXECUTE format($q$
    INSERT INTO public.entries AS e (
      id, dog_id, class_id, show_id, trial_id, handler_id, handler,
      entry_status, payment_status, entry_fee, armband, run_order, move_up_requested, version
    )
    SELECT
      ('dededede-0000-0000-0014-0000000' || k.kind || lpad(o.n::text, 2, '0'))::uuid,
      k.dog_id,
      ('dec1a55e-0000-0000-0014-' || lpad(o.n::text, 12, '0'))::uuid,
      $1,
      ('dededede-0000-0000-0014-' || lpad(o.n::text, 12, '0'))::uuid,
      k.handler_id, k.handler,
      'confirmed', 'paid', 30.00, k.armband, k.run_order, false, 1
    FROM generate_series(0, 6) AS o(n)
    CROSS JOIN (VALUES
      ('001', 'dededede-0000-0000-0000-000000000041'::uuid, $2, 'Casey Morgan', '200', 1),
      ('002', 'dededede-0000-0000-0000-000000000046'::uuid, $3, 'Jordan Ellis', '201', 2)
    ) AS k(kind, dog_id, handler_id, handler, armband, run_order)
    ON CONFLICT (id) DO UPDATE SET (%1$s) = (%2$s) WHERE (%3$s) IS DISTINCT FROM (%2$s)
  $q$,
    (SELECT string_agg(quote_ident(c), ', ') FROM unnest(c_reset) AS c),
    (SELECT string_agg('EXCLUDED.' || quote_ident(c), ', ') FROM unnest(c_reset) AS c),
    (SELECT string_agg('e.' || quote_ident(c), ', ') FROM unnest(c_reset) AS c))
  USING c_show, v_exhibitor, v_secretary;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('entries', v_n);

  -- 7. The judge fixture judges every day, at class level (seed section 11
  -- explains why a trial-level row never reaches the judge's dashboard).
  INSERT INTO public.judge_assignments AS j (
    id, person_id, show_id, trial_id, class_id, status, confirmed_at, created_at, updated_at
  )
  SELECT
    ('dededede-0000-0000-0014-0000000003' || lpad(o.n::text, 2, '0'))::uuid,
    v_judge, c_show,
    ('dededede-0000-0000-0014-' || lpad(o.n::text, 12, '0'))::uuid,
    ('dec1a55e-0000-0000-0014-' || lpad(o.n::text, 12, '0'))::uuid,
    'confirmed', now(), now(), now()
  FROM generate_series(0, 6) AS o(n)
  ON CONFLICT (id) DO UPDATE
    SET person_id = EXCLUDED.person_id,
        show_id   = EXCLUDED.show_id,
        trial_id  = EXCLUDED.trial_id,
        class_id  = EXCLUDED.class_id,
        status    = EXCLUDED.status
    WHERE (j.person_id, j.show_id, j.trial_id, j.class_id, j.status)
          IS DISTINCT FROM
          (EXCLUDED.person_id, EXCLUDED.show_id, EXCLUDED.trial_id, EXCLUDED.class_id, EXCLUDED.status);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('judge_assignments', v_n);

  -- 8. Two announcements, posted this morning, priority 'normal' ON PURPOSE:
  -- on_announcement_insert_push fires only for 'high' / 'urgent', and a
  -- fixture repair must never push to anyone.
  INSERT INTO public.show_announcements AS sa (
    id, show_id, author_id, author_role, author_name, title, content, priority,
    expires_at, is_active, created_at, updated_at
  )
  SELECT v.id, c_show, v_secretary_auth, 'secretary', 'Jordan Ellis', v.title, v.content, 'normal',
         NULL, true,
         ((v_today::timestamp + v.at) AT TIME ZONE c_tz),
         ((v_today::timestamp + v.at) AT TIME ZONE c_tz)
  FROM (VALUES
    ('dededede-0000-0000-0014-0000000004a1'::uuid, INTERVAL '06:30:00',
     'Welcome to Scent Work Week',
     'Check-in opens at 8:00 AM at the main tent. Container Novice A starts at 9:00 AM. Please keep dogs crated until your armband is called.'),
    ('dededede-0000-0000-0014-0000000004a2'::uuid, INTERVAL '07:15:00',
     'Parking update',
     'The front lot is full. Please use the overflow field behind the barn; volunteers will direct you.')
  ) AS v(id, at, title, content)
  ON CONFLICT (id) DO UPDATE
    SET show_id    = EXCLUDED.show_id,
        title      = EXCLUDED.title,
        content    = EXCLUDED.content,
        priority   = EXCLUDED.priority,
        expires_at = EXCLUDED.expires_at,
        is_active  = EXCLUDED.is_active,
        created_at = EXCLUDED.created_at
    WHERE (sa.show_id, sa.title, sa.content, sa.priority, sa.expires_at, sa.is_active, sa.created_at)
          IS DISTINCT FROM
          (EXCLUDED.show_id, EXCLUDED.title, EXCLUDED.content, EXCLUDED.priority,
           EXCLUDED.expires_at, EXCLUDED.is_active, EXCLUDED.created_at);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('show_announcements', v_n);

  -- Postcondition: what the walks' precondition query looks for, with every
  -- level required to be LIVE. The seed's own check never looked at
  -- deleted_at, which is how a soft-deleted fixture read as present.
  SELECT count(*) INTO v_ready
  FROM public.trials t
  JOIN public.shows s ON s.id = t.show_id
  JOIN public.show_visibility_settings vs ON vs.show_id = s.id
  JOIN public.classes c ON c.trial_id = t.id
  JOIN public.entries e ON e.class_id = c.id
  WHERE s.id = c_show
    AND s.status = 'published'
    AND s.deleted_at IS NULL AND t.deleted_at IS NULL
    AND c.deleted_at IS NULL AND e.deleted_at IS NULL
    AND t.date = (now() AT TIME ZONE t.timezone)::date
    AND t.allow_self_checkin AND vs.self_checkin_enabled
    AND c.start_time IS NOT NULL
    AND e.run_order IS NOT NULL
    AND e.handler_id = v_exhibitor;
  IF v_ready < 1 THEN
    RAISE EXCEPTION 'show-day fixture: no live exhibitor@ entry on a trial dated today with self-check-in and a published time after the restore (MYK9-731)';
  END IF;

  SELECT count(*) INTO v_ready FROM public.show_announcements sa
  WHERE sa.show_id = c_show AND sa.is_active
    AND (sa.expires_at IS NULL OR sa.expires_at > now());
  IF v_ready < 1 THEN
    RAISE EXCEPTION 'show-day fixture: no active announcement on the fixture after the restore (MYK9-731)';
  END IF;

  RETURN v_counts || jsonb_build_object('today', v_today);
END;
$fn$;

COMMENT ON FUNCTION public.seed_demo_restore_show_day_fixture() IS
  'Seed maintenance (MYK9-731). Re-dates and repairs ONLY the staging show-day fixture (show dededede-0000-0000-0000-000000000014) by its seed-fixed ids so a trial runs today in America/Chicago; refuses when the show is missing or carries money. Idempotent. Called by supabase/seed-demo.sql section 19 and by an operator; never by a client.';

-- Not an application RPC: service_role (and the postgres owner) only.
REVOKE ALL ON FUNCTION public.seed_demo_restore_show_day_fixture() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_demo_restore_show_day_fixture() FROM anon;
REVOKE ALL ON FUNCTION public.seed_demo_restore_show_day_fixture() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_restore_show_day_fixture() TO service_role;
