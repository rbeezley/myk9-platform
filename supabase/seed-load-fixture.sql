-- ============================================================================
-- MYK9-109 load fixture  (myK9Show / Supabase project sojmvhhwsjxmfistvzbe)
-- ----------------------------------------------------------------------------
-- WHAT THIS IS
--   The opt-in load / PDF-calibration fixture that used to be section 17 of
--   supabase/seed-demo.sql (MYK9-558 Part B). It adds, on top of the lean demo
--   set:
--     - 63 `Load NN` dogs x 8 classes = 504 entries on the demo show ...010
--       (the 63-entry full-class / PDF-calibration shape), plus their armbands;
--     - three load clubs, three load shows (2 trials x 2 classes each), 189
--       dogs and 252 entries per show, the per-show load-secretary grants and
--       memberships, and the sandbox Stripe account on load club 1;
--     - the MYK9-515 full-class cap on class ...036 (section 17c), which is only
--       full while these 63 entries exist.
--   Counts are mirrored in apps/myk9show/src/test/load/loadFixture.ts; keep the
--   two aligned (SQL cannot import those constants).
--
-- WHEN TO APPLY
--   Only for a load rehearsal (.github/workflows/load-rehearsal.yml applies it
--   after the canonical reseed) or a PDF-calibration / 63-entry check. Never as
--   part of a routine reseed: the staff dog picker searches every dog on the
--   system, so a secretary would see all 252 load dogs.
--
-- ORDER
--   Run AFTER supabase/seed-demo.sql, in a separate psql invocation:
--     source "supabase/.env"
--     PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "<same URL as seed-demo.sql>" \
--       -v ON_ERROR_STOP=1 -f supabase/seed-demo.sql
--     PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "<same URL as seed-demo.sql>" \
--       -v ON_ERROR_STOP=1 -f supabase/seed-load-fixture.sql
--   It depends on rows seed-demo.sql creates (show ...010, trials ...021-...024,
--   classes ...032-...039, exhibitor@myk9t.com) and on nothing else from that
--   file: no CTE, temp table or psql variable crosses the file boundary.
--
-- REMOVAL
--   A plain rerun of supabase/seed-demo.sql removes every row this file
--   creates: its section 0 deletes the whole myk9_109 id ranges (dogs, entries,
--   armbands, shows, trials, classes, clubs, and everything that cascades from
--   them) and recreates class ...036 without a cap. This file is NOT idempotent
--   on its own; the preflight below refuses a second application until
--   seed-demo.sql has been rerun.
-- ============================================================================

BEGIN;

-- Preflight: the lean demo set must be present, and this fixture must not be.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.shows WHERE id = 'dededede-0000-0000-0000-000000000010'
  ) THEN
    RAISE EXCEPTION 'seed-load-fixture preflight: demo show ...010 is missing; run supabase/seed-demo.sql first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.dogs
    WHERE id >= 'a1090000-0000-0000-0001-000000000000'::uuid
      AND id <  'a1090000-0000-0000-0002-000000000000'::uuid
  ) OR EXISTS (
    SELECT 1 FROM public.shows
    WHERE id >= 'a1090000-0000-0000-0010-000000000000'::uuid
      AND id <  'a1090000-0000-0000-0011-000000000000'::uuid
  ) THEN
    RAISE EXCEPTION 'seed-load-fixture preflight: the load fixture is already applied; rerun supabase/seed-demo.sql to remove it before applying it again';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 17. MYK9-109 LOAD FIXTURE START
-- MYK9-109 LOAD FIXTURE START
--     63 dogs x 8 classes = 504 deterministic, unscored entries. This fixture
--     excludes finalized class dec1a55e-0000-0000-0000-000000000031 so load
--     rehearsal writes cannot corrupt the released-results golden path.
-- ---------------------------------------------------------------------------
-- Call names come from a plausible-name pool, disjoint from section 17b's
-- pools below (MYK9-566); the padded suffix on `name` (the registered name)
-- keeps every row distinct.
INSERT INTO public.dogs (
  id, name, call_name, breed, sex, date_of_birth, color, status, owner_id, version
)
SELECT
  format('a1090000-0000-0000-0001-%s', lpad(dog_number::text, 12, '0'))::uuid,
  format('%s %s', dog_name, lpad(dog_number::text, 2, '0')),
  dog_name,
  'Mixed Breed',
  CASE WHEN dog_number % 2 = 0 THEN 'female' ELSE 'male' END,
  DATE '2021-01-01' + dog_number,
  (ARRAY['Black', 'Brown', 'Black and White', 'Sable'])[((dog_number - 1) % 4) + 1],
  'active',
  (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com'),
  1
FROM generate_series(1, 63) AS load_dogs(dog_number)
CROSS JOIN LATERAL (
  SELECT (ARRAY[
    'Aspen', 'Birch', 'Blaze', 'Boone', 'Briar', 'Cedar', 'Clover', 'Comet',
    'Dash', 'Echo', 'Ember', 'Frost', 'Gus', 'Hazel', 'Indigo', 'Jasper',
    'Koda', 'Luna', 'Nova', 'Onyx', 'Piper'
  ])[((dog_number - 1) % 21) + 1] AS dog_name
) AS names;

-- Every seeded dog needs a registration number: `trg_entries_require_dog_registration`
-- (20260828210000) rejects an entry whose dog has none for the TRIAL'S registry, so a
-- seed without these would fail on the first entry insert.
--
-- One row per CONFIGURED registry, not just the one a given show needs. Since
-- MYK9-490 a show carries a single registry, so the AKC demo show's own entries
-- would be satisfied by an AKC row alone -- but the UKC and ASCA sibling shows
-- (section 3b) are enterable in a demo walk, and the guard is per TRIAL registry,
-- not per show. Seeding all three means a seeded dog can be entered anywhere in the
-- fixture set without a second backfill appearing here the first time someone tries.
-- Idempotent and keyed off the dog id so reseeds are stable; the
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
  ((CURRENT_DATE + 28)::timestamp AT TIME ZONE 'UTC'),
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
-- Real-looking club name/description below (MYK9-566, see header note above).
-- `description` renders on ClubsListView and the club's About tab, so it
-- carries plausible public copy, not the per-show-secretary rationale
-- explained in the comment above -- that stays engineering-only. Mapping
-- from the (now renamed) club to its original "Load Club N" identity, since
-- the club_number below no longer spells it out: club 1 = Green Country
-- Scent Work Club (GCSW), club 2 = Redbud Ridge Canine Sports Club (RRCS),
-- club 3 = Blue Sky K9 Trial Club (BSKT).
INSERT INTO public.clubs (id, name, city, state, email, description, club_number, version)
SELECT
  format('a1090000-0000-0000-0013-%s%s', s, lpad('1', 11, '0'))::uuid,
  club_name,
  'Tulsa', 'Oklahoma',
  'testadmin@myk9t.com',
  club_description,
  format('%s-%s', club_code, lpad(s::text, 3, '0')),
  1
FROM (VALUES
  (1, 'Green Country Scent Work Club', 'GCSW',
   'A Tulsa-based club hosting AKC Scent Work trials for local and regional competitors.'),
  (2, 'Redbud Ridge Canine Sports Club', 'RRCS',
   'Serving scent work handlers across northeast Oklahoma with well-run, competitor-friendly trials.'),
  (3, 'Blue Sky K9 Trial Club', 'BSKT',
   'A growing scent work club focused on approachable, well-organized trials for handlers of every level.')
) AS load_clubs(s, club_name, club_code, club_description);

-- Stripe Connect sandbox account for Load Club 1 (Green Country Scent Work Club) ONLY.
--
-- Why club 1 and not all three: the load shows' entry window is open
-- (CURRENT_DATE + 76), so this is the only show in the fixture set that an
-- exhibitor can both enter AND pay for -- Heartland's window closes at
-- CURRENT_DATE + 1. Without this row the recurring exhibitor task walk cannot
-- reach checkout at all, and role task 3 ("pay entry fees") goes unwalked; it
-- did on 2026-09-04. See MYK9-388.
--
-- Why NOT clubs 2 and 3: a club with no payment account is itself a fixture.
-- The registration wizard currently offers card payment regardless and only
-- refuses at the cart (MYK9-386), and that path needs a club that genuinely
-- cannot take money. Leaving two of the three without an account keeps both
-- states reachable. Do not "tidy" this into a generate_series(1, 3).
--
-- The placeholder account id is safe for the same reason it is safe for
-- Heartland above: stripe-checkout gates only on payouts_enabled + livemode
-- (index.ts:547-563) and the session carries no transfer_data, so no real
-- Connect account is contacted at checkout time.
--
-- No explicit cleanup needed: club_stripe_accounts.club_id is ON DELETE
-- CASCADE and the load-fixture block above deletes the whole
-- a1090000-...-0013-* club range on every reseed. That is why this differs
-- from the demo clubs, which are upserted rather than deleted and therefore
-- need their own DELETE in section 0.
INSERT INTO public.club_stripe_accounts (
  club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode
)
VALUES (
  'a1090000-0000-0000-0013-100000000001'::uuid,
  'acct_test_myk9109_load1_sandbox',
  true,
  true,
  false
)
ON CONFLICT (club_id, livemode) DO UPDATE
SET stripe_account_id   = EXCLUDED.stripe_account_id,
    onboarding_complete = EXCLUDED.onboarding_complete,
    payouts_enabled     = EXCLUDED.payouts_enabled,
    updated_at          = now();

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
-- `description` renders on the show card and the club's shows tab, so it
-- carries plausible public copy. This IS one of three concurrent demo shows
-- so multi-show replication and cross-show delta volume are measurable
-- (show s of 3, s = 1/2/3) -- that rationale stays here, in the comment, not
-- in the rendered text.
SELECT
  format('a1090000-0000-0000-0010-%s%s', s, lpad('1', 11, '0'))::uuid,
  show_name,
  'AKC',
  show_description,
  ((CURRENT_DATE + 45)::timestamp AT TIME ZONE 'UTC'), ((CURRENT_DATE + 47)::timestamp AT TIME ZONE 'UTC'),
  ((CURRENT_DATE - 16)::timestamp AT TIME ZONE 'UTC'), ((CURRENT_DATE + 76)::timestamp AT TIME ZONE 'UTC'),
  format('%s00 Fairgrounds Road, Tulsa, OK 74101', s),
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
FROM (VALUES
  -- Description text names the four seeded classes (all level Advanced) and
  -- avoids "weekend" (the entry window is CURRENT_DATE+45..+47, which lands
  -- mid-week on most reseed days) -- MYK9-566 round 2. Worded slightly
  -- differently per show so the three cards are not identical text.
  (1, 'Green Country Scent Work Trial',
   'An AKC Scent Work trial with Advanced Container, Interior, Exterior, and Buried classes.'),
  (2, 'Redbud Ridge Scent Work Classic',
   'An AKC Scent Work trial offering Advanced-level Container, Interior, Exterior, and Buried searches.'),
  (3, 'Blue Sky Scent Work Weekend',
   'An AKC Scent Work trial featuring Advanced classes in Container, Interior, Exterior, and Buried.')
) AS load_shows(s, show_name, show_description);

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

-- `name` is the ordinal "Trial 1"/"Trial 2" shown in the trial picker.
-- `trial_number`/`category` follow the section-3 precedent (day name + " Trial",
-- e.g. 'Saturday Trial') instead of repeating `name` -- several surfaces render
-- `Trial ${trialNumber}`, and a `trial_number` of 'Trial 1' would print as
-- "Trial Trial 1" (MYK9-566). Computed from the trial's own date so it is
-- correct regardless of which weekday the reseed lands on. Section 3's
-- Heartland trials hardcode 'Saturday Trial'/'Sunday Trial' for the SAME
-- CURRENT_DATE+45/+46 dates, so on a reseed day where +45 is not actually a
-- Saturday, the two shows disagree on one date's label -- that is a
-- pre-existing hardcoded value in section 3, out of this PR's scope.
INSERT INTO public.trials (
  id, show_id, name, date, trial_number, status,
  planned_start_time, allow_self_checkin, trial_type, pipeline_stage,
  display_order, category, registry_id, timezone, version
)
SELECT
  format('a1090000-0000-0000-0011-%s%s', s, lpad(t::text, 11, '0'))::uuid,
  format('a1090000-0000-0000-0010-%s%s', s, lpad('1', 11, '0'))::uuid,
  format('Trial %s', t),
  ((CURRENT_DATE + 45) + (t - 1)),
  trim(to_char(((CURRENT_DATE + 45) + (t - 1)), 'Day')) || ' Trial',
  'upcoming',
  '8:00 AM', true, 'scent_work', 1, t,
  trim(to_char(((CURRENT_DATE + 45) + (t - 1)), 'Day')) || ' Trial',
  'AKC', 'America/Chicago', 1
FROM generate_series(1, 3) AS load_shows(s)
CROSS JOIN generate_series(1, 2) AS load_trials(t);

-- Two classes per trial, matching the show-0 layout. class c belongs to trial
-- ((c - 1) / 2) + 1, which loadFixture.ts pins in a test.
INSERT INTO public.classes (
  id, trial_id, name, level, element, section,
  entry_fee, status, time_limit_seconds, num_hides, num_areas,
  has_blank, timer_mode, hides_known, display_order, version
)
SELECT
  format('a1090000-0000-0000-0012-%s%s', s, lpad(c::text, 11, '0'))::uuid,
  format('a1090000-0000-0000-0011-%s%s', s, lpad((((c - 1) / 2) + 1)::text, 11, '0'))::uuid,
  format('%s Advanced',
    CASE ((c - 1) % 4)
      WHEN 0 THEN 'Container'
      WHEN 1 THEN 'Interior'
      WHEN 2 THEN 'Exterior'
      ELSE 'Buried'
    END),
  'Advanced',
  CASE ((c - 1) % 4)
    WHEN 0 THEN 'Container'
    WHEN 1 THEN 'Interior'
    WHEN 2 THEN 'Exterior'
    ELSE 'Buried'
  END,
  NULL,
  30.00, 'upcoming', 180, 2, 2, false, 'single', true, c, 1
FROM generate_series(1, 3) AS load_shows(s)
CROSS JOIN generate_series(1, 4) AS load_classes(c);

-- Call names come from a plausible-name pool (MYK9-566, see header note
-- above), one PER SHOW (s), so no two of these 189 dogs share a `name`
-- (registered name) -- with the same array index used for every s, dog N on
-- all three shows would otherwise get the identical registered name
-- (MYK9-566 round-1 review). Also disjoint from section 17's pool above.
-- Each 21-name pool repeats 3x across a show's 63 dogs, so `call_name`
-- additionally gets a II/III suffix on its 2nd/3rd occurrence -- ringside and
-- check-in lead with the call name, so those need to be unique too, not just
-- the registered name (MYK9-566 round-2 review).
INSERT INTO public.dogs (
  id, name, call_name, breed, sex, date_of_birth, color, status, owner_id, version
)
SELECT
  format('a1090000-0000-0000-0001-%s%s', s, lpad(dog_number::text, 11, '0'))::uuid,
  format('%s %s', dog_name, lpad(dog_number::text, 2, '0')),
  CASE (dog_number - 1) / 21
    WHEN 0 THEN dog_name
    WHEN 1 THEN dog_name || ' II'
    ELSE dog_name || ' III'
  END,
  'Mixed Breed',
  CASE WHEN dog_number % 2 = 0 THEN 'female' ELSE 'male' END,
  DATE '2021-01-01' + dog_number,
  'Black and White',
  'active',
  (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com'),
  1
FROM generate_series(1, 3) AS load_shows(s)
CROSS JOIN generate_series(1, 63) AS load_dogs(dog_number)
CROSS JOIN LATERAL (
  SELECT (CASE s
    WHEN 1 THEN ARRAY[
      'Rowan', 'Sage', 'Talon', 'Wren', 'Zephyr', 'Ash', 'Bramble', 'Cove',
      'Dune', 'Ellery', 'Fern', 'Grove', 'Heath', 'Ivy', 'Juno', 'Kestrel',
      'Larkin', 'Moss', 'Nimbus', 'Opal', 'Pepper'
    ]
    WHEN 2 THEN ARRAY[
      'Quill', 'Reed', 'Sable', 'Thistle', 'Umber', 'Vale', 'Wilder', 'Yara',
      'Zinnia', 'Alder', 'Bristle', 'Canyon', 'Drift', 'Elm', 'Flint', 'Gale',
      'Holler', 'Iris', 'Jetty', 'Knox', 'Lichen'
    ]
    ELSE ARRAY[
      'Marlowe', 'Nutmeg', 'Ozzy', 'Pixel', 'Quincy', 'Ripple', 'Sparrow',
      'Tundra', 'Ursa', 'Violet', 'Wisp', 'Xander', 'Yukon', 'Zeal', 'Acorn',
      'Blossom', 'Cricket', 'Dusty', 'Flurry', 'Garnet', 'Hollow'
    ]
  END)[((dog_number - 1) % 21) + 1] AS dog_name
) AS names;

-- Every seeded dog needs a registration number: `trg_entries_require_dog_registration`
-- (20260828210000) rejects an entry whose dog has none for the TRIAL'S registry, so a
-- seed without these would fail on the first entry insert.
--
-- One row per CONFIGURED registry, not just the one a given show needs. Since
-- MYK9-490 a show carries a single registry, so the AKC demo show's own entries
-- would be satisfied by an AKC row alone -- but the UKC and ASCA sibling shows
-- (section 3b) are enterable in a demo walk, and the guard is per TRIAL registry,
-- not per show. Seeding all three means a seeded dog can be entered anywhere in the
-- fixture set without a second backfill appearing here the first time someone tries.
-- Idempotent and keyed off the dog id so reseeds are stable; the
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
  ((CURRENT_DATE)::timestamp AT TIME ZONE 'UTC')
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
  CURRENT_DATE
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
  ((CURRENT_DATE + 28)::timestamp AT TIME ZONE 'UTC'),
  1
FROM generate_series(1, 3) AS load_shows(s)
CROSS JOIN generate_series(1, 63) AS load_dogs(dog_number);

-- ---------------------------------------------------------------------------
-- 17c. MYK9-515 FULL-CLASS CAP (moved from seed-demo.sql section 4)
-- ---------------------------------------------------------------------------
-- MYK9-515: one full class fixture, so the registration wizard's full-chip
-- reason (`ClassSelectionStep.fullReason.ts`) has something real to explain
-- end to end. Every class in seed-demo.sql section 4 is left at `max_entries = null`;
-- this is the only class in the show with a cap, set to exactly its seeded entry
-- count (63, from the MYK9-109 load fixture, section 17 above) so it reads as full
-- without inventing headroom.
--
-- Why `...036` ('Container Advanced', Sunday Trial 3, trial `...023`), and
-- NOT `...034`/`...035` (Sunday Trial, trial `...022`):
--   - MYK9-529: before that fix, `judge_day_summary` reported BOTH judge-days
--     on this show over `default_judge_day_capacity` (125) from real entry
--     volume alone -- Saturday (`...021`: 031/032/033) at 129 confirmed,
--     Sunday (`...022`: 034/035) at 127 -- so ...034 and ...035 rendered
--     "Every class in this trial is full" from JUDGE-DAY capacity, not this
--     fixture's own `max_entries` cap, which would have made this fixture
--     untestable in isolation (no way to tell which mechanism produced the
--     full chip). MYK9-529 raised the capacity to 200 so neither judge-day is
--     full on its own; `...036` stays the only class with an explicit
--     `max_entries` cap, so it is the only one that isolates the CLASS-LIMIT
--     branch of the full-chip logic. Trials `...023`/`...024` (036-039) still
--     carry no confirmed judge assignment (section 11), so they were never
--     reachable by judge-day capacity either way; ...036 is the first of them.
--   - None of the exhibitor's own named dogs (Willow, Ranger, Juniper, Scout,
--     Maple; section 5) has an entry in this class, so `exhibitor@myk9t.com`
--     always sees it as an available-but-full chip, never an already-entered
--     one, regardless of which dog the e2e walk selects first.
--   - Its 63 entries are the MYK9-109 load fixture only (handler
--     `exhibitor@myk9t.com`, but different dogs from the account's five named
--     ones); no hand-authored entry (section 6) targets this class, so
--     nothing else in the seed depends on its headroom.
--   - No other class in this show shares its element+level (Container/
--     Advanced) on a DIFFERENT day: the only repeated element+level pair
--     anywhere in the show is the deliberate SAME-day `...032`/`...040`
--     Interior/Advanced collision (MYK9-489), which `openAlternative()`
--     excludes because it is not a different day. So this fixture exercises
--     the "no alternative, contact the secretary" branch of the reason, not
--     the "another day still has space" branch -- the latter would need an
--     eleventh class, out of scope here. `allow_waitlist` is already `false`
--     on this class, and the secretary contact comes from the club's email
--     (shows.club_id -> clubs.email, testadmin@myk9t.com), so the rendered
--     reason reads "This class is full. Contact the show secretary at
--     testadmin@myk9t.com." -- it satisfies the e2e's `/is full/` assertion
--     (wizardVisualQA.spec.ts).
UPDATE public.classes
SET max_entries = 63
WHERE id = 'dec1a55e-0000-0000-0000-000000000036';

DO $$
DECLARE
  v_entry_count integer;
BEGIN
  SELECT count(*) INTO v_entry_count
  FROM public.entries
  WHERE show_id = 'dededede-0000-0000-0000-000000000010';

  IF v_entry_count <> 516 THEN
    RAISE EXCEPTION 'MYK9-109 expected 516 demo-show entries, found %', v_entry_count;
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

  -- Exactly one of the three load clubs may take an online payment. Asserted
  -- rather than assumed: both directions of this number are a silent fixture
  -- failure. Zero, and the exhibitor walk cannot reach checkout at all (the
  -- state on 2026-09-04, MYK9-388). Three, and there is no longer a club that
  -- genuinely cannot take money, which is the fixture MYK9-386 needs.
  SELECT count(*) INTO v_total
  FROM public.club_stripe_accounts csa
  WHERE csa.club_id >= 'a1090000-0000-0000-0013-000000000000'::uuid
    AND csa.club_id <  'a1090000-0000-0000-0014-000000000000'::uuid
    AND csa.payouts_enabled
    AND NOT csa.livemode;

  IF v_total <> 1 THEN
    RAISE EXCEPTION
      'MYK9-109 expected exactly 1 payable load club (sandbox), found %', v_total;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- End of MYK9-109 load fixture.
-- ============================================================================
