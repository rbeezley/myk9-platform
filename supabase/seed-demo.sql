-- ============================================================================
-- Lane 1.1 Demo Reseed  (myK9Show / Supabase project sojmvhhwsjxmfistvzbe)
-- ----------------------------------------------------------------------------
-- WHAT THIS IS
--   A small, realistic, *publicly visible* demo dataset (1 club, 1 published
--   AKC scent-work show, 2 trials, 5 classes, 6 dogs, 8 entries) with COMPLETE
--   show officials and full RBAC role coverage so every role's golden path is
--   walkable after a reseed:
--     - Show officials are modeled through user_roles grants. classes.judge_name
--       remains a snapshot of the assigned judge (section 2 + 4).
--     - Judges modeled as PEOPLE, not strings: judge_qualifications rows carry
--       each judge's number + disciplines (section 13); CLASS-LEVEL
--       judge_assignments put all 5 classes on each judge's dashboard (section
--       11 — trial/show-level rows are dropped by the dashboard). Login optional.
--     - RBAC grants for secretary, club_admin, judge, steward, AND chairman
--       (section 10/10b/10c/10d) — not just secretary/club_admin as before.
--     - Known ringside passcodes (section 12).
--   Intended to be run AFTER the hard wipe that clears all shows/trials/classes/
--   entries/dogs/clubs and all non-protected people.
--
-- WHAT THIS IS NOT
--   It does NOT create people and does NOT touch auth.users. The 11 protected
--   accounts survive the wipe; this seed references them by email lookup
--   (subquery on public.people) so the fixed UUIDs below never collide with
--   real account ids. Dogs/entries are attached to:
--     - e2e-exhibitor@test.myk9.com  (primary demo exhibitor)
--     - e2e-secretary@test.myk9.com  (Test Secretary)
--     - e2e-admin@test.myk9.com      (club administrator / chairman)
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
    'e2e-exhibitor@test.myk9.com', 'e2e-secretary@test.myk9.com',
    -- Section 10 grants RBAC roles to these accounts by email; a missing/dup row
    -- would silently grant nothing (re-introducing the F1 secretary-403 bug),
    -- so require each to resolve to exactly one person here.
    'e2e-admin@test.myk9.com',
    -- Judge / steward grant accounts (added so the judge + steward golden paths
    -- survive a reseed; previously only secretary/club_admin were guaranteed).
    'e2e-judge@test.myk9.com'
  ] LOOP
    SELECT count(*) INTO v_count FROM public.people WHERE lower(email) = v_email;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'seed-demo preflight: expected exactly 1 person for %, found %', v_email, v_count;
    END IF;
  END LOOP;

  -- Section 10 grants by role NAME; a renamed/absent role would also silently
  -- grant nothing. Require every granted role to exist exactly once.
  FOREACH v_email IN ARRAY ARRAY['secretary', 'club_admin', 'judge', 'steward', 'chairman'] LOOP
    SELECT count(*) INTO v_count FROM public.roles WHERE name = v_email;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'seed-demo preflight: expected exactly 1 role named %, found %', v_email, v_count;
    END IF;
  END LOOP;

  -- Section 10 sets user_roles.auth_user_id = people.auth_user_id, but that
  -- column is NULLABLE (migration 156's header planned a NOT NULL constraint
  -- "after backfill" — the body never added it). A grant account whose
  -- people.auth_user_id is NULL would seed a grant the RLS helpers
  -- (ur.auth_user_id = auth.uid()) can NEVER match — a silent broken role, the
  -- same 403 symptom this seed exists to prevent. Require each RBAC grant
  -- account to resolve to exactly one person WITH a non-null auth_user_id.
  -- (e2e-admin holds the chairman grant; the judge account is added for
  -- section 10b and the secretary account also receives steward access.)
  FOREACH v_email IN ARRAY ARRAY[
    'e2e-secretary@test.myk9.com', 'e2e-admin@test.myk9.com',
    'e2e-judge@test.myk9.com'
  ] LOOP
    SELECT count(*) INTO v_count
    FROM public.people
    WHERE lower(email) = v_email AND auth_user_id IS NOT NULL;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'seed-demo preflight: grant account % must resolve to exactly 1 person with a non-null auth_user_id (found %)', v_email, v_count;
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
--   entry  dededede-0000-0000-0000-00000000005{1..8}  (+ ...059/...060 refund fixtures)
--   armband      dededede-0000-0000-0000-00000000006{1..6}
--   judge_assign dededede-0000-0000-0000-0000000000a{1..5} (judge@) / b{1..5} (e2e-judge), class-level
--   passcode     dededede-0000-0000-0000-00000000008{1,2}
--   judge_qual   dededede-0000-0000-0000-00000000009{1,2}

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
-- entries ...059 / ...060 are the GAP FIXTURE #4 withdrawn/refunded rows (added
-- below: ...059 owned by beezley, ...060 owned by e2e-exhibitor for the P1-04
-- exhibitor-surface walk). The refund-column guard fires only on INSERT/UPDATE,
-- so a plain DELETE needs no role switch. entry_status_history rows cascade-delete
-- with their entry.
DELETE FROM public.entries WHERE id IN (
  'dededede-0000-0000-0000-000000000051','dededede-0000-0000-0000-000000000052',
  'dededede-0000-0000-0000-000000000053','dededede-0000-0000-0000-000000000054',
  'dededede-0000-0000-0000-000000000055','dededede-0000-0000-0000-000000000056',
  'dededede-0000-0000-0000-000000000057','dededede-0000-0000-0000-000000000058',
  'dededede-0000-0000-0000-000000000059','dededede-0000-0000-0000-000000000060'
);
DELETE FROM public.classes WHERE id IN (
  'dec1a55e-0000-0000-0000-000000000031','dec1a55e-0000-0000-0000-000000000032',
  'dec1a55e-0000-0000-0000-000000000033','dec1a55e-0000-0000-0000-000000000034',
  'dec1a55e-0000-0000-0000-000000000035',
  -- UKC Nosework / ASCA Scent Detection registry demo classes (task 6.3)
  'dec1a55e-0000-0000-0000-000000000036','dec1a55e-0000-0000-0000-000000000037',
  'dec1a55e-0000-0000-0000-000000000038','dec1a55e-0000-0000-0000-000000000039'
);
DELETE FROM public.dogs WHERE id IN (
  'dededede-0000-0000-0000-000000000041','dededede-0000-0000-0000-000000000042',
  'dededede-0000-0000-0000-000000000043','dededede-0000-0000-0000-000000000044',
  'dededede-0000-0000-0000-000000000045','dededede-0000-0000-0000-000000000046'
);
DELETE FROM public.trials WHERE id IN (
  'dededede-0000-0000-0000-000000000021','dededede-0000-0000-0000-000000000022',
  -- UKC Nosework / ASCA Scent Detection registry demo trials (task 6.3)
  'dededede-0000-0000-0000-000000000023','dededede-0000-0000-0000-000000000024'
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
  'e2e-admin@test.myk9.com',
  'Demo scent work club for the myK9Show showcase dataset.',
  'HSWC-001', 1
);

-- Stripe Connect sandbox account for the demo club.
-- payouts_enabled=true gates the stripe-checkout edge function's online-entry
-- check. The session itself doesn't use Connect (no transfer_data), so a
-- sandbox placeholder account id is safe for testing.
INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES (
  'dededede-0000-0000-0000-000000000001',
  'acct_test_dededede_sandbox',
  true,
  true,
  false
)
ON CONFLICT (club_id, livemode) DO UPDATE
  SET stripe_account_id   = EXCLUDED.stripe_account_id,
      onboarding_complete = EXCLUDED.onboarding_complete,
      payouts_enabled     = EXCLUDED.payouts_enabled;

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
  brand_color, version, is_nationals
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
  '#0d4d4f', 3, false
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
   '8:00 AM', false, 'scent_work', 1, 2, 'Sunday Trial', 'AKC', 'America/Chicago', 1),
  -- Multi-registry demo coverage (task 6.3): same show, different sanctioning
  -- body per trial (trials.registry_id is per-trial, NOT per-show — see
  -- CLAUDE.md heritage/registry notes). Same Sunday date as the AKC trial
  -- above; a later display_order keeps tab ordering stable.
  ('dededede-0000-0000-0000-000000000023', 'dededede-0000-0000-0000-000000000010',
   'Sunday UKC Nosework', '2026-08-02', 'UKC-Nosework', 'upcoming',
   '1:00 PM', false, 'nosework', 1, 3, 'Sunday UKC Nosework', 'UKC', 'America/Chicago', 1),
  ('dededede-0000-0000-0000-000000000024', 'dededede-0000-0000-0000-000000000010',
   'Sunday ASCA Scent Detection', '2026-08-02', 'ASCA-ScentDetection', 'upcoming',
   '2:00 PM', false, 'scent_detection', 1, 4, 'Sunday ASCA Scent Detection', 'ASCA', 'America/Chicago', 1);

-- ---------------------------------------------------------------------------
-- 4. Classes (9)  -- valid element/level/section, status 'upcoming'
--    Saturday: 3 classes  |  Sunday: 2 classes  |  Sunday UKC: 2  |  Sunday ASCA: 2
--    judge_name is a DENORMALIZED SNAPSHOT of the assigned judge ('Test Judge' =
--    e2e-judge@test.myk9.com), NOT the source of truth: the relational link is
--    judge_assignments.person_id (section 11) + judge_qualifications (section 13).
--    Kept as a label so historical scorecards/reports print the name as-judged.
-- ---------------------------------------------------------------------------
INSERT INTO public.classes (
  id, trial_id, name, level, element, section, judge_name,
  entry_fee, status, time_limit_seconds, num_hides, num_areas,
  has_blank, timer_mode, hides_known, display_order, version
)
VALUES
  ('dec1a55e-0000-0000-0000-000000000031', 'dededede-0000-0000-0000-000000000021',
   'Container Novice A', 'Novice', 'Container', 'A', 'Test Judge',
   30.00, 'upcoming', 120, 1, 1, false, 'single', true, 1, 1),
  ('dec1a55e-0000-0000-0000-000000000032', 'dededede-0000-0000-0000-000000000021',
   'Interior Advanced', 'Advanced', 'Interior', NULL, 'Test Judge',
   30.00, 'upcoming', 180, 2, 2, false, 'single', true, 2, 1),
  ('dec1a55e-0000-0000-0000-000000000033', 'dededede-0000-0000-0000-000000000021',
   'Exterior Excellent', 'Excellent', 'Exterior', NULL, 'Test Judge',
   30.00, 'upcoming', 180, 2, 1, false, 'single', false, 3, 1),
  ('dec1a55e-0000-0000-0000-000000000034', 'dededede-0000-0000-0000-000000000022',
   'Buried Master', 'Master', 'Buried', NULL, 'Test Judge',
   30.00, 'upcoming', 240, 3, 1, true, 'single', false, 1, 1),
  ('dec1a55e-0000-0000-0000-000000000035', 'dededede-0000-0000-0000-000000000022',
   'Interior Novice B', 'Novice', 'Interior', 'B', 'Test Judge',
   30.00, 'upcoming', 120, 1, 1, false, 'single', true, 2, 1),
  -- UKC Nosework (registry_id 'UKC' on trial ...023) -- elements/levels per
  -- sport_templates 'ukc-nosework' (030_seed_sport_templates.sql): Container,
  -- Interior, Exterior, Vehicle, Handler Discrimination x Novice..Elite.
  ('dec1a55e-0000-0000-0000-000000000036', 'dededede-0000-0000-0000-000000000023',
   'Container Novice', 'Novice', 'Container', NULL, 'Test Judge',
   30.00, 'upcoming', 120, 1, 1, false, 'single', true, 1, 1),
  ('dec1a55e-0000-0000-0000-000000000037', 'dededede-0000-0000-0000-000000000023',
   'Vehicle Advanced', 'Advanced', 'Vehicle', NULL, 'Test Judge',
   30.00, 'upcoming', 180, 2, 1, false, 'single', true, 2, 1),
  -- ASCA Scent Detection (registry_id 'ASCA' on trial ...024) -- elements/levels
  -- per sport_templates 'asca-scent-detection': Container, Interior, Exterior,
  -- Vehicle x Novice/Open/Advanced/Excellent.
  ('dec1a55e-0000-0000-0000-000000000038', 'dededede-0000-0000-0000-000000000024',
   'Container Novice', 'Novice', 'Container', NULL, 'Test Judge',
   30.00, 'upcoming', 120, 1, 1, false, 'single', true, 1, 1),
  ('dec1a55e-0000-0000-0000-000000000039', 'dededede-0000-0000-0000-000000000024',
   'Exterior Open', 'Open', 'Exterior', NULL, 'Test Judge',
   30.00, 'upcoming', 180, 2, 1, false, 'single', true, 2, 1);

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
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 1),
  ('dededede-0000-0000-0000-000000000045', 'Maple', 'Maple', 'Golden Retriever', 'female', '2021-09-30', 'Golden', 'active',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 1),
  ('dededede-0000-0000-0000-000000000046', 'Cooper', 'Cooper', 'Beagle', 'male', '2023-01-12', 'Tricolor', 'active',
   (SELECT id FROM public.people WHERE lower(email)='e2e-secretary@test.myk9.com'), 1);

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
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'confirmed', 'paid', 30.00, 103, 2, false, 1),
  -- GAP FIXTURE #3 (pending move-up request): a move-up is NOT a separate table.
  -- The app models a pending request entirely on the entry row: entry_status=
  -- 'move-up-requested' + move_up_requested=true (see getPendingMoveUpRequests,
  -- which filters entries by entry_status='move-up-requested'). The target class
  -- is chosen by the secretary at approval time (processMoveUp(entryId,toClassId)),
  -- so nothing about the destination is stored on the pending row. We put Scout in
  -- Interior Novice B (035, trial 022) so the approve dialog can show a valid
  -- target: Interior Advanced (032, trial 021), same element, higher level.
  ('dededede-0000-0000-0000-000000000056',
   'dededede-0000-0000-0000-000000000044', 'dec1a55e-0000-0000-0000-000000000035',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000022',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'move-up-requested', 'paid', 30.00, 103, 1, true, 1),
  -- Maple (beezley): Interior Novice B (Sunday)
  ('dededede-0000-0000-0000-000000000057',
   'dededede-0000-0000-0000-000000000045', 'dec1a55e-0000-0000-0000-000000000035',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000022',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'submitted', 'pending', 30.00, 104, 1, false, 1),
  -- Cooper (secretary): Container Novice A
  ('dededede-0000-0000-0000-000000000058',
   'dededede-0000-0000-0000-000000000046', 'dec1a55e-0000-0000-0000-000000000031',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='e2e-secretary@test.myk9.com'), 'Test Secretary',
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
-- 9. GAP FIXTURE #4 (refunded/withdrawn entries, P1-04 seam): two new fixed-id
--    entries, both entry_status='withdrawn' + payment_status='refunded' with the
--    refund columns populated:
--      ...059  Maple (beezley)        in Exterior Excellent (...033)
--      ...060  Ranger (e2e-exhibitor) in Exterior Excellent (...033)
--    The ...060 row is owned by a PURE EXHIBITOR so the withdrawn/refunded state
--    can be walked on the exhibitor-only Show Details "My Entries" tab — a
--    site-admin owner (beezley/...059) gets the management "Entries" tab instead
--    and never renders that surface (ShowDetailsPage canManageShow switch).
--    Neither dog has another entry in ...033, and withdrawn/scratched rows are
--    excluded from entries_dog_class_unique_idx anyway, so there is no unique-index
--    clash. The refund columns (refund_amount/refund_notes/refunded_at) are guarded
--    by trg_restrict_entry_refund_columns_insert, which raises unless the current
--    role is service_role. Hosted Supabase grants that role the baseline table
--    privileges before RLS; the isolated lifecycle mirrors the same applied ACLs
--    before running this seed. We therefore use the documented guarded role for
--    these inserts without changing schema privileges here. No armbands row is
--    created for a withdrawn entry. payment_method is left NULL so the paid-online
--    insert guard (entries_protect_payment_fields_insert, which only fires for
--    online refunds) does not trip.
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
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'withdrawn', 'refunded', 30.00, NULL, NULL, false,
   'Exhibitor withdrew before the show; full refund issued.',
   30.00, 'Demo refund for the withdrawn-entry walk fixture.',
   '2026-06-01 00:00:00+00', 1),
  ('dededede-0000-0000-0000-000000000060',
   'dededede-0000-0000-0000-000000000042', 'dec1a55e-0000-0000-0000-000000000033',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='e2e-exhibitor@test.myk9.com'), 'Test Exhibitor',
   'withdrawn', 'refunded', 30.00, NULL, NULL, false,
   'Exhibitor withdrew before the show; full refund issued.',
   30.00, 'Demo refund for the withdrawn-entry walk fixture (exhibitor-owned).',
   '2026-06-01 00:00:00+00', 1);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 10. Demo RBAC role grants  (F1 fix — audit 04-secretary-rewalk-2026-06-17)
--     The Lane 1.1 wipe restores the protected ACCOUNTS but NOT their role
--     grants, so after a reseed e2e-secretary@test.myk9.com and
--     e2e-admin@test.myk9.com hold only `exhibitor`.
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
--     would backfill). The column is NULLABLE, so a person with a NULL
--     auth_user_id would seed a grant the RLS helpers never match — the preflight
--     above rejects that case (requires non-null auth_user_id for all four
--     accounts) so it cannot reach this INSERT.
--
--     REACTIVATE-THEN-INSERT (idempotent + revoke-safe): the unique key is
--     (user_id, role_id, club_id, show_id). The app revokes a role by SOFT-
--     deactivating its user_roles row (is_active = false), not deleting it, so a
--     bare NOT EXISTS guard would treat a revoked grant as "already present" and
--     leave the 403 in place across a reseed. Each role therefore runs an UPDATE
--     that flips any matching inactive row back to active BEFORE the INSERT fills
--     genuinely-missing rows. The UPDATE also clears expires_at: the RBAC helpers
--     gate on (expires_at IS NULL OR expires_at > NOW()), so an active-but-expired
--     grant is effectively dead and would survive an is_active-only reactivation —
--     a permanent demo grant must have no expiry. It likewise refreshes
--     auth_user_id. The UPDATE's WHERE excludes already-correct rows (active,
--     right auth id, no expiry), so a clean re-run touches nothing (UPDATE 0 /
--     INSERT 0) and the manual one-off unblock row for e2e-secretary@test.myk9.com is
--     respected. granted_at is a literal (no now()) so inserts stay
--     byte-identical; reactivation only fires when state diverges.
-- ---------------------------------------------------------------------------
UPDATE public.user_roles ur
SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL
FROM public.people p, public.roles r
WHERE ur.user_id = p.id AND ur.role_id = r.id
  AND r.name = 'secretary'
  AND lower(p.email) = 'e2e-secretary@test.myk9.com'
  AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
  AND ur.show_id IS NULL
  AND (ur.is_active IS DISTINCT FROM true
       OR ur.auth_user_id IS DISTINCT FROM p.auth_user_id
       OR ur.expires_at IS NOT NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id, granted_at)
SELECT p.id, r.id, 'dededede-0000-0000-0000-000000000001', true, p.auth_user_id, '2026-06-17 00:00:00+00'
FROM public.people p
CROSS JOIN public.roles r
WHERE r.name = 'secretary'
  AND lower(p.email) = 'e2e-secretary@test.myk9.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id
      AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
      AND ur.show_id IS NULL);

UPDATE public.user_roles ur
SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL
FROM public.people p, public.roles r
WHERE ur.user_id = p.id AND ur.role_id = r.id
  AND r.name = 'club_admin'
  AND lower(p.email) = 'e2e-admin@test.myk9.com'
  AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
  AND ur.show_id IS NULL
  AND (ur.is_active IS DISTINCT FROM true
       OR ur.auth_user_id IS DISTINCT FROM p.auth_user_id
       OR ur.expires_at IS NOT NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id, granted_at)
SELECT p.id, r.id, 'dededede-0000-0000-0000-000000000001', true, p.auth_user_id, '2026-06-17 00:00:00+00'
FROM public.people p
CROSS JOIN public.roles r
WHERE r.name = 'club_admin'
  AND lower(p.email) = 'e2e-admin@test.myk9.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id
      AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
      AND ur.show_id IS NULL);

-- ---------------------------------------------------------------------------
-- 10b/10c/10d. Judge / steward / chairman grants (parity with secretary +
--     club_admin above). Section 10 historically guaranteed ONLY secretary and
--     club_admin, so after a reseed the judge, steward, and chairman golden
--     paths 403 exactly like the original F1 secretary bug:
--       * /judge/* requires UserRole.JUDGE (judgeRoutes.tsx) — a section-11
--         judge_assignments row fixes the judge's SCHEDULING surface but does
--         NOT satisfy the route guard, which matches the role NAME. Both judge
--         accounts therefore need an explicit `judge` user_roles grant here.
--       * Steward ringside routes admit UserRole.STEWARD; e2e-secretary needs it.
--       * Chairman has no dedicated account, so per the demo decision the club
--         officer doubles as show chairman: the two club_admin accounts also
--         receive `chairman`.
--
--     CLUB SCOPE: migration 102's club_id-NOT-NULL constraint trigger covers
--     ONLY secretary / trial_secretary / club_admin — judge/steward/chairman may
--     legally carry a NULL club_id. We still club-scope them to Heartland
--     (...0001) for consistency with the rows above and stability across reseeds
--     (the club id is fixed); the name-based route guards are scope-agnostic, so
--     a club-scoped row satisfies them. Same revoke-safe reactivate-then-insert
--     pattern (flip a soft-deactivated/expired row active before filling missing
--     rows), so a clean re-run is UPDATE 0 / INSERT 0.
-- ---------------------------------------------------------------------------
-- 10b. judge -> e2e-judge@test.myk9.com
UPDATE public.user_roles ur
SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL
FROM public.people p, public.roles r
WHERE ur.user_id = p.id AND ur.role_id = r.id
  AND r.name = 'judge'
  AND lower(p.email) = 'e2e-judge@test.myk9.com'
  AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
  AND ur.show_id IS NULL
  AND (ur.is_active IS DISTINCT FROM true
       OR ur.auth_user_id IS DISTINCT FROM p.auth_user_id
       OR ur.expires_at IS NOT NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id, granted_at)
SELECT p.id, r.id, 'dededede-0000-0000-0000-000000000001', true, p.auth_user_id, '2026-06-17 00:00:00+00'
FROM public.people p
CROSS JOIN public.roles r
WHERE r.name = 'judge'
  AND lower(p.email) = 'e2e-judge@test.myk9.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id
      AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
      AND ur.show_id IS NULL);

-- 10c. steward -> e2e-secretary@test.myk9.com
UPDATE public.user_roles ur
SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL
FROM public.people p, public.roles r
WHERE ur.user_id = p.id AND ur.role_id = r.id
  AND r.name = 'steward'
  AND lower(p.email) = 'e2e-secretary@test.myk9.com'
  AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
  AND ur.show_id IS NULL
  AND (ur.is_active IS DISTINCT FROM true
       OR ur.auth_user_id IS DISTINCT FROM p.auth_user_id
       OR ur.expires_at IS NOT NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id, granted_at)
SELECT p.id, r.id, 'dededede-0000-0000-0000-000000000001', true, p.auth_user_id, '2026-06-17 00:00:00+00'
FROM public.people p
CROSS JOIN public.roles r
WHERE r.name = 'steward'
  AND lower(p.email) = 'e2e-secretary@test.myk9.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id
      AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
      AND ur.show_id IS NULL);

-- 10d. chairman -> e2e-admin@test.myk9.com (club officer doubles as chair)
UPDATE public.user_roles ur
SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL
FROM public.people p, public.roles r
WHERE ur.user_id = p.id AND ur.role_id = r.id
  AND r.name = 'chairman'
  AND lower(p.email) = 'e2e-admin@test.myk9.com'
  AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
  AND ur.show_id IS NULL
  AND (ur.is_active IS DISTINCT FROM true
       OR ur.auth_user_id IS DISTINCT FROM p.auth_user_id
       OR ur.expires_at IS NOT NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id, granted_at)
SELECT p.id, r.id, 'dededede-0000-0000-0000-000000000001', true, p.auth_user_id, '2026-06-17 00:00:00+00'
FROM public.people p
CROSS JOIN public.roles r
WHERE r.name = 'chairman'
  AND lower(p.email) = 'e2e-admin@test.myk9.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id
      AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
      AND ur.show_id IS NULL);

-- ---------------------------------------------------------------------------
-- 11. GAP FIXTURE #5 (judge handoff, audit 05-showday-walk S2): assign judges to
--     the Heartland show so /judge/dashboard surfaces assignments — the route into
--     ringside. Without this the judge dashboard reads "No Judging Assignments Yet"
--     and the judge golden path is unreachable.
--
--     MUST BE CLASS-LEVEL, NOT trial/show-level. The dashboard data path is
--     class-centric: useJudgeAssignments selects judge_assignments -> classes ->
--     trials and BOTH mappers DROP any row whose class is missing
--     (mapAssignmentRowToJudgeClass: `if (!cls || !trial) return null`;
--     mapReplicatedAssignmentToJudgeClass: `if (!a.classId ...) return null`). A
--     row with only show_id + trial_id (class_id NULL) therefore produces ZERO
--     dashboard classes — the judge still sees the empty state. So every row here
--     sets class_id. (This is also why a wizard-created SHOW-level assignment
--     does not reach the dashboard — a separate product gap, not seeded here.)
--
--     Coverage: both demo judges judge ALL 5 classes across both trials, so
--     whichever judge account a tester signs in as, the dashboard is full. Both
--     people are named "Test Judge" (matches classes.judge_name), so co-assigning
--     them to the same classes is consistent. trial_id matches each class's trial.
--       ...0b{1..5}  e2e-judge@test.myk9.com -> classes 031..035
--       ...0b{1..5}  e2e-judge@test.myk9.com -> classes 031..035
--
--     SCOPE NOTE: a judge_assignments row fixes the judge's SCHEDULING surface.
--     It does NOT by itself grant entry-visibility RLS at ringside — entries_select
--     (migration 129) admits only can_manage_show / handler / dog-owner, none of
--     which a judge_assignment satisfies. Ringside entry visibility for a
--     non-managing role is the passcode / ringside_session path (section 12). The
--     route GUARD (UserRole.JUDGE) is satisfied by the section 10b grant, not here.
--
--     Idempotent: delete ALL prior Heartland assignments (any judge), then
--     INSERT...SELECT joined to people by email — an absent judge account simply
--     drops its rows (person_id is NOT NULL, so we never insert a NULL). version
--     defaults to 1 (migration 20260608200000); confirmed => dashboard-active.
-- ---------------------------------------------------------------------------
DELETE FROM public.judge_assignments
WHERE show_id = 'dededede-0000-0000-0000-000000000010';

INSERT INTO public.judge_assignments (
  id, person_id, show_id, trial_id, class_id, status, confirmed_at, created_at, updated_at
)
SELECT
  v.id, p.id, 'dededede-0000-0000-0000-000000000010', v.trial_id, v.class_id,
  'confirmed', '2026-06-17 00:00:00+00', '2026-06-17 00:00:00+00', '2026-06-17 00:00:00+00'
FROM (VALUES
  -- e2e-judge@test.myk9.com -> all 5 classes (e2e suite dashboard coverage)
  ('dededede-0000-0000-0000-0000000000b1'::uuid, 'e2e-judge@test.myk9.com', 'dededede-0000-0000-0000-000000000021'::uuid, 'dec1a55e-0000-0000-0000-000000000031'::uuid),
  ('dededede-0000-0000-0000-0000000000b2'::uuid, 'e2e-judge@test.myk9.com', 'dededede-0000-0000-0000-000000000021'::uuid, 'dec1a55e-0000-0000-0000-000000000032'::uuid),
  ('dededede-0000-0000-0000-0000000000b3'::uuid, 'e2e-judge@test.myk9.com', 'dededede-0000-0000-0000-000000000021'::uuid, 'dec1a55e-0000-0000-0000-000000000033'::uuid),
  ('dededede-0000-0000-0000-0000000000b4'::uuid, 'e2e-judge@test.myk9.com', 'dededede-0000-0000-0000-000000000022'::uuid, 'dec1a55e-0000-0000-0000-000000000034'::uuid),
  ('dededede-0000-0000-0000-0000000000b5'::uuid, 'e2e-judge@test.myk9.com', 'dededede-0000-0000-0000-000000000022'::uuid, 'dec1a55e-0000-0000-0000-000000000035'::uuid)
) AS v(id, email, trial_id, class_id)
JOIN public.people p ON lower(p.email) = v.email;

-- ---------------------------------------------------------------------------
-- 12. GAP FIXTURE #6 (steward/judge ringside entry, audit 05-showday-walk S3):
--     seed KNOWN ringside passcodes for Heartland so the SmartSignInPage
--     "Email or show passcode" -> validate -> grant -> /at-show flow is walkable.
--
--     Passcodes are stored as peppered HMAC hashes plus encrypted ciphertext.
--     We compute both with the database's locked helpers so the seeded codes
--     validate and authorized show roles can revisit them in the access-code card.
--
--     DEMO CODES (hand these to testers — validator lowercases input):
--         admin   = 'ah4r8'      judge   = 'jh3k9'
--         steward = 's7m2p'      exhibitor = 'e5n8q'
--     Format must satisfy the client classifier regex /^[ajse][a-z0-9]{4}$/
--     (role letter a|j|s|e + 4 [a-z0-9]); the authoritative role is the DB row.
--
--     GUARDED: on a DB where the passcode_pepper Vault secret is unset,
--     _hash_passcode raises SQLSTATE 55000; the EXCEPTION handler catches ONLY that
--     case, rolls back this block's DELETE+INSERT, and RAISE NOTICEs rather than
--     aborting the whole reset. On such a DB, mint codes via regenerate_show_passcodes()
--     as a secretary instead. Any OTHER error (FK/constraint/missing-function) is a real
--     bug and propagates, so it surfaces loudly instead of silently committing a partial seed.
--
--     SCOPE NOTE: this makes the passcode SIGN-IN flow walkable. Whether a
--     passcode-only role then reads entries at ringside is a separate RLS/data-path
--     question flagged in the audit (S2/S3) — not something a seed can settle.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM public.show_passcodes WHERE show_id = 'dededede-0000-0000-0000-000000000010';
  INSERT INTO public.show_passcodes (
    id, show_id, role, passcode_hash, passcode_ciphertext, created_at
  ) VALUES
    ('dededede-0000-0000-0000-000000000080', 'dededede-0000-0000-0000-000000000010', 'admin',
     public._hash_passcode('ah4r8'), public._encrypt_show_passcode('ah4r8'),
     '2026-06-17 00:00:00+00'),
    ('dededede-0000-0000-0000-000000000081', 'dededede-0000-0000-0000-000000000010', 'judge',
     public._hash_passcode('jh3k9'), public._encrypt_show_passcode('jh3k9'),
     '2026-06-17 00:00:00+00'),
    ('dededede-0000-0000-0000-000000000082', 'dededede-0000-0000-0000-000000000010', 'steward',
     public._hash_passcode('s7m2p'), public._encrypt_show_passcode('s7m2p'),
     '2026-06-17 00:00:00+00'),
    ('dededede-0000-0000-0000-000000000083', 'dededede-0000-0000-0000-000000000010', 'exhibitor',
     public._hash_passcode('e5n8q'), public._encrypt_show_passcode('e5n8q'),
     '2026-06-17 00:00:00+00');
EXCEPTION WHEN sqlstate '55000' THEN
  RAISE NOTICE 'Skipped Heartland ringside passcode seed (% - %). passcode_pepper Vault secret is unset; mint via regenerate_show_passcodes() instead.', SQLSTATE, SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 13. Judge qualifications (people-table judge model, not free text).
--     A judge is a `people` row with attributes we reason about — their judge
--     NUMBER and WHAT THEY CAN JUDGE — recorded in judge_qualifications, NOT a
--     `classes.judge_name` string. (classes.judge_name above is a denormalized
--     report/scorecard SNAPSHOT of the assigned judge, never the source of
--     truth; the relational link is judge_assignments.person_id in section 11.)
--     A judge does NOT need a login for this — judge_qualifications.person_id
--     just references people; both demo judges happen to also hold a login +
--     the section 10b `judge` role grant, which is what surfaces them in the
--     secretary's "assign a judge" picker (judges/reads.ts inner-joins
--     user_roles), but the qualifications themselves are login-independent.
--
--     Columns the assignment UI reads (judges/reads.ts JUDGE_QUALIFICATIONS_SELECT):
--     organization, qualification_level, disciplines[], judge_number,
--     date_obtained, expiration_date, is_active. No CHECK constraints on level/
--     disciplines (free-form); we mirror the app's mock shape (disciplines =
--     ['Scent Work'], the sport — not per-element). RLS is FORCE-enabled but the
--     seed runs as the table owner via psql (same as every other insert here).
--
--     Idempotent: delete the two fixed-id rows, then INSERT...SELECT joined to
--     people by email (an absent judge account drops its row — person_id is NOT
--     NULL, never inserted NULL). Literal dates (file forbids now()/random).
-- ---------------------------------------------------------------------------
DELETE FROM public.judge_qualifications WHERE id IN (
  'dededede-0000-0000-0000-000000000091',
  'dededede-0000-0000-0000-000000000092'
);

INSERT INTO public.judge_qualifications (
  id, person_id, organization, qualification_level, disciplines, judge_number,
  date_obtained, expiration_date, is_active
)
SELECT
  v.id, p.id, 'AKC', 'Master', ARRAY['Scent Work'], v.judge_number,
  '2021-01-01', '2027-01-01', true
FROM (VALUES
  ('dededede-0000-0000-0000-000000000092'::uuid, 'e2e-judge@test.myk9.com', 'AKC-SW-1002')
) AS v(id, email, judge_number)
JOIN public.people p ON lower(p.email) = v.email;

-- ---------------------------------------------------------------------------
-- 14. GAP FIXTURE #5 (move-up entry class patch, screenshot S-17)
--     Entry ...056 was originally seeded as Scout/Buried Master. Buried Master
--     is the highest Buried level in this show, so the approve dialog showed
--     "no valid target." Patched to Interior Novice B (035, trial 022) so the
--     dialog can offer Interior Advanced (032) as a valid move-up destination.
--     The WHERE clause makes this a no-op on a fresh seed (entry is already 035).
-- ---------------------------------------------------------------------------
UPDATE public.entries
SET class_id = 'dec1a55e-0000-0000-0000-000000000035',
    trial_id  = 'dededede-0000-0000-0000-000000000022'
WHERE id       = 'dededede-0000-0000-0000-000000000056'
  AND class_id = 'dec1a55e-0000-0000-0000-000000000034';  -- only if still Buried Master

-- ---------------------------------------------------------------------------
-- 15. GAP FIXTURE #6 (waitlist entry, screenshot S-10)
--     Juniper (043) waitlisted for Interior Advanced (032) at position 1.
--     exhibitor_id references exhibitor_profiles, which only exists after the
--     exhibitor signs in (auto-created by trigger on first auth). Skips silently
--     with a NOTICE if the profile is not yet present.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_exhibitor_id uuid;
BEGIN
  SELECT ep.id INTO v_exhibitor_id
  FROM   public.exhibitor_profiles ep
  JOIN   public.people p ON p.id = ep.person_id
  WHERE  lower(p.email) = 'e2e-exhibitor@test.myk9.com'
  LIMIT  1;

  IF v_exhibitor_id IS NULL THEN
    RAISE NOTICE 'Section 15 skipped: exhibitor_profile for e2e-exhibitor@test.myk9.com not found (sign-in once to create it)';
    RETURN;
  END IF;

  INSERT INTO public.waitlist_entries (
    class_id,
    exhibitor_id,
    dog_id,
    position,
    status
  )
  SELECT
    'dec1a55e-0000-0000-0000-000000000032',  -- Interior Advanced (trial 021)
    v_exhibitor_id,
    'dededede-0000-0000-0000-000000000043',  -- Juniper
    1,
    'waiting'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.waitlist_entries
    WHERE  class_id = 'dec1a55e-0000-0000-0000-000000000032'
      AND  dog_id   = 'dededede-0000-0000-0000-000000000043'
      AND  status   = 'waiting'
  );

  RAISE NOTICE 'Section 15: Juniper waitlist entry for Interior Advanced processed.';
END;
$$;

-- ---------------------------------------------------------------------------
-- 16. GAP FIXTURE #7 (checked-in entry, screenshot E-15)
--     Mark Willow's Interior Advanced entry (052) as checked in so the
--     exhibitor's My Entries card shows the "Checked In" status pill.
-- ---------------------------------------------------------------------------
UPDATE public.entries
SET check_in_status = 'checked-in'
WHERE id = 'dededede-0000-0000-0000-000000000052';

COMMIT;

-- ============================================================================
-- End of Lane 1.1 demo reseed.
-- ============================================================================
