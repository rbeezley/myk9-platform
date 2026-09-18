-- Behavioral test for 20260918211700_myk9_642_day_of_show_entry_flag.sql (MYK9-642).
--
-- `submit_show_entries` must store `entries.is_day_of_show` from the SAME rule
-- it prices the entry with, so the receipt and the registry report can never
-- disagree about what kind of entry a row is.
--
-- `now()` cannot be moved inside a transaction, so each case gets its own show
-- whose entry window is placed relative to today instead. Every trial is pinned
-- to UTC so the rule's "today" -- `(now() AT TIME ZONE <trial tz>)::date` -- is
-- exactly the anchor these fixtures are built from, whatever zone CI runs in.
--
-- Why each case earns its place:
--   1. THE REPRODUCTION. Show running today, entries closed a week ago, a
--      secretary takes a mail-in: is_day_of_show = true AND entry_fee = 35.00.
--      Before this migration the fee was right and the flag was false, and the
--      UKC Nosework Trial Report counted the entry under "Number of PreEntries".
--   2. A genuine pre-entry, same function, same fees, entries still open:
--      false and 30.00. Without it case 1 passes for a function that hardcodes
--      true -- exactly the bug the offline late-entry writer had on its side.
--   3. THE BOUNDARY, on the close date itself. Entries are still open that day
--      (this function's own entry-close guard uses `>`), so it is still a
--      pre-entry: false, 30.00. One `>=` here and every last-day pre-entry is
--      billed to the registry as a day-of.
--   4. The day AFTER close but a month BEFORE the show starts. This is the
--      window the old fee rule got wrong in the other direction: it charged
--      pre-entry for an entry the registry will not count as a pre-entry. Now
--      day-of on both axes: true and 35.00. Officials only -- an exhibitor is
--      refused by the entry-close guard before reaching this code.
--   5. A show with NO entry_close_date, on its start date: the start-date
--      fallback still fires (true, 35.00), so a show whose secretary never set
--      a close date is not permanently a pre-entry-only show.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/submit_entries_day_of_show_flag_test.sql
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000642010', 'MYK9-642 Test Club');

-- Fees are the reproduction's: pre-entry 30.00, day-of 35.00. `start_date` and
-- `entry_close_date` are timestamptz stored at midnight UTC, which is how the
-- rule reads them, so every fixture date is built that way too.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments,
                          pre_entry_fee, day_of_show_fee)
SELECT v.id, v.name, 'UKC',
       -- `::timestamp AT TIME ZONE 'UTC'`, never `::timestamptz`: the latter
       -- reads midnight in the SESSION zone, and these columns are midnight UTC.
       (today + v.start_offset)::timestamp AT TIME ZONE 'UTC',
       (today + v.start_offset)::timestamp AT TIME ZONE 'UTC',
       '00000000-0000-0000-0000-000000642010', 'published',
       (today - 60)::timestamp AT TIME ZONE 'UTC',
       CASE WHEN v.close_offset IS NULL THEN NULL
            ELSE (today + v.close_offset)::timestamp AT TIME ZONE 'UTC' END,
       true, true, 30, 35
FROM (SELECT (now() AT TIME ZONE 'UTC')::date AS today) AS anchor,
     (VALUES
       -- id, name, start offset, close offset
       ('00000000-0000-0000-0000-000000642101'::uuid, 'MYK9-642 Case 1 show day, closed',  0,  -7),
       ('00000000-0000-0000-0000-000000642102'::uuid, 'MYK9-642 Case 2 entries open',     30,  10),
       ('00000000-0000-0000-0000-000000642103'::uuid, 'MYK9-642 Case 3 closes today',     30,   0),
       ('00000000-0000-0000-0000-000000642104'::uuid, 'MYK9-642 Case 4 closed yesterday', 30,  -1),
       ('00000000-0000-0000-0000-000000642105'::uuid, 'MYK9-642 Case 5 no close date',     0, NULL)
     ) AS v(id, name, start_offset, close_offset);

-- The rule reads "today" in the show's entry-window timezone, which this
-- function derives from the show's first trial. Pinning every trial to UTC is
-- what makes the boundaries above exact rather than within-a-day.
INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
SELECT
  ('00000000-0000-0000-0000-0000006422' || suffix)::uuid,
  ('00000000-0000-0000-0000-0000006421' || suffix)::uuid,
  'MYK9-642 Trial ' || suffix,
  ((now() AT TIME ZONE 'UTC')::date + offset_days),
  'UKC', 'Nosework', 'UTC'
FROM (VALUES ('01', 0), ('02', 30), ('03', 30), ('04', 30), ('05', 0))
  AS t(suffix, offset_days);

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
SELECT
  ('00000000-0000-0000-0000-0000006423' || suffix)::uuid,
  ('00000000-0000-0000-0000-0000006422' || suffix)::uuid,
  'Interior Novice A', 'Interior', 'Novice', 'upcoming', 'manual', 30
FROM (VALUES ('01'), ('02'), ('03'), ('04'), ('05')) AS c(suffix);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000642001', 'MYK9-642', 'Exhibitor', 'myk9-642-exhibitor@example.test'),
  ('00000000-0000-0000-0000-000000642002', 'MYK9-642', 'Secretary', 'myk9-642-secretary@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000642701', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-642-exhibitor@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000642702', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-642-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000642001'::uuid, '00000000-0000-0000-0000-000000642701'::uuid),
  ('00000000-0000-0000-0000-000000642002'::uuid, '00000000-0000-0000-0000-000000642702'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000642002', roles.id,
       '00000000-0000-0000-0000-000000642010', true,
       '00000000-0000-0000-0000-000000642702'
FROM public.roles WHERE roles.name = 'secretary';

-- `handle_new_user` adopts the pre-seeded people row BY EMAIL (migration 131)
-- and creates the exhibitor_profiles row itself, so an explicit INSERT collides
-- on auth_user_id. Assert the trigger did its job instead: without that row
-- every case below fails with "registration does not belong to the caller".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.exhibitor_profiles
    WHERE person_id = '00000000-0000-0000-0000-000000642001'
      AND auth_user_id = '00000000-0000-0000-0000-000000642701'
  ) THEN
    RAISE EXCEPTION
      'FIXTURE handle_new_user did not create the exhibitor profile — every case below would fail for the wrong reason';
  END IF;
END;
$$;

-- `breed` and `call_name` are NOT NULL without defaults on public.dogs.
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES ('00000000-0000-0000-0000-000000642401', 'MYK9-642 Dog One', 'Uno', 'Beagle', 'active',
        '00000000-0000-0000-0000-000000642001');

-- An entry needs a registration with the TRIAL'S registry (20260828210000), or
-- every case below would fail for a reason unrelated to the entry window.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES ('00000000-0000-0000-0000-000000642401', 'UKC', 'UKC64200001', true);

INSERT INTO public.enrollments (id, show_id, handler_id)
SELECT
  ('00000000-0000-0000-0000-0000006425' || suffix)::uuid,
  ('00000000-0000-0000-0000-0000006421' || suffix)::uuid,
  '00000000-0000-0000-0000-000000642001'
FROM (VALUES ('01'), ('02'), ('03'), ('04'), ('05')) AS e(suffix);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  secretary_auth CONSTANT uuid := '00000000-0000-0000-0000-000000642702';
  expectation    record;
  result         jsonb;
  entry_id       uuid;
  got_flag       boolean;
  got_fee        numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', secretary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_auth, 'role', 'authenticated')::text, true);

  FOR expectation IN
    SELECT *
    FROM (VALUES
      ('01', 'show day, entries closed a week ago', true,  35::numeric, 3500),
      ('02', 'entries still open',                  false, 30::numeric, 3000),
      ('03', 'the close date itself',               false, 30::numeric, 3000),
      ('04', 'the day after entries closed',        true,  35::numeric, 3500),
      ('05', 'show day, no close date configured',  true,  35::numeric, 3500)
    ) AS cases(suffix, label, want_flag, want_fee, client_cents)
    ORDER BY suffix
  LOOP
    result := public.submit_show_entries(
      ('00000000-0000-0000-0000-0000006421' || expectation.suffix)::uuid,
      ('00000000-0000-0000-0000-0000006425' || expectation.suffix)::uuid,
      jsonb_build_array(jsonb_build_object(
        'dog_id', '00000000-0000-0000-0000-000000642401'::uuid,
        'class_id', ('00000000-0000-0000-0000-0000006423' || expectation.suffix)::uuid,
        'handler_name', 'MYK9-642 Exhibitor',
        'client_fee_cents', expectation.client_cents)),
      ('00000000-0000-0000-0000-0000006429' || expectation.suffix)::uuid,
      'secretary_paid');

    IF jsonb_array_length(result->'entries') <> 1 THEN
      RAISE EXCEPTION 'FAIL case % (%) committed no entry: %',
        expectation.suffix, expectation.label, result;
    END IF;

    entry_id := (result->'entries'->0->>'entry_id')::uuid;
    SELECT e.is_day_of_show, e.entry_fee INTO got_flag, got_fee
    FROM public.entries e WHERE e.id = entry_id;

    IF got_flag IS DISTINCT FROM expectation.want_flag THEN
      RAISE EXCEPTION 'FAIL case % (%): is_day_of_show = % (expected %)',
        expectation.suffix, expectation.label, got_flag, expectation.want_flag;
    END IF;
    IF got_fee <> expectation.want_fee THEN
      RAISE EXCEPTION 'FAIL case % (%): entry_fee = % (expected %)',
        expectation.suffix, expectation.label, got_fee, expectation.want_fee;
    END IF;
  END LOOP;

  RAISE NOTICE 'PASS submit_entries_day_of_show_flag_test';
END;
$$;

ROLLBACK;
