-- ============================================================================
-- Lane 1.1 Demo Reseed  (myK9Show / Supabase project sojmvhhwsjxmfistvzbe)
-- ----------------------------------------------------------------------------
-- WHAT THIS IS
--   TypeScript fixture counts live in apps/myk9show/src/test/load/loadFixture.ts;
--   keep this SQL contract aligned because SQL cannot import those constants.
--   A realistic, *publicly visible* demo dataset (1 club, 1 published
--   multi-registry show, 4 trials, 9 classes, 69 dogs, 514 entries). Ten
--   hand-authored entries preserve the golden paths; 504 deterministic entries
--   support the MYK9-109 rehearsal. The demo exhibitor therefore owns an
--   intentionally heavy persona; targeted exhibitor tests must tolerate 504
--   additional entries. It also includes complete show officials and
--   full RBAC role coverage so every role's golden path is walkable after a reseed:
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
--     - exhibitor@myk9t.com  (primary demo exhibitor)
--     - secretary@myk9t.com  (Test Secretary)
--     - testadmin@myk9t.com      (site admin / club administrator)
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
    'exhibitor@myk9t.com', 'secretary@myk9t.com',
    -- Section 10 grants RBAC roles to these accounts by email; a missing/dup row
    -- would silently grant nothing (re-introducing the F1 secretary-403 bug),
    -- so require each to resolve to exactly one person here.
    'testadmin@myk9t.com',
    -- Judge / steward grant accounts (added so the judge + steward golden paths
    -- survive a reseed; previously only secretary/club_admin were guaranteed).
    'judge@myk9t.com'
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
  -- (chairman@myk9t.com holds the chairman grant, and is optional so it is not
  -- listed here; the judge account is added for
  -- section 10b and the secretary account also receives steward access.)
  FOREACH v_email IN ARRAY ARRAY[
    'secretary@myk9t.com', 'testadmin@myk9t.com',
    'judge@myk9t.com'
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
--   load dog     a1090000-0000-0000-0001-{000000000001..000000000063}
--   load entry   a1090000-0000-0000-0002-{000000000001..000000000504}
--   load armband a1090000-0000-0000-0003-{000000000001..000000000063}
--   judge_assign dededede-0000-0000-0000-0000000000b{1..5} (e2e-judge), class-level
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
-- Additional load shows keep their armbands in the same myk9_109 range, so one
-- range delete covers every show. This must precede the dog delete below:
-- armbands.dog_id would otherwise block it.
DELETE FROM public.armbands
WHERE id >= 'a1090000-0000-0000-0003-000000000000'::uuid
  AND id <  'a1090000-0000-0000-0004-000000000000'::uuid; -- myk9_109 multi-show
-- MYK9-109 LOAD FIXTURE CLEANUP
-- Deterministic myk9_109 rows use separate UUID ranges so a reseed can remove
-- them without broad predicates or touching the hand-authored demo fixtures.
DELETE FROM public.entries
WHERE id >= 'a1090000-0000-0000-0002-000000000000'::uuid
  AND id < 'a1090000-0000-0000-0003-000000000000'::uuid; -- myk9_109
DELETE FROM public.dogs
WHERE id >= 'a1090000-0000-0000-0001-000000000000'::uuid
  AND id < 'a1090000-0000-0000-0002-000000000000'::uuid; -- myk9_109
-- Scaffolding for the additional load shows (multi-show fixture). Their entries,
-- dogs and armbands are already gone via the ranges above; this clears the shows
-- themselves, FK-safe: cart items -> classes -> trials -> settings -> shows.
DELETE FROM public.entry_cart_items
WHERE class_id >= 'a1090000-0000-0000-0012-000000000000'::uuid
  AND class_id <  'a1090000-0000-0000-0013-000000000000'::uuid;
DELETE FROM public.classes
WHERE id >= 'a1090000-0000-0000-0012-000000000000'::uuid
  AND id <  'a1090000-0000-0000-0013-000000000000'::uuid;
DELETE FROM public.trials
WHERE id >= 'a1090000-0000-0000-0011-000000000000'::uuid
  AND id <  'a1090000-0000-0000-0012-000000000000'::uuid;
DELETE FROM public.show_visibility_settings
WHERE show_id >= 'a1090000-0000-0000-0010-000000000000'::uuid
  AND show_id <  'a1090000-0000-0000-0011-000000000000'::uuid;
DELETE FROM public.shows
WHERE id >= 'a1090000-0000-0000-0010-000000000000'::uuid
  AND id <  'a1090000-0000-0000-0011-000000000000'::uuid;
-- After the shows: clubs are the shows' parent, so the FK blocks the reverse order.
DELETE FROM public.clubs
WHERE id >= 'a1090000-0000-0000-0013-000000000000'::uuid
  AND id <  'a1090000-0000-0000-0014-000000000000'::uuid;
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
-- Email delivery history fixtures (section 18). email_log.show_id is
-- ON DELETE SET NULL, so those rows would SURVIVE the show delete below with a
-- nulled scope and accumulate one orphan set per reseed — they have to be
-- removed explicitly, by id range. The lifecycle jobs and attempts would
-- cascade with the show, but are removed the same way so this block stays
-- correct if that ordering ever changes.
DELETE FROM public.show_lifecycle_email_attempts
WHERE id >= 'ee110000-0000-0000-0003-000000000000'::uuid
  AND id <  'ee110000-0000-0000-0004-000000000000'::uuid;
DELETE FROM public.show_lifecycle_email_jobs
WHERE id >= 'ee110000-0000-0000-0002-000000000000'::uuid
  AND id <  'ee110000-0000-0000-0003-000000000000'::uuid;
DELETE FROM public.email_log
WHERE id >= 'ee110000-0000-0000-0001-000000000000'::uuid
  AND id <  'ee110000-0000-0000-0002-000000000000'::uuid;
DELETE FROM public.show_visibility_settings WHERE show_id = 'dededede-0000-0000-0000-000000000010';
-- Emergency packet snapshots intentionally RESTRICT show deletion. Their
-- private Storage objects must be removed through the Storage API before their
-- audit rows; SQL-only deletion would orphan immutable PDFs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.trial_packet_snapshots
    WHERE show_id = 'dededede-0000-0000-0000-000000000010'
  ) THEN
    RAISE EXCEPTION 'seed-demo preflight: remove canonical trial packet objects through the Storage API before reseeding';
  END IF;
END $$;
DELETE FROM public.shows WHERE id = 'dededede-0000-0000-0000-000000000010';
-- club_members / club_officers / club_stripe_accounts all cascade on club delete.
DELETE FROM public.clubs WHERE id IN (
  'dededede-0000-0000-0000-000000000001',
  'dededede-0000-0000-0000-000000000002'
);

-- ---------------------------------------------------------------------------
-- 1. Clubs (2)
--
--    TWO clubs, not one (MYK9-137). Club-scoped authority is a disjunction —
--    `is_site_admin() OR is_club_admin(p_club_id)` — so "a club admin may act on
--    its own club" is only half the contract. The other half, "and NOT on someone
--    else's", is INEXPRESSIBLE with a single seeded club: there is no second
--    subject to be rejected from. Prairie Trail exists to be that subject. It
--    deliberately has no show, no trials and no entries — it is a scope boundary,
--    not a second demo dataset, and adding fixtures to it would slow every walk
--    without testing anything new.
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name, city, state, email, description, club_number, version)
VALUES (
  'dededede-0000-0000-0000-000000000001',
  'Heartland Scent Work Club',
  'Tulsa', 'Oklahoma',
  'testadmin@myk9t.com',
  'Demo scent work club for the myK9Show showcase dataset.',
  'HSWC-001', 1
),
(
  'dededede-0000-0000-0000-000000000002',
  'Prairie Trail Dog Sports Club',
  'Wichita', 'Kansas',
  'testadmin@myk9t.com',
  'Second demo club. Exists so club-scoped authority has a club to be REFUSED on — see MYK9-137.',
  'PTDSC-002', 1
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
-- 1b. Club members (MYK9-137)
--
--     `club_members` was never seeded by ANY seed file, so /club-admin/members
--     rendered an empty table on a freshly-reseeded database and the Show Access
--     and membership flows had no subject to act on — the MYK9-120 replay had to
--     insert rows by hand before it could test anything.
--
--     Membership is resolved by email rather than by fixed id: these are the
--     protected accounts the Lane 1.1 wipe restores, and their people.id values
--     are not stable across environments. A missing account yields zero rows
--     rather than an error — the section-10 preflight above is what makes the
--     accounts the RBAC grants depend on non-optional.
--
--     joined_date is a literal, not CURRENT_DATE, so a re-run is byte-identical
--     (same reason section 10 pins granted_at).
-- ---------------------------------------------------------------------------
INSERT INTO public.club_members (club_id, person_id, membership_type, membership_status, joined_date)
SELECT club.club_id, p.id, club.membership_type, 'active', DATE '2026-06-17'
FROM (
  VALUES
    ('dededede-0000-0000-0000-000000000001'::uuid, 'testadmin@myk9t.com',     'full'),
    ('dededede-0000-0000-0000-000000000001'::uuid, 'secretary@myk9t.com', 'full'),
    ('dededede-0000-0000-0000-000000000001'::uuid, 'judge@myk9t.com',     'associate'),
    ('dededede-0000-0000-0000-000000000001'::uuid, 'exhibitor@myk9t.com', 'full'),
    -- Club-admin-only account (section 10e). Optional, like its role grant: the
    -- JOIN drops it where the account has not been provisioned.
    ('dededede-0000-0000-0000-000000000001'::uuid, 'clubadmin@myk9t.com', 'full'),
    -- Prairie Trail's own roster. e2e-exhibitor belongs to BOTH clubs, so a
    -- membership query that forgets to filter by club_id returns a row it should
    -- not — the single-club seed could not expose that class of bug at all.
    ('dededede-0000-0000-0000-000000000002'::uuid, 'exhibitor@myk9t.com', 'associate')
) AS club(club_id, email, membership_type)
JOIN public.people p ON lower(p.email) = club.email
ON CONFLICT (club_id, person_id) DO NOTHING;

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
  location, city, state, latitude, longitude, status, club_id,
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
  36.15, -95.99,
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
--    judge@myk9t.com), NOT the source of truth: the relational link is
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
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 1),
  ('dededede-0000-0000-0000-000000000042', 'Ranger', 'Ranger', 'German Shepherd Dog', 'male', '2020-07-02', 'Black & Tan', 'active',
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 1),
  ('dededede-0000-0000-0000-000000000043', 'Juniper', 'Juni', 'Border Collie', 'female', '2022-05-20', 'Black & White', 'active',
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 1),
  ('dededede-0000-0000-0000-000000000044', 'Scout', 'Scout', 'Australian Shepherd', 'male', '2019-11-08', 'Blue Merle', 'active',
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 1),
  ('dededede-0000-0000-0000-000000000045', 'Maple', 'Maple', 'Golden Retriever', 'female', '2021-09-30', 'Golden', 'active',
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 1),
  ('dededede-0000-0000-0000-000000000046', 'Cooper', 'Cooper', 'Beagle', 'male', '2023-01-12', 'Tricolor', 'active',
   (SELECT id FROM public.people WHERE lower(email)='secretary@myk9t.com'), 1);

-- Every seeded dog needs a registration number: `trg_entries_require_dog_registration`
-- (20260828210000) rejects an entry whose dog has none for the TRIAL'S registry, so a
-- seed without these would fail on the first entry insert.
--
-- One row per registry the seed actually uses, NOT just AKC: this show hosts AKC,
-- UKC and ASCA trials side by side, and the load block gives every dog 8 entries
-- spanning all four trials (classes ...036/...037 are UKC, ...038/...039 are ASCA).
-- An AKC-only backfill therefore fails half of them with 23514 and no reseed can
-- complete. Idempotent and keyed off the dog id so reseeds are stable; the
-- NOT EXISTS matches on the NORMALISED organisation so a differently-spelled
-- existing row does not trip UNIQUE (dog_id, organization).
INSERT INTO public.dog_registrations (
  dog_id, organization, registration_number, registered_name, breed, status, is_primary
)
SELECT
  d.id,
  reg.organization,
  reg.prefix || upper(substr(md5(d.id::text || reg.registry), 1, 8)),
  d.name,
  d.breed,
  'Active',
  reg.registry = 'AKC'
FROM public.dogs d
CROSS JOIN (VALUES
  ('AKC',  'AKC (American Kennel Club)',                 'SR'),
  ('UKC',  'UKC (United Kennel Club)',                   'P'),
  ('ASCA', 'ASCA (Australian Shepherd Club of America)', 'E')
) AS reg(registry, organization, prefix)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.dog_registrations r
  WHERE r.dog_id = d.id
    AND upper(btrim(regexp_replace(r.organization, '\(.*$', ''))) = reg.registry
);

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
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 'Test Exhibitor',
   'confirmed', 'paid', 30.00, 100, 1, false, 1),
  ('dededede-0000-0000-0000-000000000052',
   'dededede-0000-0000-0000-000000000041', 'dec1a55e-0000-0000-0000-000000000032',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 'Test Exhibitor',
   'confirmed', 'paid', 30.00, 100, 1, false, 1),
  -- Ranger (e2e-exhibitor): Interior Advanced
  ('dededede-0000-0000-0000-000000000053',
   'dededede-0000-0000-0000-000000000042', 'dec1a55e-0000-0000-0000-000000000032',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 'Test Exhibitor',
   'submitted', 'pending', 30.00, 101, 2, false, 1),
  -- Juniper (e2e-exhibitor): Exterior Excellent
  ('dededede-0000-0000-0000-000000000054',
   'dededede-0000-0000-0000-000000000043', 'dec1a55e-0000-0000-0000-000000000033',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 'Test Exhibitor',
   'submitted', 'pending', 30.00, 102, 1, false, 1),
  -- Scout (beezley): Container Novice A + Buried Master (Sunday)
  ('dededede-0000-0000-0000-000000000055',
   'dededede-0000-0000-0000-000000000044', 'dec1a55e-0000-0000-0000-000000000031',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 'Test Exhibitor',
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
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 'Test Exhibitor',
   'move-up-requested', 'paid', 30.00, 103, 1, true, 1),
  -- Maple (beezley): Interior Novice B (Sunday)
  ('dededede-0000-0000-0000-000000000057',
   'dededede-0000-0000-0000-000000000045', 'dec1a55e-0000-0000-0000-000000000035',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000022',
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 'Test Exhibitor',
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
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 'Test Exhibitor',
   'withdrawn', 'refunded', 30.00, NULL, NULL, false,
   'Exhibitor withdrew before the show; full refund issued.',
   30.00, 'Demo refund for the withdrawn-entry walk fixture.',
   '2026-06-01 00:00:00+00', 1),
  ('dededede-0000-0000-0000-000000000060',
   'dededede-0000-0000-0000-000000000042', 'dec1a55e-0000-0000-0000-000000000033',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'), 'Test Exhibitor',
   'withdrawn', 'refunded', 30.00, NULL, NULL, false,
   'Exhibitor withdrew before the show; full refund issued.',
   30.00, 'Demo refund for the withdrawn-entry walk fixture (exhibitor-owned).',
   '2026-06-01 00:00:00+00', 1);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 10. Demo RBAC role grants  (F1 fix — audit 04-secretary-rewalk-2026-06-17)
--     The Lane 1.1 wipe restores the protected ACCOUNTS but NOT their role
--     grants, so after a reseed secretary@myk9t.com and
--     testadmin@myk9t.com hold only `exhibitor`.
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
--     INSERT 0) and the manual one-off unblock row for secretary@myk9t.com is
--     respected. granted_at is a literal (no now()) so inserts stay
--     byte-identical; reactivation only fires when state diverges.
-- ---------------------------------------------------------------------------
UPDATE public.user_roles ur
SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL
FROM public.people p, public.roles r
WHERE ur.user_id = p.id AND ur.role_id = r.id
  AND r.name = 'secretary'
  AND lower(p.email) = 'secretary@myk9t.com'
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
  AND lower(p.email) = 'secretary@myk9t.com'
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
  AND lower(p.email) = 'testadmin@myk9t.com'
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
  AND lower(p.email) = 'testadmin@myk9t.com'
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
--         NOT satisfy the route guard, which matches the role NAME. The judge
--         account therefore needs an explicit `judge` user_roles grant here.
--       * Steward ringside routes admit UserRole.STEWARD; secretary@myk9t.com
--         needs it.
--       * Chairman now HAS a dedicated account (chairman@myk9t.com, 2026-08-23).
--         It previously rode on testadmin, which also holds site_admin — see 10d.
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
-- 10b. judge -> judge@myk9t.com
UPDATE public.user_roles ur
SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL
FROM public.people p, public.roles r
WHERE ur.user_id = p.id AND ur.role_id = r.id
  AND r.name = 'judge'
  AND lower(p.email) = 'judge@myk9t.com'
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
  AND lower(p.email) = 'judge@myk9t.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id
      AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
      AND ur.show_id IS NULL);

-- 10c. steward -> secretary@myk9t.com
UPDATE public.user_roles ur
SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL
FROM public.people p, public.roles r
WHERE ur.user_id = p.id AND ur.role_id = r.id
  AND r.name = 'steward'
  AND lower(p.email) = 'secretary@myk9t.com'
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
  AND lower(p.email) = 'secretary@myk9t.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id
      AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
      AND ur.show_id IS NULL);

-- 10d. chairman -> chairman@myk9t.com
--
--     Split off testadmin 2026-08-23. testadmin is a site_admin, and a fixture
--     that holds site_admin satisfies a role gate through the wrong branch —
--     the same vacuity 10e documents for club scoping. It keeps site_admin,
--     club_admin and exhibitor; only chairman moved.
--
--     Optional in the sense of 10e: the account needs an Auth user, so where
--     E2E_CHAIRMAN_PASSWORD is unset the people row does not exist, both
--     statements match nothing, and the seed completes normally. Hence the
--     auth_user_id guard on BOTH halves — a stale people row with a NULL
--     auth_user_id would otherwise get an active grant nobody can sign in to.
UPDATE public.user_roles ur
SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL
FROM public.people p, public.roles r
WHERE ur.user_id = p.id AND ur.role_id = r.id
  AND r.name = 'chairman'
  AND lower(p.email) = 'chairman@myk9t.com'
  AND p.auth_user_id IS NOT NULL
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
  AND lower(p.email) = 'chairman@myk9t.com'
  AND p.auth_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id
      AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
      AND ur.show_id IS NULL);

-- 10e. club_admin -> clubadmin@myk9t.com (MYK9-137)
--
--     THE POINT OF THIS ACCOUNT IS WHAT IT DOES *NOT* HOLD. e2e-admin holds
--     site_admin as well as club_admin, and every club-scoped gate in this schema
--     is a disjunction:
--
--       IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN ...
--
--     so e2e-admin passes through the is_site_admin() branch and NEVER exercises
--     the club term. A cross-club rejection test written with that account is
--     vacuous: it reports a pass whether or not club scoping exists. This account
--     holds club_admin on Heartland and nothing else, so it can be refused — and
--     `supabase/tests/club_secretary_grant_test.sql` proves the same property at
--     the SQL layer with a purpose-built actor.
--
--     DELIBERATELY OPTIONAL, and deliberately absent from the preflight above.
--     Creating it requires an Auth user, which needs E2E_CLUB_ADMIN_PASSWORD in
--     the environment (see apps/myk9show/scripts/setup-e2e-test-users.ts). Where
--     that secret is not configured the account does not exist, the JOIN below
--     matches nothing, and the seed completes normally. Adding it to the preflight
--     would instead make every such database fail to seed at all.
UPDATE public.user_roles ur
SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL
FROM public.people p, public.roles r
WHERE ur.user_id = p.id AND ur.role_id = r.id
  AND r.name = 'club_admin'
  AND lower(p.email) = 'clubadmin@myk9t.com'
  -- Optional account: a stale people row whose Auth user was wiped carries a
  -- NULL auth_user_id, and reactivating on it writes an ACTIVE grant nobody
  -- can ever authenticate into. The INSERT half has always been guarded; the
  -- reactivate half was not (Codex review, #1626).
  AND p.auth_user_id IS NOT NULL
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
  AND lower(p.email) = 'clubadmin@myk9t.com'
  AND p.auth_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id
      AND ur.club_id = 'dededede-0000-0000-0000-000000000001'
      AND ur.show_id IS NULL);

-- ---------------------------------------------------------------------------
-- (There is no 10f. It granted judge to the zero-assignment fixture
--  e2e-judge-empty, removed 2026-08-23: no spec ever signed in as that account
--  and no Auth user for it was ever provisioned. The lettering is left alone
--  because this header is matched verbatim by seedDemoOfficialsContract.)
--
-- 10g. JUDGE FIXTURE EXCLUSIVITY (MYK9-141).
--
--     THE POINT OF THE JUDGE ACCOUNT, LIKE 10e, IS WHAT IT DOES *NOT* HOLD.
--     Everything above this line only ever ADDS a grant. That is correct for a
--     seed — it must be revoke-safe and idempotent — but it means no step
--     anywhere can make an account hold ONLY the role its fixture claims, and
--     user_roles rows accumulate: a hand-run script, an admin-UI click, or an
--     older seed leaves a grant behind and nothing ever takes it away.
--
--     That is not hypothetical. On 2026-08-01 the weekly judge UX walk found the
--     documented judge account rendering as `Secretary +2` (an active `secretary`
--     grant plus a stray unscoped `exhibitor` grant dating to 2026-05-11), and
--     the exhibitor grant was still active when MYK9-141 was worked on 08-05.
--     `unifiedSidebarConfig.ts` builds that badge from `new Set(userRoles)`, so
--     the label is a direct readout of the distinct role names granted here.
--
--     WHY THE TS RECONCILER DOES NOT COVER THIS. setup-e2e-test-users.ts DOES
--     deactivate grants outside its declared set (planRoleReconciliation ->
--     deactivateIds). But CI runs it with MYK9_E2E_AUTH_ONLY=true, which returns
--     right after the Auth user is provisioned and never reaches the role code
--     (see `if (authOnly)` in createTestUser). In CI, role state comes from this
--     file and only this file — so the exclusivity step has to live here too.
--
--     WHY IT MATTERS BEYOND COSMETICS. A judge carrying exhibitor or secretary
--     satisfies judge-only authorization checks through the WRONG branch, exactly
--     as a site_admin satisfies a club gate in 10e. "A judge is denied the
--     secretary-only result surface" reports a pass whether or not judge scoping
--     exists. The account has to be refusable for the assertion to mean anything.
--
--     SCOPED BY EMAIL TO THE JUDGE FIXTURE — never a blanket deactivate. Kept as
--     a one-element IN rather than an `=`: the list shape is the guarantee, and
--     seedDemoOfficialsContract asserts it so a future edit cannot quietly become
--     "every account" or "every judge".
--
--     NOTE FOR EDITORS: name the other fixtures WITHOUT their domain below. The
--     contract test asserts this whole block — comments included — contains no
--     multi-role fixture address, so writing one out in prose fails the build.
--     The secretary account is deliberately secretary+steward+exhibitor and the
--     admin account is deliberately multi-role; widening this WHERE clause would
--     silently destroy those fixtures. Deactivate (is_active = false) rather than DELETE, matching
--     the reactivate-then-insert pattern above: 10b flips its own row back on, so
--     ordering is not load-bearing and a re-run is UPDATE 0.
--
--     Duplicate `judge` rows are left alone. e2e-judge holds judge twice (one
--     unscoped from 2026-05-11, one club-scoped from 10b); both name the same
--     role, the badge de-dupes them, and the route guards match on name.
UPDATE public.user_roles ur
SET is_active = false
FROM public.people p, public.roles r
WHERE ur.user_id = p.id
  AND ur.role_id = r.id
  AND lower(p.email) IN ('judge@myk9t.com')
  AND r.name <> 'judge'
  AND ur.is_active;

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
--     Coverage is a STRICT SUBSET, and that is the point (MYK9-141). Nine classes
--     are seeded (031..039); e2e-judge is assigned to five of them:
--       ...0b{1..5}  judge@myk9t.com -> classes 031..035 (trials 021/022)
--     leaving 036..039 (trials 023/024) assigned to NOBODY. Assignment-isolation
--     QA needs both halves: without an assigned class "the judge can see it" is
--     untestable, and without an unassigned one "the judge cannot see it" passes
--     vacuously. Assigning all nine would silently delete the negative case, so
--     seedDemoOfficialsContract pins 036 as absent from this block.
--
--     trial_id matches each class's trial, and the judge is named "Test Judge" to
--     match the classes.judge_name snapshot written above.
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
  -- judge@myk9t.com -> all 5 classes (e2e suite dashboard coverage)
  ('dededede-0000-0000-0000-0000000000b1'::uuid, 'judge@myk9t.com', 'dededede-0000-0000-0000-000000000021'::uuid, 'dec1a55e-0000-0000-0000-000000000031'::uuid),
  ('dededede-0000-0000-0000-0000000000b2'::uuid, 'judge@myk9t.com', 'dededede-0000-0000-0000-000000000021'::uuid, 'dec1a55e-0000-0000-0000-000000000032'::uuid),
  ('dededede-0000-0000-0000-0000000000b3'::uuid, 'judge@myk9t.com', 'dededede-0000-0000-0000-000000000021'::uuid, 'dec1a55e-0000-0000-0000-000000000033'::uuid),
  ('dededede-0000-0000-0000-0000000000b4'::uuid, 'judge@myk9t.com', 'dededede-0000-0000-0000-000000000022'::uuid, 'dec1a55e-0000-0000-0000-000000000034'::uuid),
  ('dededede-0000-0000-0000-0000000000b5'::uuid, 'judge@myk9t.com', 'dededede-0000-0000-0000-000000000022'::uuid, 'dec1a55e-0000-0000-0000-000000000035'::uuid)
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
  ('dededede-0000-0000-0000-000000000092'::uuid, 'judge@myk9t.com', 'AKC-SW-1002')
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
  WHERE  lower(p.email) = 'exhibitor@myk9t.com'
  LIMIT  1;

  IF v_exhibitor_id IS NULL THEN
    RAISE NOTICE 'Section 15 skipped: exhibitor_profile for exhibitor@myk9t.com not found (sign-in once to create it)';
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

-- ---------------------------------------------------------------------------
-- 17. MYK9-109 LOAD FIXTURE START
-- MYK9-109 LOAD FIXTURE START
--     63 dogs x 8 classes = 504 deterministic, unscored entries. This fixture
--     excludes finalized class dec1a55e-0000-0000-0000-000000000031 so load
--     rehearsal writes cannot corrupt the released-results golden path.
-- ---------------------------------------------------------------------------
INSERT INTO public.dogs (
  id, name, call_name, breed, sex, date_of_birth, color, status, owner_id, version
)
SELECT
  format('a1090000-0000-0000-0001-%s', lpad(dog_number::text, 12, '0'))::uuid,
  format('MYK9-109 Load Dog %s', lpad(dog_number::text, 2, '0')),
  format('Load %s', lpad(dog_number::text, 2, '0')),
  'Mixed Breed',
  CASE WHEN dog_number % 2 = 0 THEN 'female' ELSE 'male' END,
  DATE '2021-01-01' + dog_number,
  'Load Fixture',
  'active',
  (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com'),
  1
FROM generate_series(1, 63) AS load_dogs(dog_number);

-- Every seeded dog needs a registration number: `trg_entries_require_dog_registration`
-- (20260828210000) rejects an entry whose dog has none for the TRIAL'S registry, so a
-- seed without these would fail on the first entry insert.
--
-- One row per registry the seed actually uses, NOT just AKC: this show hosts AKC,
-- UKC and ASCA trials side by side, and the load block gives every dog 8 entries
-- spanning all four trials (classes ...036/...037 are UKC, ...038/...039 are ASCA).
-- An AKC-only backfill therefore fails half of them with 23514 and no reseed can
-- complete. Idempotent and keyed off the dog id so reseeds are stable; the
-- NOT EXISTS matches on the NORMALISED organisation so a differently-spelled
-- existing row does not trip UNIQUE (dog_id, organization).
INSERT INTO public.dog_registrations (
  dog_id, organization, registration_number, registered_name, breed, status, is_primary
)
SELECT
  d.id,
  reg.organization,
  reg.prefix || upper(substr(md5(d.id::text || reg.registry), 1, 8)),
  d.name,
  d.breed,
  'Active',
  reg.registry = 'AKC'
FROM public.dogs d
CROSS JOIN (VALUES
  ('AKC',  'AKC (American Kennel Club)',                 'SR'),
  ('UKC',  'UKC (United Kennel Club)',                   'P'),
  ('ASCA', 'ASCA (Australian Shepherd Club of America)', 'E')
) AS reg(registry, organization, prefix)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.dog_registrations r
  WHERE r.dog_id = d.id
    AND upper(btrim(regexp_replace(r.organization, '\(.*$', ''))) = reg.registry
);

WITH load_entries AS (
  SELECT
    dog_number,
    class_number,
    ((dog_number - 1) * 8) + class_number AS entry_number,
    CASE class_number
      WHEN 1 THEN 'dec1a55e-0000-0000-0000-000000000032'::uuid
      WHEN 2 THEN 'dec1a55e-0000-0000-0000-000000000033'::uuid
      WHEN 3 THEN 'dec1a55e-0000-0000-0000-000000000034'::uuid
      WHEN 4 THEN 'dec1a55e-0000-0000-0000-000000000035'::uuid
      WHEN 5 THEN 'dec1a55e-0000-0000-0000-000000000036'::uuid
      WHEN 6 THEN 'dec1a55e-0000-0000-0000-000000000037'::uuid
      WHEN 7 THEN 'dec1a55e-0000-0000-0000-000000000038'::uuid
      WHEN 8 THEN 'dec1a55e-0000-0000-0000-000000000039'::uuid
    END AS class_id,
    CASE
      WHEN class_number <= 2 THEN 'dededede-0000-0000-0000-000000000021'::uuid
      WHEN class_number <= 4 THEN 'dededede-0000-0000-0000-000000000022'::uuid
      WHEN class_number <= 6 THEN 'dededede-0000-0000-0000-000000000023'::uuid
      ELSE 'dededede-0000-0000-0000-000000000024'::uuid
    END AS trial_id
  FROM generate_series(1, 63) AS load_dogs(dog_number)
  CROSS JOIN generate_series(1, 8) AS load_classes(class_number)
)
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, handler,
  entry_status, payment_status, entry_fee, armband, run_order,
  move_up_requested, version
)
SELECT
  format('a1090000-0000-0000-0002-%s', lpad(entry_number::text, 12, '0'))::uuid,
  format('a1090000-0000-0000-0001-%s', lpad(dog_number::text, 12, '0'))::uuid,
  class_id,
  'dededede-0000-0000-0000-000000000010',
  trial_id,
  (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com'),
  'Test Exhibitor',
  'confirmed',
  'paid',
  30.00,
  2000 + dog_number,
  dog_number,
  false,
  1
FROM load_entries;

INSERT INTO public.armbands (
  id, show_id, dog_id, armband_number, is_available, assigned_at, version
)
SELECT
  format('a1090000-0000-0000-0003-%s', lpad(dog_number::text, 12, '0'))::uuid,
  'dededede-0000-0000-0000-000000000010',
  format('a1090000-0000-0000-0001-%s', lpad(dog_number::text, 12, '0'))::uuid,
  (2000 + dog_number)::text,
  false,
  '2026-07-15 00:00:00+00',
  1
FROM generate_series(1, 63) AS load_armbands(dog_number);

-- ---------------------------------------------------------------------------
-- 17b. MULTI-SHOW LOAD FIXTURE (shows 1-3)
--
--     The platform runs 3-5 shows concurrently on a busy weekend. A single-show
--     fixture cannot surface cross-show behaviour at any session count, because
--     there is no second show generating deltas: `dogs` and `classes` both skip
--     their replication scope filter when no scope value is supplied, so a staff
--     device pulls deltas produced by every other running show.
--
--     Three mid-size shows: 2 trials x 2 classes = 4 rings each, 63 dogs,
--     63 x 4 = 252 entries. With the 8-ring show above that is 20 rings and
--     1,270 entries platform-wide.
--
--     Ids encode the show in the FIRST digit of the final UUID group, keeping
--     every load row inside the same myk9_109 ranges the cleanup above deletes.
--     Show 0 is unaffected: a leading 0 plus eleven digits is byte-identical to
--     the twelve-digit ordinal it always used. Mirrors
--     apps/myk9show/src/test/load/loadFixture.ts — the two must agree.
-- ---------------------------------------------------------------------------

-- Each additional load show belongs to its OWN club. This is not cosmetic:
-- `manageable_show_ids()` has a club-scoped arm (`is_trial_secretary(s.club_id)`),
-- so shows sharing a club are all manageable by that club's secretary no matter
-- what show-scoped grants exist. Per-show credential scoping is impossible on a
-- shared club — and concurrent shows are run by different clubs anyway.
INSERT INTO public.clubs (id, name, city, state, email, description, club_number, version)
SELECT
  format('a1090000-0000-0000-0013-%s%s', s, lpad('1', 11, '0'))::uuid,
  format('MYK9-109 Load Club %s', s),
  'Tulsa', 'Oklahoma',
  'testadmin@myk9t.com',
  format('Owns load show %s. Separate club so a per-show secretary can be scoped to one show.', s),
  format('LOAD-%s', lpad(s::text, 3, '0')),
  1
FROM generate_series(1, 3) AS load_clubs(s);

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
  brand_color, version, is_nationals
)
SELECT
  format('a1090000-0000-0000-0010-%s%s', s, lpad('1', 11, '0'))::uuid,
  format('MYK9-109 Load Show %s', s),
  'AKC',
  format('Concurrent load-rehearsal show %s. Exists so multi-show replication and cross-show delta volume are measurable.', s),
  '2026-08-01 00:00:00+00', '2026-08-03 00:00:00+00',
  '2026-06-01 00:00:00+00', '2026-09-01 00:00:00+00',
  format('%s00 Load Fixture Way, Tulsa, OK 74101', s),
  'Tulsa', 'Oklahoma',
  36.15, -95.99,
  'published',
  format('a1090000-0000-0000-0013-%s%s', s, lpad('1', 11, '0'))::uuid,
  30.00, 35.00,
  true, true,
  100, 125,
  'none', false, 48,
  true, true,
  true,
  'headline', false, '{}'::jsonb,
  '#0d4d4f', 1, false
FROM generate_series(1, 3) AS load_shows(s);

-- Explicit visibility rows so self-check-in is enabled by a stated setting, not
-- by the cascade's absent-row default. The exhibitor self-check-in workload
-- writes check_in_status, which is one of the class-row lock holders under test.
INSERT INTO public.show_visibility_settings (
  show_id, preset, placement_timing, qualification_timing,
  time_timing, faults_timing, self_checkin_enabled
)
SELECT
  format('a1090000-0000-0000-0010-%s%s', s, lpad('1', 11, '0'))::uuid,
  'open', 'class_complete', 'immediate', 'immediate', 'immediate', true
FROM generate_series(1, 3) AS load_shows(s);

INSERT INTO public.trials (
  id, show_id, name, date, trial_number, status,
  planned_start_time, allow_self_checkin, trial_type, pipeline_stage,
  display_order, category, registry_id, timezone, version
)
SELECT
  format('a1090000-0000-0000-0011-%s%s', s, lpad(t::text, 11, '0'))::uuid,
  format('a1090000-0000-0000-0010-%s%s', s, lpad('1', 11, '0'))::uuid,
  format('Load %s Trial %s', s, t),
  (DATE '2026-08-01' + (t - 1)),
  format('Load %s Trial %s', s, t),
  'upcoming',
  '8:00 AM', true, 'scent_work', 1, t,
  format('Load %s Trial %s', s, t),
  'AKC', 'America/Chicago', 1
FROM generate_series(1, 3) AS load_shows(s)
CROSS JOIN generate_series(1, 2) AS load_trials(t);

-- Two classes per trial, matching the show-0 layout. class c belongs to trial
-- ((c - 1) / 2) + 1, which loadFixture.ts pins in a test.
INSERT INTO public.classes (
  id, trial_id, name, level, element, section, judge_name,
  entry_fee, status, time_limit_seconds, num_hides, num_areas,
  has_blank, timer_mode, hides_known, display_order, version
)
SELECT
  format('a1090000-0000-0000-0012-%s%s', s, lpad(c::text, 11, '0'))::uuid,
  format('a1090000-0000-0000-0011-%s%s', s, lpad((((c - 1) / 2) + 1)::text, 11, '0'))::uuid,
  format('Load %s Class %s', s, c),
  'Advanced',
  CASE ((c - 1) % 4)
    WHEN 0 THEN 'Container'
    WHEN 1 THEN 'Interior'
    WHEN 2 THEN 'Exterior'
    ELSE 'Buried'
  END,
  NULL, 'Test Judge',
  30.00, 'upcoming', 180, 2, 2, false, 'single', true, c, 1
FROM generate_series(1, 3) AS load_shows(s)
CROSS JOIN generate_series(1, 4) AS load_classes(c);

INSERT INTO public.dogs (
  id, name, call_name, breed, sex, date_of_birth, color, status, owner_id, version
)
SELECT
  format('a1090000-0000-0000-0001-%s%s', s, lpad(dog_number::text, 11, '0'))::uuid,
  format('MYK9-109 Load %s Dog %s', s, lpad(dog_number::text, 2, '0')),
  format('Load %s-%s', s, lpad(dog_number::text, 2, '0')),
  'Mixed Breed',
  CASE WHEN dog_number % 2 = 0 THEN 'female' ELSE 'male' END,
  DATE '2021-01-01' + dog_number,
  'Load Fixture',
  'active',
  (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com'),
  1
FROM generate_series(1, 3) AS load_shows(s)
CROSS JOIN generate_series(1, 63) AS load_dogs(dog_number);

-- Every seeded dog needs a registration number: `trg_entries_require_dog_registration`
-- (20260828210000) rejects an entry whose dog has none for the TRIAL'S registry, so a
-- seed without these would fail on the first entry insert.
--
-- One row per registry the seed actually uses, NOT just AKC: this show hosts AKC,
-- UKC and ASCA trials side by side, and the load block gives every dog 8 entries
-- spanning all four trials (classes ...036/...037 are UKC, ...038/...039 are ASCA).
-- An AKC-only backfill therefore fails half of them with 23514 and no reseed can
-- complete. Idempotent and keyed off the dog id so reseeds are stable; the
-- NOT EXISTS matches on the NORMALISED organisation so a differently-spelled
-- existing row does not trip UNIQUE (dog_id, organization).
INSERT INTO public.dog_registrations (
  dog_id, organization, registration_number, registered_name, breed, status, is_primary
)
SELECT
  d.id,
  reg.organization,
  reg.prefix || upper(substr(md5(d.id::text || reg.registry), 1, 8)),
  d.name,
  d.breed,
  'Active',
  reg.registry = 'AKC'
FROM public.dogs d
CROSS JOIN (VALUES
  ('AKC',  'AKC (American Kennel Club)',                 'SR'),
  ('UKC',  'UKC (United Kennel Club)',                   'P'),
  ('ASCA', 'ASCA (Australian Shepherd Club of America)', 'E')
) AS reg(registry, organization, prefix)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.dog_registrations r
  WHERE r.dog_id = d.id
    AND upper(btrim(regexp_replace(r.organization, '\(.*$', ''))) = reg.registry
);

WITH multi_show_entries AS (
  SELECT
    s,
    dog_number,
    class_number,
    ((dog_number - 1) * 4) + class_number AS entry_number
  FROM generate_series(1, 3) AS load_shows(s)
  CROSS JOIN generate_series(1, 63) AS load_dogs(dog_number)
  CROSS JOIN generate_series(1, 4) AS load_classes(class_number)
)
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, handler,
  entry_status, payment_status, entry_fee, armband, run_order,
  move_up_requested, version
)
SELECT
  format('a1090000-0000-0000-0002-%s%s', s, lpad(entry_number::text, 11, '0'))::uuid,
  format('a1090000-0000-0000-0001-%s%s', s, lpad(dog_number::text, 11, '0'))::uuid,
  format('a1090000-0000-0000-0012-%s%s', s, lpad(class_number::text, 11, '0'))::uuid,
  format('a1090000-0000-0000-0010-%s%s', s, lpad('1', 11, '0'))::uuid,
  format('a1090000-0000-0000-0011-%s%s', s, lpad((((class_number - 1) / 2) + 1)::text, 11, '0'))::uuid,
  (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com'),
  'Test Exhibitor',
  'confirmed',
  'paid',
  30.00,
  2000 + (s * 1000) + dog_number,
  dog_number,
  false,
  1
FROM multi_show_entries;

-- Per-show secretaries: one club-level secretary grant on each load club, so a
-- staff session for show N can manage show N and nothing else. `manageable_show_ids()`
-- resolves through the club arm, which is why each show needed its own club above.
--
-- CONDITIONAL BY DESIGN. These accounts are created by
-- apps/myk9show/scripts/setup-e2e-test-users.ts through the Supabase admin API,
-- not by this seed. Requiring them in the preflight would break every reseed until
-- someone provisions them. Instead the grant is skipped when the account is absent,
-- and the rehearsal harness fails closed before load if per-show scoping cannot be
-- proven -- so a missing credential costs a refused dispatch, never a silent run
-- where every staff session sees all four shows.
UPDATE public.user_roles ur
SET is_active = true, auth_user_id = p.auth_user_id, expires_at = NULL
FROM public.people p, public.roles r, generate_series(1, 3) AS load_secretaries(s)
WHERE ur.user_id = p.id
  AND ur.role_id = r.id
  AND ur.club_id = format('a1090000-0000-0000-0013-%s%s', s, lpad('1', 11, '0'))::uuid
  AND ur.show_id IS NULL
  AND r.name = 'secretary'
  AND lower(p.email) = format('load-secretary-%s@myk9t.com', s)
  AND (ur.is_active IS DISTINCT FROM true
       OR ur.auth_user_id IS DISTINCT FROM p.auth_user_id
       OR ur.expires_at IS NOT NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id, granted_at)
SELECT
  p.id,
  r.id,
  format('a1090000-0000-0000-0013-%s%s', s, lpad('1', 11, '0'))::uuid,
  true,
  p.auth_user_id,
  '2026-06-17 00:00:00+00'
FROM generate_series(1, 3) AS load_secretaries(s)
JOIN public.people p ON lower(p.email) = format('load-secretary-%s@myk9t.com', s)
CROSS JOIN public.roles r
WHERE r.name = 'secretary'
  AND p.auth_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role_id = r.id
      AND ur.club_id = format('a1090000-0000-0000-0013-%s%s', s, lpad('1', 11, '0'))::uuid
      AND ur.show_id IS NULL);

-- Club MEMBERSHIP for each load secretary, in its own club.
--
-- The role grant above is inert without this. `is_trial_secretary(club_id)` is
-- the arm of `manageable_show_ids()` these accounts reach, and for a
-- club-scoped grant it additionally requires
-- `is_active_club_member(ur.user_id, ur.club_id)` -- so a secretary row with no
-- club_members row resolves to ZERO manageable shows, not to its own show.
--
-- That failure is silent in the worst place: the harness's scope assertion runs
-- in the SHARD job, after the canonical reseed, so it would report "manages
-- nothing" only once an approved rehearsal window was already spent. Verified
-- against staging on 2026-08-28, where all three load secretaries held the role
-- and no membership.
--
-- Same conditional shape as the grant: the JOIN drops any account that has not
-- been provisioned, so a reseed never breaks on a missing load secretary.
INSERT INTO public.club_members (club_id, person_id, membership_type, membership_status, joined_date)
SELECT
  format('a1090000-0000-0000-0013-%s%s', s, lpad('1', 11, '0'))::uuid,
  p.id,
  'full',
  'active',
  DATE '2026-06-17'
FROM generate_series(1, 3) AS load_secretaries(s)
JOIN public.people p ON lower(p.email) = format('load-secretary-%s@myk9t.com', s)
ON CONFLICT (club_id, person_id) DO NOTHING;


INSERT INTO public.armbands (
  id, show_id, dog_id, armband_number, is_available, assigned_at, version
)
SELECT
  format('a1090000-0000-0000-0003-%s%s', s, lpad(dog_number::text, 11, '0'))::uuid,
  format('a1090000-0000-0000-0010-%s%s', s, lpad('1', 11, '0'))::uuid,
  format('a1090000-0000-0000-0001-%s%s', s, lpad(dog_number::text, 11, '0'))::uuid,
  (2000 + (s * 1000) + dog_number)::text,
  false,
  '2026-07-15 00:00:00+00',
  1
FROM generate_series(1, 3) AS load_shows(s)
CROSS JOIN generate_series(1, 63) AS load_dogs(dog_number);

-- ---------------------------------------------------------------------------
-- 18. Email delivery history (secretary "Email history" view)
--
-- Backs get_show_email_delivery_history(), added by migration
-- 20260817160000_show_email_delivery_history.sql. Without these rows the view
-- renders empty on a fresh reseed: that RPC reads email_log.show_id, and the
-- migration's backfill deliberately refuses to guess a show for log rows whose
-- related_id no longer resolves — which is every historical row after a reseed.
--
-- The fixture covers BOTH branches the RPC unions:
--   * email_rows        — rows in public.email_log scoped by show_id
--   * lifecycle_failures — failed show_lifecycle_email_attempts with NO
--                          email_log row, which is the only way a send that
--                          never reached the provider appears in the history
-- and every delivery_status the RPC maps: delivered, sent, bounced, failed,
-- complained, suppressed (-> failed) and an unrecognised status (-> unavailable).
--
-- step_id is looked up by step_type rather than hard-coded: the lifecycle steps
-- are created with random UUIDs, so a pinned id would break on the next reseed.
-- ---------------------------------------------------------------------------
INSERT INTO public.show_lifecycle_email_jobs (
  id, show_id, step_id, step_type, status, recipient_scope,
  recipient_person_id, recipient_email, recipient_name,
  subject, rendered_subject, preview_warnings, idempotency_key,
  due_at, prepared_at, sent_at, created_at, updated_at
)
SELECT
  'ee110000-0000-0000-0002-000000000001'::uuid,
  'dededede-0000-0000-0000-000000000010',
  step.id,
  'accepted',
  'sent',
  'entry',
  (SELECT id FROM public.people WHERE email = 'exhibitor@myk9t.com'),
  'exhibitor@myk9t.com',
  'E2E Exhibitor',
  'Your entry has been accepted',
  'Your entry has been accepted',
  '[]'::jsonb,
  'seed-demo-lifecycle-accepted-1',
  '2026-07-20 14:00:00+00', '2026-07-20 14:00:00+00', '2026-07-20 14:02:11+00',
  '2026-07-20 14:00:00+00', '2026-07-20 14:02:11+00'
FROM public.show_lifecycle_email_steps AS step
WHERE step.show_id = 'dededede-0000-0000-0000-000000000010'
  AND step.step_type = 'accepted';

INSERT INTO public.show_lifecycle_email_jobs (
  id, show_id, step_id, step_type, status, recipient_scope,
  recipient_person_id, recipient_email, recipient_name,
  subject, rendered_subject, preview_warnings, idempotency_key,
  due_at, prepared_at, created_at, updated_at
)
SELECT
  'ee110000-0000-0000-0002-000000000002'::uuid,
  'dededede-0000-0000-0000-000000000010',
  step.id,
  'day_before_reminder',
  'failed',
  'show_recipient',
  (SELECT id FROM public.people WHERE email = 'secretary@myk9t.com'),
  'secretary@myk9t.com',
  'E2E Secretary',
  'Your trial is tomorrow',
  'Your trial is tomorrow',
  '[]'::jsonb,
  'seed-demo-lifecycle-daybefore-1',
  '2026-07-31 09:00:00+00', '2026-07-31 09:00:00+00',
  '2026-07-31 09:00:00+00', '2026-07-31 09:05:44+00'
FROM public.show_lifecycle_email_steps AS step
WHERE step.show_id = 'dededede-0000-0000-0000-000000000010'
  AND step.step_type = 'day_before_reminder';

-- The lifecycle_failures branch: a send that failed before any email_log row
-- existed, so email_log_id IS NULL. This is the only fixture that exercises
-- the second half of the RPC's UNION.
INSERT INTO public.show_lifecycle_email_attempts (
  id, job_id, email_log_id, status, error_message, attempted_at
)
VALUES (
  'ee110000-0000-0000-0003-000000000001',
  'ee110000-0000-0000-0002-000000000002',
  NULL,
  'failed',
  'Provider rejected the request before the message was queued.',
  '2026-07-31 09:05:44+00'
);

-- email_log rows. show_id is set directly: these are the shape the RPC reads
-- after the migration, not rows the backfill would have to resolve.
--   * show_lifecycle_email carries related_id -> the sent job above, which is
--     where recipient_name and lifecycle_step_type come from in the view.
--   * registration_confirmation rows use related_id IS NULL on purpose — that
--     is the branch of the RPC's per-type CASE that admits a row with no
--     surviving enrollment, and it keeps the fixture independent of
--     public.enrollments, which the reseed empties.
INSERT INTO public.email_log (
  id, recipient_email, email_type, related_id, resend_message_id,
  status, status_updated_at, show_id, created_at
)
VALUES
  ('ee110000-0000-0000-0001-000000000001', 'exhibitor@myk9t.com',
   'show_lifecycle_email', 'ee110000-0000-0000-0002-000000000001',
   'seed-demo-email-1', 'delivered', '2026-07-20 14:03:02+00',
   'dededede-0000-0000-0000-000000000010', '2026-07-20 14:02:11+00'),
  ('ee110000-0000-0000-0001-000000000002', 'exhibitor@myk9t.com',
   'registration_confirmation', NULL,
   'seed-demo-email-2', 'delivered', '2026-07-18 10:15:30+00',
   'dededede-0000-0000-0000-000000000010', '2026-07-18 10:15:02+00'),
  ('ee110000-0000-0000-0001-000000000003', 'bounced-handler@myk9t.invalid',
   'registration_confirmation', NULL,
   'seed-demo-email-3', 'bounced', '2026-07-18 11:02:19+00',
   'dededede-0000-0000-0000-000000000010', '2026-07-18 11:01:55+00'),
  ('ee110000-0000-0000-0001-000000000004', 'complained-handler@myk9t.invalid',
   'registration_confirmation', NULL,
   'seed-demo-email-4', 'complained', '2026-07-19 08:44:10+00',
   'dededede-0000-0000-0000-000000000010', '2026-07-19 08:40:00+00'),
  ('ee110000-0000-0000-0001-000000000005', 'suppressed-handler@myk9t.invalid',
   'registration_confirmation', NULL,
   'seed-demo-email-5', 'suppressed', '2026-07-19 09:12:00+00',
   'dededede-0000-0000-0000-000000000010', '2026-07-19 09:11:48+00'),
  -- Unrecognised provider status: the RPC maps anything it does not know to
  -- 'unavailable' rather than inventing a verdict. Keeps that path visible.
  ('ee110000-0000-0000-0001-000000000006', 'clubadmin@myk9t.com',
   'registration_confirmation', NULL,
   'seed-demo-email-6', 'queued', NULL,
   'dededede-0000-0000-0000-000000000010', '2026-07-19 15:30:00+00'),
  ('ee110000-0000-0000-0001-000000000007', 'secretary@myk9t.com',
   'registry_results_submission', NULL,
   'seed-demo-email-7', 'sent', '2026-08-04 17:00:00+00',
   'dededede-0000-0000-0000-000000000010', '2026-08-04 16:59:31+00');

DO $$
DECLARE
  v_entry_count integer;
BEGIN
  SELECT count(*) INTO v_entry_count
  FROM public.entries
  WHERE show_id = 'dededede-0000-0000-0000-000000000010';

  IF v_entry_count <> 514 THEN
    RAISE EXCEPTION 'MYK9-109 expected 514 demo-show entries, found %', v_entry_count;
  END IF;
END $$;

-- Multi-show fixture postcondition. Without this a partial seed — three shows
-- created but one show's entries missing — would reseed "successfully" and the
-- rehearsal would measure a workload that is not the one declared.
DO $$
DECLARE
  v_show_count integer;
  v_entry_count integer;
  v_total integer;
BEGIN
  SELECT count(*) INTO v_show_count
  FROM public.shows
  WHERE id >= 'a1090000-0000-0000-0010-000000000000'::uuid
    AND id <  'a1090000-0000-0000-0011-000000000000'::uuid;

  IF v_show_count <> 3 THEN
    RAISE EXCEPTION 'MYK9-109 expected 3 additional load shows, found %', v_show_count;
  END IF;

  FOR v_entry_count IN
    SELECT count(*)
    FROM public.entries e
    JOIN public.shows s ON s.id = e.show_id
    WHERE s.id >= 'a1090000-0000-0000-0010-000000000000'::uuid
      AND s.id <  'a1090000-0000-0000-0011-000000000000'::uuid
    GROUP BY s.id
  LOOP
    IF v_entry_count <> 252 THEN
      RAISE EXCEPTION 'MYK9-109 expected 252 entries per additional load show, found %', v_entry_count;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_total
  FROM public.entries
  WHERE id >= 'a1090000-0000-0000-0002-000000000000'::uuid
    AND id <  'a1090000-0000-0000-0003-000000000000'::uuid;

  -- 504 on the eight-ring show plus 252 on each of three four-ring shows.
  IF v_total <> 1260 THEN
    RAISE EXCEPTION 'MYK9-109 expected 1260 generated load entries platform-wide, found %', v_total;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- End of Lane 1.1 demo reseed.
-- ============================================================================
