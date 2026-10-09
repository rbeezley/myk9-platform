-- Behavioral test for 20261008183700_myk9_1010_owner_address_required.sql (MYK9-1010).
--
-- `submit_show_entries` must refuse an AKC entry whose dog's owner has no
-- complete address (street, city, state, ZIP; each non-blank after trim), with
-- SQLSTATE 23514, HINT 'owner_address_required' and an exhibitor-facing
-- message naming the dog and the missing parts. AKC Scent Work Regulations
-- Ch.3 §36 item 8 prints the owner's address in the marked catalog.
--
-- Why each case earns its place:
--   1. A SECRETARY's mail-in entry (official, 'organizer') into an AKC class for
--      a dog whose owner has a whitespace street and no ZIP -> refused. Officials
--      are not exempt, and a whitespace-only value counts as missing (a fix
--      testing `IS NULL` alone would let it through). The message names both
--      parts in address order.
--   2. The EXHIBITOR's own self-service entry, same dog, AKC -> refused the same
--      way: the rule is not an officials-only check.
--   3. The same owner's dog into a UKC show's class -> created. The rule is
--      per trial registry; a fix that refused every entry would fail here.
--   4. A dog whose owner has a complete address, AKC -> created.
--   5. A dog with NO owner on file, AKC (secretary) -> refused with the
--      no-owner message: there is nobody to print.
--   6. ONE submission of two AKC lines, the complete-address dog first and
--      the addressless one second -> the call fails and the first line's
--      entry is NOT left behind (the refusal sits inside the entry loop, after
--      an earlier line's INSERT, so this proves the whole call rolls back).
--   Every refused submission also leaves no entry_submissions row, so a retry
--   after the address is added is a fresh submission, not a cached refusal.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/myk9_1010_owner_address_required_test.sql
-- All fixtures roll back.

BEGIN;

-- MYK9-979: fixture shows take online entries (transaction-local default).
ALTER TABLE public.shows ALTER COLUMN online_entries_enabled SET DEFAULT true;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001010010', 'MYK9-1010 Test Club');

-- One registry per show (MYK9-490), so AKC and UKC are separate shows.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments, pre_entry_fee)
VALUES
  ('00000000-0000-0000-0000-000001010100', 'MYK9-1010 AKC Show', 'AKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000001010010', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true, true, 30),
  ('00000000-0000-0000-0000-000001010110', 'MYK9-1010 UKC Show', 'UKC',
   current_date + 5, current_date + 6, '00000000-0000-0000-0000-000001010010', 'published',
   (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true, true, 30);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES
  ('00000000-0000-0000-0000-000001010200', '00000000-0000-0000-0000-000001010100',
   'MYK9-1010 AKC Trial', current_date + 5, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000001010210', '00000000-0000-0000-0000-000001010110',
   'MYK9-1010 UKC Trial', current_date + 5, 'UKC', 'Nosework');

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000001010301', '00000000-0000-0000-0000-000001010200',
   'Container Novice A', 'Container', 'Novice', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000001010302', '00000000-0000-0000-0000-000001010200',
   'Interior Novice A', 'Interior', 'Novice', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000001010311', '00000000-0000-0000-0000-000001010210',
   'Novice B Container', 'Container', 'Novice B', 'upcoming', 'manual', 30);

-- 001 exhibitor with an incomplete address, 002 secretary, 003 complete address.
INSERT INTO public.people (id, first_name, last_name, email,
                           street_address, city, state, zip_code)
VALUES
  ('00000000-0000-0000-0000-000001010001', 'MYK9-1010', 'NoAddress',
   'myk9-1010-exhibitor@example.test', '   ', 'Springfield', 'IL', NULL),
  ('00000000-0000-0000-0000-000001010002', 'MYK9-1010', 'Secretary',
   'myk9-1010-secretary@example.test', NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000001010003', 'MYK9-1010', 'Complete',
   'myk9-1010-complete@example.test', '12 Elm St', 'Springfield', 'IL', '62701');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001010101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1010-exhibitor@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001010102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1010-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000001010001'::uuid, '00000000-0000-0000-0000-000001010101'::uuid),
  ('00000000-0000-0000-0000-000001010002'::uuid, '00000000-0000-0000-0000-000001010102'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

-- The signup trigger adopts a pre-seeded person by email; restate the address
-- in case it rewrote the row, so case 1's premise is the fixture's, not luck.
UPDATE public.people
SET street_address = '   ', city = 'Springfield', state = 'IL', zip_code = NULL
WHERE id = '00000000-0000-0000-0000-000001010001';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001010002', roles.id,
       '00000000-0000-0000-0000-000001010010', true,
       '00000000-0000-0000-0000-000001010102'
FROM public.roles WHERE roles.name = 'secretary';

-- `handle_new_user` creates the exhibitor profile (see
-- submit_entries_started_class_test.sql); without it the exhibitor case would
-- fail on "registration does not belong to the caller" for the wrong reason.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.exhibitor_profiles
    WHERE person_id = '00000000-0000-0000-0000-000001010001'
  ) THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not create the exhibitor profile';
  END IF;
END;
$$;

-- `breed` and `call_name` are NOT NULL without defaults on public.dogs.
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES
  ('00000000-0000-0000-0000-000001010401', 'MYK9-1010 Rex', 'Rex', 'Beagle', 'active',
   '00000000-0000-0000-0000-000001010001'),
  ('00000000-0000-0000-0000-000001010402', 'MYK9-1010 Mia', 'Mia', 'Beagle', 'active',
   '00000000-0000-0000-0000-000001010003'),
  ('00000000-0000-0000-0000-000001010403', 'MYK9-1010 Orphan', 'Orphan', 'Beagle', 'active',
   NULL);

-- Each dog holds AKC and UKC numbers, so the registration trigger
-- (20260828210000) never refuses a line for a reason unrelated to the address.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, r.org, r.org || '1010' || right(d.id::text, 3), r.org = 'AKC'
FROM public.dogs d
CROSS JOIN (VALUES ('AKC'), ('UKC')) AS r(org)
WHERE d.id::text LIKE '00000000-0000-0000-0000-000001010%';

INSERT INTO public.enrollments (id, show_id, handler_id)
VALUES
  ('00000000-0000-0000-0000-000001010500', '00000000-0000-0000-0000-000001010100',
   '00000000-0000-0000-0000-000001010001'),
  ('00000000-0000-0000-0000-000001010510', '00000000-0000-0000-0000-000001010110',
   '00000000-0000-0000-0000-000001010001');

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  exhibitor_auth CONSTANT uuid := '00000000-0000-0000-0000-000001010101';
  secretary_auth CONSTANT uuid := '00000000-0000-0000-0000-000001010102';
  akc_show       CONSTANT uuid := '00000000-0000-0000-0000-000001010100';
  ukc_show       CONSTANT uuid := '00000000-0000-0000-0000-000001010110';
  akc_reg        CONSTANT uuid := '00000000-0000-0000-0000-000001010500';
  ukc_reg        CONSTANT uuid := '00000000-0000-0000-0000-000001010510';
  akc_container  CONSTANT uuid := '00000000-0000-0000-0000-000001010301';
  akc_interior   CONSTANT uuid := '00000000-0000-0000-0000-000001010302';
  ukc_container  CONSTANT uuid := '00000000-0000-0000-0000-000001010311';
  rex            CONSTANT uuid := '00000000-0000-0000-0000-000001010401';
  mia            CONSTANT uuid := '00000000-0000-0000-0000-000001010402';
  orphan         CONSTANT uuid := '00000000-0000-0000-0000-000001010403';
  missing_msg    CONSTANT text :=
    'Add the owner''s street address and ZIP or postal code to enter Rex in an AKC trial. AKC prints the owner''s address in the marked catalog.';
  result         jsonb;
  caught_state   text;
  caught_message text;
  caught_hint    text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', secretary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_auth, 'role', 'authenticated')::text, true);

  ----------------------------------------------------------------------------
  -- 1. Secretary mail-in, AKC, incomplete address -> refused.
  ----------------------------------------------------------------------------
  caught_state := NULL;
  BEGIN
    PERFORM public.submit_show_entries(
      akc_show, akc_reg,
      jsonb_build_array(jsonb_build_object(
        'dog_id', rex, 'class_id', akc_container,
        'handler_name', 'MYK9-1010 NoAddress', 'client_fee_cents', 3000)),
      '00000000-0000-0000-0000-000001010901'::uuid, 'check');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS caught_state = RETURNED_SQLSTATE,
                            caught_message = MESSAGE_TEXT,
                            caught_hint = PG_EXCEPTION_HINT;
  END;
  IF caught_state IS NULL THEN
    RAISE EXCEPTION 'FAIL case 1: secretary AKC entry for an owner with no address was accepted';
  END IF;
  IF caught_state <> '23514' OR caught_hint IS DISTINCT FROM 'owner_address_required' THEN
    RAISE EXCEPTION 'FAIL case 1: refusal was % / hint % (expected 23514 / owner_address_required): %',
      caught_state, caught_hint, caught_message;
  END IF;
  IF caught_message <> missing_msg THEN
    RAISE EXCEPTION 'FAIL case 1: message is not the exhibitor-facing copy: %', caught_message;
  END IF;

  ----------------------------------------------------------------------------
  -- 4. Complete address, AKC -> created.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    akc_show, akc_reg,
    jsonb_build_array(jsonb_build_object(
      'dog_id', mia, 'class_id', akc_container,
      'handler_name', 'MYK9-1010 Complete', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000001010904'::uuid, 'check');
  IF result->'outcomes'->0->>'outcome' IS DISTINCT FROM 'created' THEN
    RAISE EXCEPTION 'FAIL case 4: complete-address AKC entry was not created: %', result;
  END IF;

  ----------------------------------------------------------------------------
  -- 5. No owner on file, AKC -> refused with the no-owner message.
  ----------------------------------------------------------------------------
  caught_state := NULL;
  BEGIN
    PERFORM public.submit_show_entries(
      akc_show, akc_reg,
      jsonb_build_array(jsonb_build_object(
        'dog_id', orphan, 'class_id', akc_container,
        'handler_name', 'MYK9-1010 Handler', 'client_fee_cents', 3000)),
      '00000000-0000-0000-0000-000001010905'::uuid, 'check');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS caught_state = RETURNED_SQLSTATE,
                            caught_message = MESSAGE_TEXT,
                            caught_hint = PG_EXCEPTION_HINT;
  END;
  IF caught_state IS DISTINCT FROM '23514'
     OR caught_hint IS DISTINCT FROM 'owner_address_required'
     OR caught_message <> 'Orphan has no owner on file. AKC prints the owner''s name and address in the marked catalog, so add the owner before entering an AKC trial.' THEN
    RAISE EXCEPTION 'FAIL case 5: ownerless AKC entry: state %, hint %, message %',
      caught_state, caught_hint, caught_message;
  END IF;

  ----------------------------------------------------------------------------
  -- 6. One submission: a good AKC line, then a refused one -> nothing left.
  ----------------------------------------------------------------------------
  caught_state := NULL;
  BEGIN
    PERFORM public.submit_show_entries(
      akc_show, akc_reg,
      jsonb_build_array(
        jsonb_build_object('dog_id', mia, 'class_id', akc_interior,
                           'handler_name', 'MYK9-1010 Complete', 'client_fee_cents', 3000),
        jsonb_build_object('dog_id', rex, 'class_id', akc_interior,
                           'handler_name', 'MYK9-1010 NoAddress', 'client_fee_cents', 3000)),
      '00000000-0000-0000-0000-000001010906'::uuid, 'check');
  EXCEPTION WHEN OTHERS THEN
    caught_state := SQLSTATE;
  END;
  IF caught_state IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION 'FAIL case 6: mixed submission was not refused (state %)', caught_state;
  END IF;

  ----------------------------------------------------------------------------
  -- 2 and 3: the exhibitor, entering their own dog.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', exhibitor_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', exhibitor_auth, 'role', 'authenticated')::text, true);

  caught_state := NULL;
  BEGIN
    PERFORM public.submit_show_entries(
      akc_show, akc_reg,
      jsonb_build_array(jsonb_build_object(
        'dog_id', rex, 'class_id', akc_container,
        'handler_name', 'MYK9-1010 NoAddress', 'client_fee_cents', 3000)),
      '00000000-0000-0000-0000-000001010902'::uuid, 'check');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS caught_state = RETURNED_SQLSTATE,
                            caught_message = MESSAGE_TEXT;
  END;
  IF caught_state IS DISTINCT FROM '23514' OR caught_message <> missing_msg THEN
    RAISE EXCEPTION 'FAIL case 2: exhibitor AKC entry with no address: state %, message %',
      caught_state, caught_message;
  END IF;

  result := public.submit_show_entries(
    ukc_show, ukc_reg,
    jsonb_build_array(jsonb_build_object(
      'dog_id', rex, 'class_id', ukc_container,
      'handler_name', 'MYK9-1010 NoAddress', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000001010903'::uuid, 'check');
  IF result->'outcomes'->0->>'outcome' IS DISTINCT FROM 'created' THEN
    RAISE EXCEPTION 'FAIL case 3: UKC entry for the same owner was not created: %', result;
  END IF;
END;
$$;

-- Read the rows back as the fixture owner: `entries` is column-allowlisted for
-- API roles, and the assertion is about the stored rows.
RESET ROLE;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.entries e
   WHERE e.class_id = '00000000-0000-0000-0000-000001010302';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL case 6: % entries left in the Interior class by a refused submission', n;
  END IF;

  SELECT count(*) INTO n FROM public.entries e
   WHERE e.dog_id = '00000000-0000-0000-0000-000001010401'
     AND e.class_id = '00000000-0000-0000-0000-000001010301';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL cases 1-2: % AKC entries exist for the addressless owner''s dog', n;
  END IF;

  SELECT count(*) INTO n FROM public.entry_submissions s
   WHERE s.id IN ('00000000-0000-0000-0000-000001010901', '00000000-0000-0000-0000-000001010902',
                  '00000000-0000-0000-0000-000001010905', '00000000-0000-0000-0000-000001010906');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: % refused submissions were recorded as replayable results', n;
  END IF;

  RAISE NOTICE 'PASS myk9_1010_owner_address_required_test';
END;
$$;

ROLLBACK;
