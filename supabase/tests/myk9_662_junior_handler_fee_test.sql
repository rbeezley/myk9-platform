-- Behavioral test for 20260926193700/20260926193900 (MYK9-662, MYK9-570 slice 2):
-- submit_show_entries prices a junior handler at the show's junior handler fee.
--
-- Junior status is derived per entry from the HANDLER's date of birth and the
-- entry's own trial (public.derive_junior_status), never a hand-set flag. Every
-- case below submits through the real RPC as a secretary (payment_method
-- 'secretary_paid'), so it exercises the whole path: derivation, the fee
-- override, and the stored entry_fee — not just the pure SQL function.
--
-- `now()` cannot be moved inside a transaction, so every show/trial is placed
-- 30 days out (entries open, pre-entry tier) so the day-of-show tier never
-- interferes with isolating the junior override. Every date of birth is built
-- relative to the trial date with a buffer month, so the case is stable
-- regardless of what day CI runs on.
--
-- Why each case earns its place:
--   1. THE REPRODUCTION. A junior handler (15 at the trial), show has a
--      junior_handler_fee of 15.00: entry_fee = 15.00, not the 30.00 pre-entry
--      tier. Before this migration there was no such column and every handler
--      paid the same fee regardless of age.
--   2. An adult handler (40), same show: entry_fee = 30.00 — the junior fee
--      must never apply to someone who is not derived as a junior.
--   3. A handler with NO date of birth on file, same show: entry_fee = 30.00.
--      'unknown' never buys the discount — the issue's own open question
--      ("what does unknown cost?") answered as "the normal price", not free
--      eligibility assumed from missing data.
--   4. A junior-age handler on a show that has NOT configured a junior fee
--      (junior_handler_fee IS NULL): entry_fee = 30.00. The column being unset
--      must never be read as "always free for juniors".
--   5. A junior-age handler on a show whose junior_handler_fee is exactly 0:
--      entry_fee = 30.00, same "> 0 means configured" convention as
--      day_of_show_fee (a blank fee-section input persists as 0.00).
--   6. derive_junior_status itself, directly, for all three registries —
--      cheaper than building full entry fixtures for the AKC/UKC/ASCA
--      divergence the TS mirror (authoritativeFee.test.ts) already covers in
--      detail; this just proves the SQL side agrees on the same three points.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/myk9_662_junior_handler_fee_test.sql
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000662010', 'MYK9-662 Test Club');

-- Show A: junior_handler_fee = 15.00 (cases 1-3). Show B: unset (case 4).
-- Show C: exactly 0 (case 5). All three share the same entry window (30 days
-- out, closes in 10 days) so every entry prices at the pre-entry tier.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments,
                          pre_entry_fee, day_of_show_fee, junior_handler_fee)
SELECT v.id, v.name, 'AKC',
       (today + 30)::timestamp AT TIME ZONE 'UTC',
       (today + 30)::timestamp AT TIME ZONE 'UTC',
       '00000000-0000-0000-0000-000000662010', 'published',
       (today - 60)::timestamp AT TIME ZONE 'UTC',
       (today + 10)::timestamp AT TIME ZONE 'UTC',
       true, true, 30, 35, v.junior_fee
FROM (SELECT (now() AT TIME ZONE 'UTC')::date AS today) AS anchor,
     (VALUES
       ('00000000-0000-0000-0000-000000662101'::uuid, 'MYK9-662 Show A junior fee set', 15::numeric),
       ('00000000-0000-0000-0000-000000662102'::uuid, 'MYK9-662 Show B junior fee unset', NULL),
       ('00000000-0000-0000-0000-000000662103'::uuid, 'MYK9-662 Show C junior fee zero', 0)
     ) AS v(id, name, junior_fee);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
SELECT
  ('00000000-0000-0000-0000-0000006622' || suffix)::uuid,
  ('00000000-0000-0000-0000-0000006621' || suffix)::uuid,
  'MYK9-662 Trial ' || suffix,
  ((now() AT TIME ZONE 'UTC')::date + 30),
  'AKC', 'Scent Work', 'UTC'
FROM (VALUES ('01'), ('02'), ('03')) AS t(suffix);

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
SELECT
  ('00000000-0000-0000-0000-0000006623' || suffix)::uuid,
  ('00000000-0000-0000-0000-0000006622' || suffix)::uuid,
  'Interior Novice A', 'Interior', 'Novice', 'upcoming', 'manual', 30
FROM (VALUES ('01'), ('02'), ('03')) AS c(suffix);

-- Dates of birth built relative to the trial date (today + 30), with a
-- one-month buffer past the exact 15/40-year mark so the case is unambiguous
-- regardless of leap years or which day CI runs on.
INSERT INTO public.people (id, first_name, last_name, email, date_of_birth)
SELECT '00000000-0000-0000-0000-000000662001', 'MYK9-662', 'Junior', 'myk9-662-junior@example.test',
       (((now() AT TIME ZONE 'UTC')::date + 30) - interval '15 years' - interval '1 month')::date
UNION ALL
SELECT '00000000-0000-0000-0000-000000662002', 'MYK9-662', 'Adult', 'myk9-662-adult@example.test',
       (((now() AT TIME ZONE 'UTC')::date + 30) - interval '40 years')::date
UNION ALL
SELECT '00000000-0000-0000-0000-000000662003', 'MYK9-662', 'NoDob', 'myk9-662-nodob@example.test',
       NULL;

INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000000662004', 'MYK9-662', 'Secretary', 'myk9-662-secretary@example.test');

-- `handle_new_user` adopts each pre-seeded people row BY EMAIL (migration 131)
-- and creates its exhibitor_profiles row, needed so evaluate_entry_capacity
-- (called for every entry, official or not) resolves a real profile instead of
-- an untested NULL. All four people need one, not just the secretary.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000662701', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-662-junior@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000662702', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-662-adult@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000662703', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-662-nodob@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000662704', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-662-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000662001'::uuid, '00000000-0000-0000-0000-000000662701'::uuid),
  ('00000000-0000-0000-0000-000000662002'::uuid, '00000000-0000-0000-0000-000000662702'::uuid),
  ('00000000-0000-0000-0000-000000662003'::uuid, '00000000-0000-0000-0000-000000662703'::uuid),
  ('00000000-0000-0000-0000-000000662004'::uuid, '00000000-0000-0000-0000-000000662704'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

-- Fixture sanity: without these, every case below would fail for the wrong
-- reason (an unrelated capacity/authorization error, not a junior-fee bug).
DO $$
BEGIN
  IF (SELECT count(*) FROM public.exhibitor_profiles
      WHERE person_id IN (
        '00000000-0000-0000-0000-000000662001',
        '00000000-0000-0000-0000-000000662002',
        '00000000-0000-0000-0000-000000662003'
      )) <> 3 THEN
    RAISE EXCEPTION
      'FIXTURE handle_new_user did not create all three exhibitor profiles — every case below would fail for the wrong reason';
  END IF;
END;
$$;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000662004', roles.id, club.id, true,
       '00000000-0000-0000-0000-000000662704'
FROM public.roles roles,
     (VALUES
       ('00000000-0000-0000-0000-000000662010'::uuid)
     ) AS club(id)
WHERE roles.name = 'secretary';

-- `breed` and `call_name` are NOT NULL without defaults on public.dogs. One dog
-- per handler person; the junior handler's dog is reused across shows B and C
-- (different class ids, so entries_dog_class_unique_idx never fires).
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES
  ('00000000-0000-0000-0000-000000662401', 'MYK9-662 Dog Junior', 'Junior', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000662001'),
  ('00000000-0000-0000-0000-000000662402', 'MYK9-662 Dog Adult', 'Adult', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000662002'),
  ('00000000-0000-0000-0000-000000662403', 'MYK9-662 Dog NoDob', 'NoDob', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000662003');

-- An entry needs a registration with the TRIAL'S registry (20260828210000), or
-- every case below would fail for a reason unrelated to the junior fee.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000000662401', 'AKC', 'AKC66200001', true),
  ('00000000-0000-0000-0000-000000662402', 'AKC', 'AKC66200002', true),
  ('00000000-0000-0000-0000-000000662403', 'AKC', 'AKC66200003', true);

INSERT INTO public.enrollments (id, show_id, handler_id)
SELECT
  ('00000000-0000-0000-0000-0000006625' || suffix)::uuid,
  ('00000000-0000-0000-0000-0000006621' || suffix)::uuid,
  '00000000-0000-0000-0000-000000662001'
FROM (VALUES ('01'), ('02'), ('03')) AS e(suffix);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  secretary_auth CONSTANT uuid := '00000000-0000-0000-0000-000000662704';
  expectation    record;
  result         jsonb;
  entry_id       uuid;
  got_fee        numeric;
  got_fee_cents  int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', secretary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_auth, 'role', 'authenticated')::text, true);

  ----------------------------------------------------------------------------
  -- Cases 1-3: same show (junior fee configured at 15.00), three handlers.
  ----------------------------------------------------------------------------
  FOR expectation IN
    SELECT *
    FROM (VALUES
      ('1', 'junior handler (15 at the trial)',      '00000000-0000-0000-0000-000000662001'::uuid, 15::numeric, 1500),
      ('2', 'adult handler (40 at the trial)',        '00000000-0000-0000-0000-000000662002'::uuid, 30::numeric, 3000),
      ('3', 'handler with no date of birth on file',  '00000000-0000-0000-0000-000000662003'::uuid, 30::numeric, 3000)
    ) AS cases(case_num, label, handler_id, want_fee, want_cents)
    ORDER BY case_num
  LOOP
    result := public.submit_show_entries(
      '00000000-0000-0000-0000-000000662101'::uuid,
      '00000000-0000-0000-0000-000000662501'::uuid,
      jsonb_build_array(jsonb_build_object(
        'dog_id', ('00000000-0000-0000-0000-00000066240' || expectation.case_num)::uuid,
        'class_id', '00000000-0000-0000-0000-000000662301'::uuid,
        'handler_id', expectation.handler_id,
        'handler_name', 'MYK9-662 ' || expectation.label,
        'client_fee_cents', expectation.want_cents)),
      ('00000000-0000-0000-0000-00000066280' || expectation.case_num)::uuid,
      'secretary_paid');

    IF jsonb_array_length(result->'entries') <> 1 THEN
      RAISE EXCEPTION 'FAIL case % (%) committed no entry: %',
        expectation.case_num, expectation.label, result;
    END IF;

    entry_id := (result->'entries'->0->>'entry_id')::uuid;
    SELECT e.entry_fee INTO got_fee FROM public.entries e WHERE e.id = entry_id;
    got_fee_cents := (result->'outcomes'->0->>'fee_cents')::int;

    IF got_fee <> expectation.want_fee THEN
      RAISE EXCEPTION 'FAIL case % (%): entry_fee = % (expected %)',
        expectation.case_num, expectation.label, got_fee, expectation.want_fee;
    END IF;
    IF got_fee_cents <> expectation.want_cents THEN
      RAISE EXCEPTION 'FAIL case % (%): outcome fee_cents = % (expected %)',
        expectation.case_num, expectation.label, got_fee_cents, expectation.want_cents;
    END IF;
  END LOOP;

  ----------------------------------------------------------------------------
  -- Case 4: junior-age handler, but the SHOW has no junior_handler_fee set.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    '00000000-0000-0000-0000-000000662102'::uuid,
    '00000000-0000-0000-0000-000000662502'::uuid,
    jsonb_build_array(jsonb_build_object(
      'dog_id', '00000000-0000-0000-0000-000000662401'::uuid,
      'class_id', '00000000-0000-0000-0000-000000662302'::uuid,
      'handler_id', '00000000-0000-0000-0000-000000662001'::uuid,
      'handler_name', 'MYK9-662 Junior',
      'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000662804'::uuid,
    'secretary_paid');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL case 4 (no junior fee configured) committed no entry: %', result;
  END IF;
  SELECT e.entry_fee INTO got_fee
  FROM public.entries e WHERE e.id = (result->'entries'->0->>'entry_id')::uuid;
  IF got_fee <> 30 THEN
    RAISE EXCEPTION 'FAIL case 4 (no junior fee configured): entry_fee = % (expected 30, the pre-entry tier)',
      got_fee;
  END IF;

  ----------------------------------------------------------------------------
  -- Case 5: junior-age handler, junior_handler_fee is exactly 0.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    '00000000-0000-0000-0000-000000662103'::uuid,
    '00000000-0000-0000-0000-000000662503'::uuid,
    jsonb_build_array(jsonb_build_object(
      'dog_id', '00000000-0000-0000-0000-000000662401'::uuid,
      'class_id', '00000000-0000-0000-0000-000000662303'::uuid,
      'handler_id', '00000000-0000-0000-0000-000000662001'::uuid,
      'handler_name', 'MYK9-662 Junior',
      'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000662805'::uuid,
    'secretary_paid');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL case 5 (junior fee = 0) committed no entry: %', result;
  END IF;
  SELECT e.entry_fee INTO got_fee
  FROM public.entries e WHERE e.id = (result->'entries'->0->>'entry_id')::uuid;
  IF got_fee <> 30 THEN
    RAISE EXCEPTION 'FAIL case 5 (junior fee = 0): entry_fee = % (expected 30, zero means unset)',
      got_fee;
  END IF;

  RAISE NOTICE 'PASS myk9_662_junior_handler_fee_test (submit_show_entries cases 1-5)';
END;
$$;

----------------------------------------------------------------------------
-- Case 6: derive_junior_status directly, for all three registries. Cheaper
-- than building full entry fixtures for the divergence the TS mirror
-- (authoritativeFee.test.ts) already covers; this proves the SQL side agrees
-- on the same three points, not the whole rulebook.
----------------------------------------------------------------------------
DO $$
DECLARE
  akc_junior  text;
  akc_adult   text;
  ukc_junior  text; -- turns 18 in Feb; still a UKC junior in November (Jan-1 anchor)
  ukc_adult   text; -- same handler, AKC's own-day-of-trial rule: already adult
  asca_kind   text; -- ASCA has no ceiling: never derivable
  missing_dob text;
BEGIN
  akc_junior  := public.derive_junior_status('2010-01-01'::date, '2026-06-20'::date, 'AKC');
  akc_adult   := public.derive_junior_status('1990-01-01'::date, '2026-06-20'::date, 'AKC');
  ukc_junior  := public.derive_junior_status('2008-02-01'::date, '2026-11-01'::date, 'UKC');
  ukc_adult   := public.derive_junior_status('2008-02-01'::date, '2026-11-01'::date, 'AKC');
  asca_kind   := public.derive_junior_status('2015-01-01'::date, '2026-06-20'::date, 'ASCA');
  missing_dob := public.derive_junior_status(NULL::date, '2026-06-20'::date, 'AKC');

  IF akc_junior IS DISTINCT FROM 'junior' THEN
    RAISE EXCEPTION 'FAIL case 6 AKC junior: got % (expected junior)', akc_junior;
  END IF;
  IF akc_adult IS DISTINCT FROM 'adult' THEN
    RAISE EXCEPTION 'FAIL case 6 AKC adult: got % (expected adult)', akc_adult;
  END IF;
  IF ukc_junior IS DISTINCT FROM 'junior' THEN
    RAISE EXCEPTION 'FAIL case 6 UKC January-1 anchor: got % (expected junior)', ukc_junior;
  END IF;
  IF ukc_adult IS DISTINCT FROM 'adult' THEN
    RAISE EXCEPTION 'FAIL case 6 AKC same handler/date: got % (expected adult, proving the two registries diverge)', ukc_adult;
  END IF;
  IF asca_kind IS DISTINCT FROM 'unknown' THEN
    RAISE EXCEPTION 'FAIL case 6 ASCA (no derivable ceiling): got % (expected unknown)', asca_kind;
  END IF;
  IF missing_dob IS DISTINCT FROM 'unknown' THEN
    RAISE EXCEPTION 'FAIL case 6 missing date of birth: got % (expected unknown)', missing_dob;
  END IF;

  RAISE NOTICE 'PASS myk9_662_junior_handler_fee_test (derive_junior_status case 6)';
END;
$$;

ROLLBACK;
