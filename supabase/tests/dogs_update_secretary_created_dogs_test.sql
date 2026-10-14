-- Behavioral contract for 20261012224900_dogs_update_secretary_created_dogs.sql and
-- 20261014191300_myk9_1158_dog_edit_owner_account_cutoff.sql.
--
-- A secretary may edit a dog she brought in (created_by her, while she still holds a staff
-- role) or one created from a show she manages (created_from_show_id), on top of the
-- existing owner / co-owner / entered-in-her-show / site-admin arms. An exhibitor's dog
-- with no tie to her shows stays read-only to her even though dogs_select lets her read it
-- (MYK9-854). can_edit_dog(), the UI's question, must agree with the policy cell for cell.
--
-- MYK9-1158: the created_by and created_from_show_id arms apply only while neither the
-- owner nor the co-owner has a sign-in account (as person_edit_allowed does for people),
-- and a non-owner cannot re-own an account holder's dog even through an arm that still
-- reaches it (a manager of a show it is entered in). A mail-in owner (no account) can
-- still be corrected by the staff who may edit the dog.
--
-- Every denial is paired with a positive control on the same caller, and the untied dog's
-- denial is paired with proof she can READ it, so a policy that denied everything (or a
-- fixture she could not see) fails this test rather than passing it.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('secretary', 'dogs_update fixture', true), ('exhibitor', 'dogs_update fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name) VALUES
  ('00000000-0000-0000-0000-00000d0e0c01', 'Dog Edit Club One'),
  ('00000000-0000-0000-0000-00000d0e0c02', 'Dog Edit Club Two');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-00000d0e0a01', 'Dog Edit Show One', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-00000d0e0c01', 'published'),
  ('00000000-0000-0000-0000-00000d0e0a02', 'Dog Edit Show Two', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-00000d0e0c02', 'published');

-- 1 secretary of club one, 2 exhibitor with an account, 3 deactivated secretary of club one,
-- 4 and 5 mail-in owners with NO account (never linked below)
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id) VALUES
  ('00000000-0000-0000-0000-00000d0e0b01', 'DogEdit', 'Secretary', 'dogedit-sec@example.test', NULL),
  ('00000000-0000-0000-0000-00000d0e0b02', 'DogEdit', 'Owner', 'dogedit-owner@example.test', NULL),
  ('00000000-0000-0000-0000-00000d0e0b03', 'DogEdit', 'ExSecretary', 'dogedit-exsec@example.test', NULL),
  ('00000000-0000-0000-0000-00000d0e0b04', 'DogEdit', 'MailIn', 'dogedit-mailin@example.test', NULL),
  ('00000000-0000-0000-0000-00000d0e0b05', 'DogEdit', 'MailInTwo', 'dogedit-mailin2@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-00000d0e0101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dogedit-sec@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-00000d0e0102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dogedit-owner@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-00000d0e0103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dogedit-exsec@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people AS person
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-00000d0e0b01'::uuid, '00000000-0000-0000-0000-00000d0e0101'::uuid),
  ('00000000-0000-0000-0000-00000d0e0b02'::uuid, '00000000-0000-0000-0000-00000d0e0102'::uuid),
  ('00000000-0000-0000-0000-00000d0e0b03'::uuid, '00000000-0000-0000-0000-00000d0e0103'::uuid)
) AS fixture(person_id, auth_id)
WHERE person.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, roles.id, fixture.club_id, fixture.is_active, fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-00000d0e0b01'::uuid, 'secretary', '00000000-0000-0000-0000-00000d0e0c01'::uuid, true,  '00000000-0000-0000-0000-00000d0e0101'::uuid),
  ('00000000-0000-0000-0000-00000d0e0b02'::uuid, 'exhibitor', NULL::uuid,                                    true,  '00000000-0000-0000-0000-00000d0e0102'::uuid),
  ('00000000-0000-0000-0000-00000d0e0b03'::uuid, 'secretary', '00000000-0000-0000-0000-00000d0e0c01'::uuid, false, '00000000-0000-0000-0000-00000d0e0103'::uuid)
) AS fixture(person_id, role_name, club_id, is_active, auth_id)
JOIN public.roles ON roles.name = fixture.role_name;

-- Inserted as the migration owner (no auth.uid()), so guard_creation_attribution keeps the
-- supplied created_by / created_from_show_id, as it does for seed and service writes.
-- d01/d02 belong to a mail-in owner (no account), so the creator and origin-show arms
-- still reach them; d06..d08 are the same ties on an account holder's dog (MYK9-1158).
INSERT INTO public.dogs (id, call_name, breed, owner_id, co_owner_id, created_by, created_from_show_id) VALUES
  ('00000000-0000-0000-0000-00000d0e0d01', 'DogEdit Created By Sec', 'Poodle', '00000000-0000-0000-0000-00000d0e0b04', NULL, '00000000-0000-0000-0000-00000d0e0101', NULL),
  ('00000000-0000-0000-0000-00000d0e0d02', 'DogEdit From Show One',  'Poodle', '00000000-0000-0000-0000-00000d0e0b04', NULL, '00000000-0000-0000-0000-00000d0e0102', '00000000-0000-0000-0000-00000d0e0a01'),
  ('00000000-0000-0000-0000-00000d0e0d06', 'DogEdit Sec Made, Owner Signed Up', 'Poodle', '00000000-0000-0000-0000-00000d0e0b02', NULL, '00000000-0000-0000-0000-00000d0e0101', NULL),
  ('00000000-0000-0000-0000-00000d0e0d07', 'DogEdit Show One, Owner Signed Up', 'Poodle', '00000000-0000-0000-0000-00000d0e0b02', NULL, '00000000-0000-0000-0000-00000d0e0102', '00000000-0000-0000-0000-00000d0e0a01'),
  ('00000000-0000-0000-0000-00000d0e0d08', 'DogEdit Sec Made, Co-owner Signed Up', 'Poodle', '00000000-0000-0000-0000-00000d0e0b04', '00000000-0000-0000-0000-00000d0e0b02', '00000000-0000-0000-0000-00000d0e0101', NULL);

INSERT INTO public.dogs (id, call_name, breed, owner_id, created_by, created_from_show_id) VALUES
  ('00000000-0000-0000-0000-00000d0e0d03', 'DogEdit Untied',         'Poodle', '00000000-0000-0000-0000-00000d0e0b02', '00000000-0000-0000-0000-00000d0e0102', NULL),
  ('00000000-0000-0000-0000-00000d0e0d04', 'DogEdit From Show Two',  'Poodle', '00000000-0000-0000-0000-00000d0e0b02', '00000000-0000-0000-0000-00000d0e0102', '00000000-0000-0000-0000-00000d0e0a02'),
  ('00000000-0000-0000-0000-00000d0e0d05', 'DogEdit By ExSec',       'Poodle', '00000000-0000-0000-0000-00000d0e0b02', '00000000-0000-0000-0000-00000d0e0103', NULL);

DO $$
DECLARE
  secretary  uuid := '00000000-0000-0000-0000-00000d0e0101';
  owner_user uuid := '00000000-0000-0000-0000-00000d0e0102';
  ex_sec     uuid := '00000000-0000-0000-0000-00000d0e0103';
  created_by_sec uuid := '00000000-0000-0000-0000-00000d0e0d01';
  from_show_one  uuid := '00000000-0000-0000-0000-00000d0e0d02';
  untied         uuid := '00000000-0000-0000-0000-00000d0e0d03';
  from_show_two  uuid := '00000000-0000-0000-0000-00000d0e0d04';
  by_ex_sec      uuid := '00000000-0000-0000-0000-00000d0e0d05';
  sec_made_claimed   uuid := '00000000-0000-0000-0000-00000d0e0d06';
  show_one_claimed   uuid := '00000000-0000-0000-0000-00000d0e0d07';
  co_owner_claimed   uuid := '00000000-0000-0000-0000-00000d0e0d08';
  expectation record;
  n integer;
BEGIN
  SET LOCAL ROLE authenticated;

  ------------------------------------------------------------------
  -- The secretary: one row per dog, UPDATE result and can_edit_dog() must both match.
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', secretary, 'role', 'authenticated')::text, true);

  -- She can READ the untied dog (MYK9-854), so its UPDATE denial below is the policy's,
  -- not a fixture she cannot see.
  SELECT count(*) INTO n FROM public.dogs WHERE id = untied;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL secretary could not read the untied dog (% rows); the denial below would prove nothing', n;
  END IF;

  FOR expectation IN
    SELECT * FROM (VALUES
      (created_by_sec, true,  'a dog she created, while she is still a secretary'),
      (from_show_one,  true,  'a dog created from a show of her club'),
      (untied,         false, 'an exhibitor''s dog with no tie to her shows'),
      (from_show_two,  false, 'a dog created from another club''s show'),
      (by_ex_sec,      false, 'a dog another (now deactivated) secretary created'),
      (sec_made_claimed, false, 'a dog she created whose owner has since signed up (MYK9-1158)'),
      (show_one_claimed, false, 'a dog from her show whose owner has since signed up (MYK9-1158)'),
      (co_owner_claimed, false, 'a dog she created whose co-owner has an account (MYK9-1158)')
    ) AS v(dog_id, allowed, label)
  LOOP
    UPDATE public.dogs SET date_of_birth = DATE '2020-01-01' WHERE id = expectation.dog_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF (n = 1) IS DISTINCT FROM expectation.allowed THEN
      RAISE EXCEPTION 'FAIL secretary UPDATE on % changed % row(s), expected %',
        expectation.label, n, CASE WHEN expectation.allowed THEN 1 ELSE 0 END;
    END IF;
    IF public.can_edit_dog(expectation.dog_id) IS DISTINCT FROM expectation.allowed THEN
      RAISE EXCEPTION 'FAIL can_edit_dog() disagrees with dogs_update for the secretary on %', expectation.label;
    END IF;
  END LOOP;

  -- created_from_show_id is frozen on UPDATE (guard_creation_attribution), and USING reads
  -- the stored row, so stamping one of her shows onto the untied dog does not open it.
  UPDATE public.dogs SET created_from_show_id = '00000000-0000-0000-0000-00000d0e0a01' WHERE id = untied;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL secretary claimed the untied dog by writing created_from_show_id (% row)', n;
  END IF;

  -- Not on the server (e.g. created on a device, not uploaded yet) is unanswered, not "no".
  IF public.can_edit_dog('00000000-0000-0000-0000-00000d0e0dff') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL can_edit_dog() of an unknown dog id is not NULL';
  END IF;

  ------------------------------------------------------------------
  -- The deactivated secretary loses even the dog she created: access follows the role.
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ex_sec, 'role', 'authenticated')::text, true);
  UPDATE public.dogs SET date_of_birth = DATE '2020-01-02' WHERE id = by_ex_sec;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 OR public.can_edit_dog(by_ex_sec) THEN
    RAISE EXCEPTION 'FAIL a deactivated secretary could still edit the dog she created (% row)', n;
  END IF;

  ------------------------------------------------------------------
  -- The account holder keeps every one of her dogs, as owner or co-owner (positive
  -- control for the owner arms, and for the dogs the secretary just lost).
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', owner_user, 'role', 'authenticated')::text, true);
  UPDATE public.dogs SET date_of_birth = DATE '2020-01-03'
  WHERE id IN (untied, from_show_two, by_ex_sec, sec_made_claimed, show_one_claimed, co_owner_claimed);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN
    RAISE EXCEPTION 'FAIL the account holder updated % of her 6 dogs', n;
  END IF;
  IF NOT public.can_edit_dog(untied) THEN
    RAISE EXCEPTION 'FAIL can_edit_dog() says the owner may not edit her own dog';
  END IF;

  RESET ROLE;

  ------------------------------------------------------------------
  -- anon may call neither function.
  ------------------------------------------------------------------
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.can_edit_dog(untied);
    RAISE EXCEPTION 'FAIL anon executed can_edit_dog()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.dog_edit_allowed(untied, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL anon executed dog_edit_allowed()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'PASS MYK9-1158: the creator and origin-show arms stop once the owner or co-owner '
    'has an account; the account holder keeps those dogs';
  RAISE NOTICE 'PASS dogs_update: a secretary edits the dogs she created or that came from her '
    'shows, not an exhibitor''s untied dog or another club''s; a deactivated secretary loses '
    'hers; the owner keeps all; can_edit_dog() agrees; anon is refused both functions';
END;
$$;

-- ---------------------------------------------------------------------------
-- MYK9-1158: ownership is frozen against non-owners once an owner has an account.
-- The untied dog (account holder's) is entered in show one, so the club-one secretary
-- reaches it through "manages a show it is entered in", the one arm the cut-off keeps.
-- ---------------------------------------------------------------------------
INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-00000d0e0e01', '00000000-0000-0000-0000-00000d0e0a01',
        'Dog Edit Trial', current_date);
INSERT INTO public.classes (id, trial_id, name, status)
VALUES ('00000000-0000-0000-0000-00000d0e0e02', '00000000-0000-0000-0000-00000d0e0e01',
        'Container Novice', 'upcoming');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES ('00000000-0000-0000-0000-00000d0e0d03', 'AKC (American Kennel Club)', 'DOGEDIT1158', true);
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband,
  is_in_ring, is_scored, entry_fee, payment_status, payment_method
)
VALUES ('00000000-0000-0000-0000-00000d0e0e03', '00000000-0000-0000-0000-00000d0e0d03',
        '00000000-0000-0000-0000-00000d0e0e02', '00000000-0000-0000-0000-00000d0e0a01',
        '00000000-0000-0000-0000-00000d0e0e01', '00000000-0000-0000-0000-00000d0e0b02',
        'confirmed', '1158', false, false, 30.00, 'paid', 'cash');

DO $$
DECLARE
  secretary  uuid := '00000000-0000-0000-0000-00000d0e0101';
  owner_user uuid := '00000000-0000-0000-0000-00000d0e0102';
  untied     uuid := '00000000-0000-0000-0000-00000d0e0d03';
  mail_in_dog uuid := '00000000-0000-0000-0000-00000d0e0d01';
  mail_in_owner_two uuid := '00000000-0000-0000-0000-00000d0e0b05';
  account_owner uuid := '00000000-0000-0000-0000-00000d0e0b02';
  n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', secretary, 'role', 'authenticated')::text, true);

  -- Positive control: the entered-in-her-show arm lets her correct the dog's details.
  UPDATE public.dogs SET date_of_birth = DATE '2020-02-01' WHERE id = untied;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL control: the show''s secretary could not edit an entered dog (% rows); '
      'the ownership refusals below would prove nothing', n;
  END IF;

  BEGIN
    UPDATE public.dogs SET owner_id = mail_in_owner_two WHERE id = untied;
    RAISE EXCEPTION 'FAIL a non-owner re-owned an account holder''s dog';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.dogs SET co_owner_id = '00000000-0000-0000-0000-00000d0e0b01' WHERE id = untied;
    RAISE EXCEPTION 'FAIL a non-owner made herself co-owner of an account holder''s dog';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- A mail-in dog (no account on either side) can still have its owner corrected by the
  -- staff who may edit it.
  UPDATE public.dogs SET owner_id = mail_in_owner_two WHERE id = mail_in_dog;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL the secretary could not correct the owner of her mail-in dog (% rows)', n;
  END IF;

  -- The account holder may change her own dog's ownership.
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', owner_user, 'role', 'authenticated')::text, true);
  UPDATE public.dogs SET co_owner_id = mail_in_owner_two WHERE id = untied;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL the owner could not set her own dog''s co-owner (% rows)', n;
  END IF;

  RESET ROLE;

  SELECT count(*) INTO n FROM public.dogs
  WHERE id = untied AND owner_id = account_owner AND co_owner_id = mail_in_owner_two;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL the account holder''s dog changed owner after the refusals';
  END IF;

  RAISE NOTICE 'PASS MYK9-1158: a non-owner cannot re-own an account holder''s dog even through '
    'an arm that still reaches it; a mail-in owner can be corrected; the owner can change her own';
END;
$$;

ROLLBACK;
