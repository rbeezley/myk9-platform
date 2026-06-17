-- ============================================================================
-- Lane 1.1 Demo Reseed  (myK9Show / Supabase project sojmvhhwsjxmfistvzbe)
-- ----------------------------------------------------------------------------
-- WHAT THIS IS
--   A small, realistic, *publicly visible* demo dataset (1 club, 1 published
--   AKC scent-work show, 2 trials, 5 classes, 6 dogs, 8 entries). Intended to
--   be run AFTER the hard wipe that clears all shows/trials/classes/entries/
--   dogs/clubs and all non-protected people.
--
-- WHAT THIS IS NOT
--   It does NOT create people and does NOT touch auth.users. The 11 protected
--   accounts survive the wipe; this seed references them by email lookup
--   (subquery on public.people) so the fixed UUIDs below never collide with
--   real account ids. Dogs/entries are attached to:
--     - e2e-exhibitor@test.myk9.com  (primary demo exhibitor)
--     - beezley@cox.net
--     - secretary@myk9t.com          (Test Secretary)
--   (club@myk9t.com exists but `clubs` has no owner/admin column, so the club
--    is associated by convention only — no FK to set.)
--
-- HOW TO RUN
--   source "supabase/.env"
--   PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
--     "postgresql://postgres.sojmvhhwsjxmfistvzbe@aws-1-us-east-2.pooler.supabase.com:5432/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/seed-demo.sql
--
-- IDEMPOTENT
--   Re-running is safe. The file first deletes its own fixed-id rows
--   (children -> parents) and then re-inserts. Fixed UUIDs all share the
--   recognizable prefix 'dededede-' (and 'dec1a55e-' for classes). No now()/
--   random — every value is a literal so repeated runs are byte-identical.
--
-- VISIBILITY NOTE
--   On this DB, public visibility of a show is driven purely by
--   shows.status = 'published' (the three live published shows have ZERO rows
--   in show_visibility_settings / *_visibility_overrides and still render
--   publicly). We additionally insert an `open`-preset show_visibility_settings
--   row so scored results are released to anon per the public-results gate
--   (preset 'open' => immediate timings). Visibility-override tables are left
--   empty, matching the live published shows.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Preflight: every protected account this seed attaches data to must resolve to
-- exactly one person. Without this, a missing/duplicate email would make the
-- nullable owner_id/handler_id subqueries silently seed unowned dogs / null
-- handlers instead of failing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_email text;
  v_count int;
BEGIN
  FOREACH v_email IN ARRAY ARRAY[
    'e2e-exhibitor@test.myk9.com', 'beezley@cox.net', 'secretary@myk9t.com',
    -- Section 10 grants RBAC roles to these accounts by email; a missing/dup row
    -- would silently grant nothing (re-introducing the F1 secretary-403 bug),
    -- so require each to resolve to exactly one person here.
    'e2e-secretary@test.myk9.com', 'club@myk9t.com', 'e2e-clubadmin@test.myk9.com'
  ] LOOP
    SELECT count(*) INTO v_count FROM public.people WHERE lower(email) = v_email;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'seed-demo preflight: expected exactly 1 person for %, found %', v_email, v_count;
    END IF;
  END LOOP;

  -- Section 10 grants by role NAME; a renamed/absent role would also silently
  -- grant nothing. Require both scoped roles to exist exactly once.
  FOREACH v_email IN ARRAY ARRAY['secretary', 'club_admin'] LOOP
    SELECT count(*) INTO v_count FROM public.roles WHERE name = v_email;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'seed-demo preflight: expected exactly 1 role named %, found %', v_email, v_count;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Fixed ids
-- ---------------------------------------------------------------------------
--   club   dededede-0000-0000-0000-000000000001
--   show   dededede-0000-0000-0000-000000000010
--   trials dededede-0000-0000-0000-00000000002{1,2}
--   class  dec1a55e-0000-0000-0000-00000000003{1..5}
--   dog    dededede-0000-0000-0000-00000000004{1..6}
--   entry  dededede-0000-0000-0000-00000000005{1..8}

-- ---------------------------------------------------------------------------
-- 0. Idempotency: remove prior seed rows (children first, FK-safe)
-- ---------------------------------------------------------------------------
-- Cart items reference classes/dogs with NO ACTION FKs — clear any that point at
-- seeded classes/dogs first, or a demo cart would block the class/dog deletes.
DELETE FROM public.entry_cart_items
WHERE class_id IN (
        'dec1a55e-0000-0000-0000-000000000031','dec1a55e-0000-0000-0000-000000000032',
        'dec1a55e-0000-0000-0000-000000000033','dec1a55e-0000-0000-0000-000000000034',
        'dec1a55e-0000-0000-0000-000000000035')
   OR dog_id IN (
        'dededede-0000-0000-0000-000000000041','dededede-0000-0000-0000-000000000042',
        'dededede-0000-0000-0000-000000000043','dededede-0000-0000-0000-000000000044',
        'dededede-0000-0000-0000-000000000045','dededede-0000-0000-0000-000000000046');
-- Armbands hang off the seeded show (and reference dogs/entries) — clear by show
-- before deleting entries/dogs so their FKs can't block.
DELETE FROM public.armbands WHERE show_id = 'dededede-0000-0000-0000-000000000010';
-- entry ...059 is the GAP FIXTURE #4 withdrawn/refunded row (added below). The
-- refund-column guard fires only on INSERT/UPDATE, so a plain DELETE needs no role
-- switch. entry_status_history rows cascade-delete with their entry.
DELETE FROM public.entries WHERE id IN (
  'dededede-0000-0000-0000-000000000051','dededede-0000-0000-0000-000000000052',
  'dededede-0000-0000-0000-000000000053','dededede-0000-0000-0000-000000000054',
  'dededede-0000-0000-0000-000000000055','dededede-0000-0000-0000-000000000056',
  'dededede-0000-0000-0000-000000000057','dededede-0000-0000-0000-000000000058',
  'dededede-0000-0000-0000-000000000059'
);
DELETE FROM public.classes WHERE id IN (
  'dec1a55e-0000-0000-0000-000000000031','dec1a55e-0000-0000-0000-000000000032',
  'dec1a55e-0000-0000-0000-000000000033','dec1a55e-0000-0000-0000-000000000034',
  'dec1a55e-0000-0000-0000-000000000035'
);
DELETE FROM public.dogs WHERE id IN (
  'dededede-0000-0000-0000-000000000041','dededede-0000-0000-0000-000000000042',
  'dededede-0000-0000-0000-000000000043','dededede-0000-0000-0000-000000000044',
  'dededede-0000-0000-0000-000000000045','dededede-0000-0000-0000-000000000046'
);
DELETE FROM public.trials WHERE id IN (
  'dededede-0000-0000-0000-000000000021','dededede-0000-0000-0000-000000000022'
);
DELETE FROM public.show_visibility_settings WHERE show_id = 'dededede-0000-0000-0000-000000000010';
DELETE FROM public.shows WHERE id = 'dededede-0000-0000-0000-000000000010';
DELETE FROM public.clubs WHERE id = 'dededede-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- 1. Club
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name, city, state, email, description, club_number, version)
VALUES (
  'dededede-0000-0000-0000-000000000001',
  'Heartland Scent Work Club',
  'Tulsa', 'Oklahoma',
  'club@myk9t.com',
  'Demo scent work club for the myK9Show showcase dataset.',
  'HSWC-001', 1
);

-- ---------------------------------------------------------------------------
-- 2. Published show  (AKC, fixed dates ~ Aug 1-3 2026)
--    GAP FIXTURE #1 (accepting window): the entry window must contain "today"
--    (the launch-gate walks run 2026-06-17) so the Show Details "Enter" CTA is
--    live. The app derives "accepting entries" in EntryCTA.computeRegistrationState:
--    status='published' AND now > entry_open_date AND now < entry_close_date
--    (close treated as inclusive of its full calendar day). The prior window
--    ('2026-07-01' .. '2026-07-28') was entirely future => NOT accepting. We open
--    it '2026-06-01' .. '2026-09-01' (today falls inside) and keep the show dates
--    Aug 1-3. NOTE: there is no separate status/registration_status enum for
--    "accepting" — the gate is purely status='published' + the date window.
-- ---------------------------------------------------------------------------
INSERT INTO public.shows (
  id, name, organization, description,
  start_date, end_date, entry_open_date, entry_close_date,
  location, city, state, status, club_id,
  pre_entry_fee, day_of_show_fee,
  allow_non_owner_handlers, results_visible_to_all,
  starting_armband_number, default_judge_day_capacity,
  mail_in_strategy, mail_in_auto_release, waitlist_payment_deadline_hours,
  accept_check_payments, accept_cash_payments,
  cc_secretary_on_exhibitor_emails,
  style, experience_is_published, experience_published_content,
  brand_color, unified_ringside_enabled, version, is_nationals
)
VALUES (
  'dededede-0000-0000-0000-000000000010',
  'Heartland Scent Work Classic',
  'AKC',
  'A two-day AKC Scent Work demo trial used to showcase the myK9Show experience.',
  '2026-08-01 00:00:00+00', '2026-08-03 00:00:00+00',
  '2026-06-01 00:00:00+00', '2026-09-01 00:00:00+00',
  '100 Dog Show Lane, Tulsa, OK 74101',
  'Tulsa', 'Oklahoma',
  'published',
  'dededede-0000-0000-0000-000000000001',
  30.00, 35.00,
  true, true,
  100, 125,
  'none', false, 48,
  true, true,
  true,
  'headline', false, '{}'::jsonb,
  '#0d4d4f', true, 3, false
);

-- Visibility settings: 'open' preset => scored results immediately public to anon.
INSERT INTO public.show_visibility_settings (
  show_id, preset, placement_timing, qualification_timing,
  time_timing, faults_timing, self_checkin_enabled
)
VALUES (
  'dededede-0000-0000-0000-000000000010',
  'open', 'class_complete', 'immediate', 'immediate', 'immediate', true
);

-- ---------------------------------------------------------------------------
-- 3. Trials (2)  -- trial_type 'scent_work', date literals within show window
-- ---------------------------------------------------------------------------
INSERT INTO public.trials (
  id, show_id, name, date, trial_number, status,
  planned_start_time, allow_self_checkin, trial_type, pipeline_stage,
  display_order, category, registry_id, timezone, version
)
VALUES
  ('dededede-0000-0000-0000-000000000021', 'dededede-0000-0000-0000-000000000010',
   'Saturday Trial', '2026-08-01', 'Saturday Trial', 'upcoming',
   '8:00 AM', false, 'scent_work', 1, 1, 'Saturday Trial', 'AKC', 'America/Chicago', 1),
  ('dededede-0000-0000-0000-000000000022', 'dededede-0000-0000-0000-000000000010',
   'Sunday Trial', '2026-08-02', 'Sunday Trial', 'upcoming',
   '8:00 AM', false, 'scent_work', 1, 2, 'Sunday Trial', 'AKC', 'America/Chicago', 1);

-- ---------------------------------------------------------------------------
-- 4. Classes (5)  -- valid element/level/section, status 'upcoming'
--    Saturday: 3 classes  |  Sunday: 2 classes
-- ---------------------------------------------------------------------------
INSERT INTO public.classes (
  id, trial_id, name, level, element, section,
  entry_fee, status, time_limit_seconds, num_hides, num_areas,
  has_blank, timer_mode, hides_known, display_order, version
)
VALUES
  ('dec1a55e-0000-0000-0000-000000000031', 'dededede-0000-0000-0000-000000000021',
   'Container Novice A', 'Novice', 'Container', 'A',
   30.00, 'upcoming', 120, 1, 1, false, 'single', true, 1, 1),
  ('dec1a55e-0000-0000-0000-000000000032', 'dededede-0000-0000-0000-000000000021',
   'Interior Advanced', 'Advanced', 'Interior', NULL,
   30.00, 'upcoming', 180, 2, 2, false, 'single', true, 2, 1),
  ('dec1a55e-0000-0000-0000-000000000033', 'dededede-0000-0000-0000-000000000021',
   'Exterior Excellent', 'Excellent', 'Exterior', NULL,
   30.00, 'upcoming', 180, 2, 1, false, 'single', false, 3, 1),
  ('dec1a55e-0000-0000-0000-000000000034', 'dededede-0000-0000-0000-000000000022',
   'Buried Master', 'Master', 'Buried', NULL,
   30.00, 'upcoming', 240, 3, 1, true, 'single', false, 1, 1),
  ('dec1a55e-0000-0000-0000-000000000035', 'dededede-0000-0000-0000-000000000022',
   'Interior Novice B', 'Novice', 'Interior', 'B',
   30.00, 'upcoming', 120, 1, 1, false, 'single', true, 2, 1);

-- ---------------------------------------------------------------------------
-- 5. Dogs (6)  -- owner_id resolved from protected accounts by email
--    Spread: 3 -> e2e-exhibitor, 2 -> beezley, 1 -> secretary
-- ---------------------------------------------------------------------------
INSERT INTO public.dogs (id, name, call_name, breed, sex, date_of_birth, color, status, owner_id, version)
VALUES
  ('dededede-0000-0000-0000-000000000041', 'Willow', 'Willow', 'Labrador Retriever', 'female', '2021-03-14', 'Black',  'active',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 1),
  ('dededede-0000-0000-0000-000000000042', 'Ranger', 'Ranger', 'German Shepherd Dog', 'male', '2020-07-02', 'Black & Tan', 'active',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 1),
  ('dededede-0000-0000-0000-000000000043', 'Juniper', 'Juni', 'Border Collie', 'female', '2022-05-20', 'Black & White', 'active',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 1),
  ('dededede-0000-0000-0000-000000000044', 'Scout', 'Scout', 'Australian Shepherd', 'male', '2019-11-08', 'Blue Merle', 'active',
   (SELECT id FROM public.people WHERE lower(email)='beezley@cox.net'), 1),
  ('dededede-0000-0000-0000-000000000045', 'Maple', 'Maple', 'Golden Retriever', 'female', '2021-09-30', 'Golden', 'active',
   (SELECT id FROM public.people WHERE lower(email)='beezley@cox.net'), 1),
  ('dededede-0000-0000-0000-000000000046', 'Cooper', 'Cooper', 'Beagle', 'male', '2023-01-12', 'Tricolor', 'active',
   (SELECT id FROM public.people WHERE lower(email)='secretary@myk9t.com'), 1);

-- ---------------------------------------------------------------------------
-- 6. Entries (8)  -- valid entry_status + payment_status, denormalized
--    show_id/trial_id, sequential armbands. handler_id = owner (demo).
--    Each (dog_id, class_id) pair is unique (entries_dog_class_unique_idx).
-- ---------------------------------------------------------------------------
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, handler,
  entry_status, payment_status, entry_fee, armband, run_order, move_up_requested, version
)
VALUES
  -- Willow (e2e-exhibitor): Container Novice A + Interior Advanced
  ('dededede-0000-0000-0000-000000000051',
   'dededede-0000-0000-0000-000000000041', 'dec1a55e-0000-0000-0000-000000000031',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'confirmed', 'paid', 30.00, 100, 1, false, 1),
  ('dededede-0000-0000-0000-000000000052',
   'dededede-0000-0000-0000-000000000041', 'dec1a55e-0000-0000-0000-000000000032',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'confirmed', 'paid', 30.00, 100, 1, false, 1),
  -- Ranger (e2e-exhibitor): Interior Advanced
  ('dededede-0000-0000-0000-000000000053',
   'dededede-0000-0000-0000-000000000042', 'dec1a55e-0000-0000-0000-000000000032',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'submitted', 'pending', 30.00, 101, 2, false, 1),
  -- Juniper (e2e-exhibitor): Exterior Excellent
  ('dededede-0000-0000-0000-000000000054',
   'dededede-0000-0000-0000-000000000043', 'dec1a55e-0000-0000-0000-000000000033',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'submitted', 'pending', 30.00, 102, 1, false, 1),
  -- Scout (beezley): Container Novice A + Buried Master (Sunday)
  ('dededede-0000-0000-0000-000000000055',
   'dededede-0000-0000-0000-000000000044', 'dec1a55e-0000-0000-0000-000000000031',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='beezley@cox.net'), 'Richard Beezley',
   'confirmed', 'paid', 30.00, 103, 2, false, 1),
  -- GAP FIXTURE #3 (pending move-up request): a move-up is NOT a separate table.
  -- The app models a pending request entirely on the entry row: entry_status=
  -- 'move-up-requested' + move_up_requested=true (see getPendingMoveUpRequests,
  -- which filters entries by entry_status='move-up-requested'). The target class
  -- is chosen by the secretary at approval time (processMoveUp(entryId,toClassId)),
  -- so nothing about the destination is stored on the pending row. We mark Scout's
  -- Buried Master entry as a confirmed+paid entry awaiting move-up approval.
  ('dededede-0000-0000-0000-000000000056',
   'dededede-0000-0000-0000-000000000044', 'dec1a55e-0000-0000-0000-000000000034',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000022',
   (SELECT id FROM public.people WHERE lower(email)='beezley@cox.net'), 'Richard Beezley',
   'move-up-requested', 'paid', 30.00, 103, 1, true, 1),
  -- Maple (beezley): Interior Novice B (Sunday)
  ('dededede-0000-0000-0000-000000000057',
   'dededede-0000-0000-0000-000000000045', 'dec1a55e-0000-0000-0000-000000000035',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000022',
   (SELECT id FROM public.people WHERE lower(email)='beezley@cox.net'), 'Richard Beezley',
   'submitted', 'pending', 30.00, 104, 1, false, 1),
  -- Cooper (secretary): Container Novice A
  ('dededede-0000-0000-0000-000000000058',
   'dededede-0000-0000-0000-000000000046', 'dec1a55e-0000-0000-0000-000000000031',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='secretary@myk9t.com'), 'Test Secretary',
   'confirmed', 'paid', 30.00, 105, 3, false, 1);

-- ---------------------------------------------------------------------------
-- 7. Armbands (one per dog, per show) -- the allocator/lookup treats the
--    `armbands` table as authoritative, so a seeded entry's armband must have a
--    matching armbands row or staff could reassign the same number. Unique on
--    (show_id, dog_id) and (show_id, armband_number). entry_id left NULL (a dog
--    has one armband across its entries); is_available=false (already assigned).
-- ---------------------------------------------------------------------------
INSERT INTO public.armbands (id, show_id, dog_id, armband_number, is_available, assigned_at, version)
VALUES
  ('dededede-0000-0000-0000-000000000061', 'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000041', '100', false, '2026-07-15 00:00:00+00', 1),
  ('dededede-0000-0000-0000-000000000062', 'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000042', '101', false, '2026-07-15 00:00:00+00', 1),
  ('dededede-0000-0000-0000-000000000063', 'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000043', '102', false, '2026-07-15 00:00:00+00', 1),
  ('dededede-0000-0000-0000-000000000064', 'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000044', '103', false, '2026-07-15 00:00:00+00', 1),
  ('dededede-0000-0000-0000-000000000065', 'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000045', '104', false, '2026-07-15 00:00:00+00', 1),
  ('dededede-0000-0000-0000-000000000066', 'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000046', '105', false, '2026-07-15 00:00:00+00', 1);

-- ---------------------------------------------------------------------------
-- 8. GAP FIXTURE #2 (released results): Container Novice A (class ...031) is
--    scored and publicly released. The public results gate is the per-field
--    CASCADE resolved by resolve_class_result_visibility(class_id), read through
--    view_public_entry_results — NOT the legacy show_visibility_settings row.
--    With NO show_result_visibility_defaults row (that relation does not exist on
--    this DB), the resolver falls back to the hardcoded 'open' preset:
--      placement=class_complete, qualification/time/faults=immediate.
--    => qualification/time/faults are visible immediately; PLACEMENT requires the
--    class to be in state 'completed' or 'released'. We therefore mark the class
--    completed + scoring-finalized AND stamp results_released_at (state='released').
--
--    The placement trigger (handle_entry_scoring_state_change -> refresh_class_
--    scoring_state -> recalculate_class_placements) is AFTER UPDATE only and never
--    fires on INSERT, so it does NOT auto-place these freshly-inserted rows. We set
--    final_placement explicitly to the exact values that trigger would compute:
--    for a non-nationals class it ranks by total_faults ASC, search_time_seconds
--    ASC among is_scored=true AND result_status='qualified'. All three qualify with
--    0 faults, so the order is purely fastest time first:
--      Willow 38.50s -> 1, Scout 41.20s -> 2, Cooper 45.80s -> 3.
-- ---------------------------------------------------------------------------
UPDATE public.entries SET
  is_scored = true, result_status = 'qualified', check_in_status = 'completed',
  entry_status = 'completed', search_time_seconds = 38.50, total_faults = 0,
  total_score = 100, final_placement = 1,
  scoring_completed_at = '2026-08-01 09:15:00+00'
WHERE id = 'dededede-0000-0000-0000-000000000051';  -- Willow
UPDATE public.entries SET
  is_scored = true, result_status = 'qualified', check_in_status = 'completed',
  entry_status = 'completed', search_time_seconds = 41.20, total_faults = 0,
  total_score = 100, final_placement = 2,
  scoring_completed_at = '2026-08-01 09:22:00+00'
WHERE id = 'dededede-0000-0000-0000-000000000055';  -- Scout
UPDATE public.entries SET
  is_scored = true, result_status = 'qualified', check_in_status = 'completed',
  entry_status = 'completed', search_time_seconds = 45.80, total_faults = 0,
  total_score = 100, final_placement = 3,
  scoring_completed_at = '2026-08-01 09:30:00+00'
WHERE id = 'dededede-0000-0000-0000-000000000058';  -- Cooper

-- Finalize the class so the placement field clears the 'class_complete' gate and
-- the results read as RELEASED. scored_count = 3 (all entries in ...031 scored).
UPDATE public.classes SET
  status = 'completed', is_scoring_finalized = true, scored_count = 3,
  results_released_at = '2026-08-01 09:35:00+00'
WHERE id = 'dec1a55e-0000-0000-0000-000000000031';

-- ---------------------------------------------------------------------------
-- 9. GAP FIXTURE #4 (refunded/withdrawn entry, P1-04 seam): one new fixed-id
--    entry (...059) for Maple in Exterior Excellent (...033). entry_status=
--    'withdrawn' + payment_status='refunded' with refund columns populated.
--    Maple has no other entry in ...033, and withdrawn/scratched rows are excluded
--    from entries_dog_class_unique_idx anyway, so there is no unique-index clash.
--    The refund columns (refund_amount/refund_notes/refunded_at) are guarded by
--    trg_restrict_entry_refund_columns_insert, which raises unless the current role
--    is service_role; we briefly SET LOCAL ROLE service_role for this one insert
--    (the documented manual path) then RESET. No armbands row is created for a
--    withdrawn entry. payment_method left NULL so the paid-online insert guard
--    (entries_protect_payment_fields_insert, which only fires for online refunds)
--    does not trip.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, handler,
  entry_status, payment_status, entry_fee, armband, run_order, move_up_requested,
  withdrawal_reason, refund_amount, refund_notes, refunded_at, version
)
VALUES
  ('dededede-0000-0000-0000-000000000059',
   'dededede-0000-0000-0000-000000000045', 'dec1a55e-0000-0000-0000-000000000033',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='beezley@cox.net'), 'Richard Beezley',
   'withdrawn', 'refunded', 30.00, NULL, NULL, false,
   'Exhibitor withdrew before the show; full refund issued.',
   30.00, 'Demo refund for the withdrawn-entry walk fixture.',
   '2026-07-20 00:00:00+00', 1);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 10. Demo RBAC role grants  (F1 fix — audit 04-secretary-rewalk-2026-06-17)
--     The Lane 1.1 wipe restores the protected ACCOUNTS but NOT their role
--     grants, so after a reseed secretary@myk9t.com / e2e-secretary@test.myk9.com
--     and club@myk9t.com / e2e-clubadmin@test.myk9.com hold only `exhibitor`.
--     Result: /secretary/* and /club-admin/* 403 with "You don't have permission
--     to access this page" and the sidebar renders exhibitor-only — the entire
--     secretary golden path is unreachable with the canonical demo account.
--     Granting the missing roles here makes a reseed restore a working flow.
--
--     CLUB-SCOPED, NOT GLOBAL: enforce_club_id_for_scoped_roles() (migration 102)
--     RAISES check_violation if a secretary/club_admin grant has a NULL club_id,
--     so every row below is scoped to the Heartland club (...0001) created in
--     section 1 of this same transaction. The route guards match by role NAME
--     (scope-agnostic — getUniqueActiveRoleNames flattens names), so one
--     club-scoped row satisfies them.
--
--     auth_user_id is set from people.auth_user_id (the canonical auth link, and
--     the exact value the sync_user_roles_auth_user_id trigger from migration 156
--     would backfill). It is NOT NULL on this table, so a person with no linked
--     auth account would fail loudly here rather than seed a broken grant.
--
--     IDEMPOTENT: the unique key is (user_id, role_id, club_id, show_id); the
--     NOT EXISTS guard matches on that key, so re-runs are no-ops AND the manual
--     one-off unblock row already inserted for secretary@myk9t.com is respected.
--     granted_at is a literal (no now()) to keep repeated runs byte-identical.
-- ---------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id, granted_at)
SELECT p.id, r.id, 'dededede-0000-0000-0000-000000000001', true, p.auth_user_id, '2026-06-17 00:00:00+00'
FROM public.people p
CROSS JOIN public.roles r
WHERE r.name = 'secretary'
  AND lower(p.email) IN ('secretary@myk9t.com', 'e2e-secretary@test.myk9.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id
      AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
      AND ur.show_id IS NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id, granted_at)
SELECT p.id, r.id, 'dededede-0000-0000-0000-000000000001', true, p.auth_user_id, '2026-06-17 00:00:00+00'
FROM public.people p
CROSS JOIN public.roles r
WHERE r.name = 'club_admin'
  AND lower(p.email) IN ('club@myk9t.com', 'e2e-clubadmin@test.myk9.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id
      AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
      AND ur.show_id IS NULL);

COMMIT;

-- ============================================================================
-- End of Lane 1.1 demo reseed.
-- ============================================================================
