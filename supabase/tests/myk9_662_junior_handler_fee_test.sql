-- Behavioral test for the ordered 20260928174100/174700 MYK9-662 migrations:
-- submit_show_entries prices a junior handler at the show's junior handler fee.
--
-- Junior status is NOT re-derived by this change. It reuses the existing
-- MYK9-664 mechanism (20260924231700) — private.entry_handler_is_junior(),
-- backed by people_private.date_of_birth (RLS: readable only by the person
-- themself or a site admin; date of birth left public.people entirely in that
-- migration). The AKC/UKC/ASCA registry divergence and the derivation itself
-- are already thoroughly covered by supabase/tests/myk9_664_people_private_test.sql
-- and by the TS mirror (authoritativeFee.test.ts, for the edge-function
-- pricing paths) — this file does not repeat that coverage. It proves only
-- the NEW behavior: that submit_show_entries consults the existing mechanism
-- and applies shows.junior_handler_fee correctly. Every case below submits
-- through the real RPC as a secretary (payment_method 'secretary_paid').
-- The junior fixture's stored date of birth needs no secretary verification:
-- self-entered dates qualify under the owner's 2026-09-28 decision.
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
--   3. A handler with NO people_private row (no date of birth on file), same
--      show: entry_fee = 30.00. 'unknown'/NULL never buys the discount — the
--      issue's own open question ("what does unknown cost?") answered as "the
--      normal price", not free eligibility assumed from missing data.
--   4. A junior-age handler on a show that has NOT configured a junior fee
--      (junior_handler_fee IS NULL): entry_fee = 30.00. The column being unset
--      must never be read as "always free for juniors".
--   5. A junior-age handler on a show whose junior_handler_fee is exactly 0:
--      entry_fee = 30.00, same "> 0 means configured" convention as
--      day_of_show_fee (a blank fee-section input persists as 0.00).
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

DO $$
BEGIN
  BEGIN
    UPDATE public.shows SET junior_handler_fee = -1
    WHERE id = '00000000-0000-0000-0000-000000662101';
    RAISE EXCEPTION 'negative junior handler fee was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

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

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000662001', 'MYK9-662', 'Junior', 'myk9-662-junior@example.test'),
  ('00000000-0000-0000-0000-000000662002', 'MYK9-662', 'Adult', 'myk9-662-adult@example.test'),
  ('00000000-0000-0000-0000-000000662003', 'MYK9-662', 'NoDob', 'myk9-662-nodob@example.test'),
  ('00000000-0000-0000-0000-000000662004', 'MYK9-662', 'Secretary', 'myk9-662-secretary@example.test');

-- MYK9-664: date of birth lives in people_private, not people (RLS: the
-- person themself or a site admin only — this INSERT runs as the connecting
-- superuser role, before SET LOCAL ROLE authenticated below, so it is not
-- subject to that policy). Dates of birth are built relative to the trial
-- date (today + 30) with a one-month buffer past the exact 15/40-year mark,
-- so the case is unambiguous regardless of leap years or which day CI runs
-- on. The "no date of birth on file" case (662003) gets no row at all —
-- private.entry_handler_is_junior LEFT JOINs people_private, so an absent
-- row reads as NULL, exactly like a person who has one but left it blank.
INSERT INTO public.people_private (person_id, date_of_birth)
SELECT '00000000-0000-0000-0000-000000662001'::uuid,
       (((now() AT TIME ZONE 'UTC')::date + 30) - interval '15 years' - interval '1 month')::date
UNION ALL
SELECT '00000000-0000-0000-0000-000000662002'::uuid,
       (((now() AT TIME ZONE 'UTC')::date + 30) - interval '40 years')::date;

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
   '00000000-0000-0000-0000-000000662003'),
  ('00000000-0000-0000-0000-000000662404', 'MYK9-662 Dog Other Handler', 'Other', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000662001'),
  ('00000000-0000-0000-0000-000000662405', 'MYK9-662 Dog Owner Default', 'Default', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000662001');

-- An entry needs a registration with the TRIAL'S registry (20260828210000), or
-- every case below would fail for a reason unrelated to the junior fee.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000000662401', 'AKC', 'AKC66200001', true),
  ('00000000-0000-0000-0000-000000662402', 'AKC', 'AKC66200002', true),
  ('00000000-0000-0000-0000-000000662403', 'AKC', 'AKC66200003', true),
  ('00000000-0000-0000-0000-000000662404', 'AKC', 'AKC66200004', true),
  ('00000000-0000-0000-0000-000000662405', 'AKC', 'AKC66200005', true);

INSERT INTO public.enrollments (id, show_id, handler_id)
SELECT
  ('00000000-0000-0000-0000-0000006625' || suffix)::uuid,
  ('00000000-0000-0000-0000-0000006621' || suffix)::uuid,
  '00000000-0000-0000-0000-000000662001'
FROM (VALUES ('01'), ('02'), ('03')) AS e(suffix);

-- Separate class for direct offline-sync inserts (the RPC cases above use 301).
INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES ('00000000-0000-0000-0000-000000662304',
        '00000000-0000-0000-0000-000000662201',
        'Exterior Novice A', 'Exterior', 'Novice', 'upcoming', 'manual', 30);

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

  -- A staff-selected unrelated handler is allowed when this show has no
  -- junior fee: there is no private discount decision to probe.
  result := public.submit_show_entries(
    '00000000-0000-0000-0000-000000662102'::uuid,
    '00000000-0000-0000-0000-000000662502'::uuid,
    jsonb_build_array(jsonb_build_object(
      'dog_id', '00000000-0000-0000-0000-000000662404'::uuid,
      'class_id', '00000000-0000-0000-0000-000000662302'::uuid,
      'handler_id', '00000000-0000-0000-0000-000000662002'::uuid,
      'handler_name', 'MYK9-662 Adult',
      'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000662808'::uuid,
    'secretary_paid');
  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL staff handler guard applied on a show without junior fee';
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

  ----------------------------------------------------------------------------
  -- Case 6: a typed handler with no resolved person ID must not inherit the
  -- junior dog's owner's birth date when staff submits on their behalf.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    '00000000-0000-0000-0000-000000662101'::uuid,
    '00000000-0000-0000-0000-000000662501'::uuid,
    jsonb_build_array(jsonb_build_object(
      'dog_id', '00000000-0000-0000-0000-000000662404'::uuid,
      'class_id', '00000000-0000-0000-0000-000000662301'::uuid,
      'handler_name', 'Unmatched Adult Handler',
      'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000662806'::uuid,
    'secretary_paid');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL case 6 (unresolved typed handler) committed no entry: %', result;
  END IF;
  SELECT e.entry_fee INTO got_fee
  FROM public.entries e WHERE e.id = (result->'entries'->0->>'entry_id')::uuid;
  IF got_fee <> 30 THEN
    RAISE EXCEPTION 'FAIL case 6 (unresolved typed handler): entry_fee = % (expected 30)', got_fee;
  END IF;
  IF (SELECT handler_id FROM public.entries
      WHERE id = (result->'entries'->0->>'entry_id')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL case 6: typed unmatched handler inherited owner ID';
  END IF;

  ----------------------------------------------------------------------------
  -- Case 7: with no selected or typed handler, submission records the dog
  -- owner as handler and must charge that owner's junior rate.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    '00000000-0000-0000-0000-000000662101'::uuid,
    '00000000-0000-0000-0000-000000662501'::uuid,
    jsonb_build_array(jsonb_build_object(
      'dog_id', '00000000-0000-0000-0000-000000662405'::uuid,
      'class_id', '00000000-0000-0000-0000-000000662301'::uuid,
      'client_fee_cents', 1500)),
    '00000000-0000-0000-0000-000000662807'::uuid,
    'secretary_paid');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL case 7 (owner-default handler) committed no entry: %', result;
  END IF;
  SELECT e.entry_fee INTO got_fee
  FROM public.entries e WHERE e.id = (result->'entries'->0->>'entry_id')::uuid;
  IF got_fee <> 15 THEN
    RAISE EXCEPTION 'FAIL case 7 (owner-default handler): entry_fee = % (expected 15)', got_fee;
  END IF;

  ----------------------------------------------------------------------------
  -- Cases 8-9: offline desk writes a pending entry with no fee. The BEFORE
  -- INSERT trigger prices it before it becomes visible, using private DOB.
  ----------------------------------------------------------------------------
  INSERT INTO public.entries (id, show_id, class_id, dog_id, handler_id,
                              entry_source, entry_status, payment_status,
                              payment_method, entry_fee, is_day_of_show)
  VALUES
    ('00000000-0000-0000-0000-000000662901',
     '00000000-0000-0000-0000-000000662101',
     '00000000-0000-0000-0000-000000662304',
     '00000000-0000-0000-0000-000000662401',
     '00000000-0000-0000-0000-000000662001',
     'myk9', 'confirmed', 'pending', 'cash', NULL, false),
    ('00000000-0000-0000-0000-000000662902',
     '00000000-0000-0000-0000-000000662101',
     '00000000-0000-0000-0000-000000662304',
     '00000000-0000-0000-0000-000000662402',
     '00000000-0000-0000-0000-000000662002',
     'myk9', 'confirmed', 'pending', 'cash', NULL, false);

  -- No chosen handler: offline insert resolves the dog owner before the
  -- existing junior-flag trigger runs, just like the online RPC does.
  INSERT INTO public.entries (id, show_id, class_id, dog_id, handler,
                              entry_source, entry_status, payment_status,
                              payment_method, entry_fee, is_day_of_show)
  VALUES ('00000000-0000-0000-0000-000000662903',
          '00000000-0000-0000-0000-000000662101',
          '00000000-0000-0000-0000-000000662304',
          '00000000-0000-0000-0000-000000662405',
          '', 'myk9', 'confirmed', 'pending', 'cash', NULL, false);

  IF (SELECT entry_fee FROM public.entries
      WHERE id = '00000000-0000-0000-0000-000000662901') <> 15 THEN
    RAISE EXCEPTION 'FAIL case 8: offline junior fee was not filled at 15';
  END IF;
  IF (SELECT entry_fee FROM public.entries
      WHERE id = '00000000-0000-0000-0000-000000662902') <> 30 THEN
    RAISE EXCEPTION 'FAIL case 9: offline adult fee was not filled at 30';
  END IF;

  -- An offline write whose local show lacked the junior column gets the
  -- normal fee immediately on a show with no junior tier. The frozen value
  -- survives a later show-fee edit.
  INSERT INTO public.entries (id, show_id, class_id, dog_id, handler_id,
                              entry_source, entry_status, payment_status,
                              payment_method, entry_fee, is_day_of_show)
  VALUES ('00000000-0000-0000-0000-000000662904',
          '00000000-0000-0000-0000-000000662102',
          '00000000-0000-0000-0000-000000662302',
          '00000000-0000-0000-0000-000000662402',
          '00000000-0000-0000-0000-000000662002',
          'myk9', 'confirmed', 'pending', 'check', NULL, false);
  IF (SELECT entry_fee FROM public.entries
      WHERE id = '00000000-0000-0000-0000-000000662904') IS DISTINCT FROM 30 THEN
    RAISE EXCEPTION 'FAIL offline NULL fee remained unpriced on show without junior tier';
  END IF;
  IF public.freeze_pending_entry_fee('00000000-0000-0000-0000-000000662904') <> 30 THEN
    RAISE EXCEPTION 'FAIL server-priced offline fee was not frozen at 30';
  END IF;
  UPDATE public.shows SET pre_entry_fee = 40
    WHERE id = '00000000-0000-0000-0000-000000662102';
  IF (SELECT entry_fee FROM public.entries
      WHERE id = '00000000-0000-0000-0000-000000662904') IS DISTINCT FROM 30 THEN
    RAISE EXCEPTION 'FAIL offline fee changed after show fee edit';
  END IF;
  IF public.freeze_pending_entry_fee('00000000-0000-0000-0000-000000662904') <> 30 THEN
    RAISE EXCEPTION 'FAIL frozen fee changed after show fee edit';
  END IF;
END;
$$;

DO $$
DECLARE
  blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000662701', true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000662701',
                       'role', 'authenticated')::text, true);
  BEGIN
    UPDATE public.dogs SET co_owner_id = '00000000-0000-0000-0000-000000662002'
      WHERE id = '00000000-0000-0000-0000-000000662401';
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := SQLERRM = 'A co-owner must be verified by show staff before assignment';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL arbitrary co-owner assignment was allowed'; END IF;
END;
$$;

-- The secretary role can see entry_fee but not handler_is_junior, which is a
-- private derived fact. Verify trigger ordering as the fixture owner instead.
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.entries
    WHERE id = '00000000-0000-0000-0000-000000662903'
      AND entry_fee = 15
      AND handler_id = '00000000-0000-0000-0000-000000662001'
      AND handler_is_junior IS TRUE
  ) THEN
    RAISE EXCEPTION 'FAIL case 10: offline owner fallback fee, handler, or junior flag';
  END IF;
  RAISE NOTICE 'PASS myk9_662_junior_handler_fee_test';
END;
$$;

ROLLBACK;
