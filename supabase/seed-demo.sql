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
DELETE FROM public.entries WHERE id IN (
  'dededede-0000-0000-0000-000000000051','dededede-0000-0000-0000-000000000052',
  'dededede-0000-0000-0000-000000000053','dededede-0000-0000-0000-000000000054',
  'dededede-0000-0000-0000-000000000055','dededede-0000-0000-0000-000000000056',
  'dededede-0000-0000-0000-000000000057','dededede-0000-0000-0000-000000000058'
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
  '2026-07-01 00:00:00+00', '2026-07-28 00:00:00+00',
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
  entry_status, payment_status, entry_fee, armband, run_order, version
)
VALUES
  -- Willow (e2e-exhibitor): Container Novice A + Interior Advanced
  ('dededede-0000-0000-0000-000000000051',
   'dededede-0000-0000-0000-000000000041', 'dec1a55e-0000-0000-0000-000000000031',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'confirmed', 'paid', 30.00, 100, 1, 1),
  ('dededede-0000-0000-0000-000000000052',
   'dededede-0000-0000-0000-000000000041', 'dec1a55e-0000-0000-0000-000000000032',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'confirmed', 'paid', 30.00, 100, 1, 1),
  -- Ranger (e2e-exhibitor): Interior Advanced
  ('dededede-0000-0000-0000-000000000053',
   'dededede-0000-0000-0000-000000000042', 'dec1a55e-0000-0000-0000-000000000032',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'submitted', 'pending', 30.00, 101, 2, 1),
  -- Juniper (e2e-exhibitor): Exterior Excellent
  ('dededede-0000-0000-0000-000000000054',
   'dededede-0000-0000-0000-000000000043', 'dec1a55e-0000-0000-0000-000000000033',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'submitted', 'pending', 30.00, 102, 1, 1),
  -- Scout (beezley): Container Novice A + Buried Master (Sunday)
  ('dededede-0000-0000-0000-000000000055',
   'dededede-0000-0000-0000-000000000044', 'dec1a55e-0000-0000-0000-000000000031',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='beezley@cox.net'), 'Richard Beezley',
   'confirmed', 'paid', 30.00, 103, 2, 1),
  ('dededede-0000-0000-0000-000000000056',
   'dededede-0000-0000-0000-000000000044', 'dec1a55e-0000-0000-0000-000000000034',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000022',
   (SELECT id FROM public.people WHERE lower(email)='beezley@cox.net'), 'Richard Beezley',
   'submitted', 'pending', 30.00, 103, 1, 1),
  -- Maple (beezley): Interior Novice B (Sunday)
  ('dededede-0000-0000-0000-000000000057',
   'dededede-0000-0000-0000-000000000045', 'dec1a55e-0000-0000-0000-000000000035',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000022',
   (SELECT id FROM public.people WHERE lower(email)='beezley@cox.net'), 'Richard Beezley',
   'submitted', 'pending', 30.00, 104, 1, 1),
  -- Cooper (secretary): Container Novice A
  ('dededede-0000-0000-0000-000000000058',
   'dededede-0000-0000-0000-000000000046', 'dec1a55e-0000-0000-0000-000000000031',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='secretary@myk9t.com'), 'Test Secretary',
   'confirmed', 'paid', 30.00, 105, 3, 1);

COMMIT;

-- ============================================================================
-- End of Lane 1.1 demo reseed.
-- ============================================================================
