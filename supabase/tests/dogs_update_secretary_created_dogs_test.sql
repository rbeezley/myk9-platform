-- Behavioral contract for 20261012224900_dogs_update_secretary_created_dogs.sql and
-- 20261014191300_myk9_1158_dog_owner_change_guard.sql (last section).
--
-- A secretary may edit a dog she brought in (created_by her, while she still holds a staff
-- role) or one created from a show she manages (created_from_show_id), on top of the
-- existing owner / co-owner / entered-in-her-show / site-admin arms. An exhibitor's dog
-- with no tie to her shows stays read-only to her even though dogs_select lets her read it
-- (MYK9-854). can_edit_dog(), the UI's question, must agree with the policy cell for cell.
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

-- 1 secretary of club one, 2 exhibitor (owns every dog), 3 deactivated secretary of club one
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id) VALUES
  ('00000000-0000-0000-0000-00000d0e0b01', 'DogEdit', 'Secretary', 'dogedit-sec@example.test', NULL),
  ('00000000-0000-0000-0000-00000d0e0b02', 'DogEdit', 'Owner', 'dogedit-owner@example.test', NULL),
  ('00000000-0000-0000-0000-00000d0e0b03', 'DogEdit', 'ExSecretary', 'dogedit-exsec@example.test', NULL);

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
INSERT INTO public.dogs (id, call_name, breed, owner_id, created_by, created_from_show_id) VALUES
  ('00000000-0000-0000-0000-00000d0e0d01', 'DogEdit Created By Sec', 'Poodle', '00000000-0000-0000-0000-00000d0e0b02', '00000000-0000-0000-0000-00000d0e0101', NULL),
  ('00000000-0000-0000-0000-00000d0e0d02', 'DogEdit From Show One',  'Poodle', '00000000-0000-0000-0000-00000d0e0b02', '00000000-0000-0000-0000-00000d0e0102', '00000000-0000-0000-0000-00000d0e0a01'),
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
      (by_ex_sec,      false, 'a dog another (now deactivated) secretary created')
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
  -- The owner keeps every one of her dogs (positive control for the owner arm).
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', owner_user, 'role', 'authenticated')::text, true);
  UPDATE public.dogs SET date_of_birth = DATE '2020-01-03'
  WHERE id IN (created_by_sec, from_show_one, untied, from_show_two, by_ex_sec);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 5 THEN
    RAISE EXCEPTION 'FAIL the owner updated % of her 5 dogs', n;
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

  RAISE NOTICE 'PASS dogs_update: a secretary edits the dogs she created or that came from her '
    'shows, not an exhibitor''s untied dog or another club''s; a deactivated secretary loses '
    'hers; the owner keeps all; can_edit_dog() agrees; anon is refused both functions';
END;
$$;

-- ---------------------------------------------------------------------------
-- MYK9-1158: once the dog's owner or co-owner has an account, only that owner/co-owner (or
-- a site admin) can change who owns it, even when another arm lets the caller edit the
-- dog's details. A mail-in dog (no account on either side) can still have its owner
-- corrected by the staff who may edit it, including handing it to an account holder.
-- can_change_dog_owner(), the owner picker's question, agrees cell for cell.
-- ---------------------------------------------------------------------------
-- Clear the claims the blocks above left set (transaction-local), so the fixture insert
-- keeps the supplied created_by as a seed/service write does.
SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id) VALUES
  ('00000000-0000-0000-0000-00000d0e0b04', 'DogEdit', 'MailIn', 'dogedit-mailin@example.test', NULL),
  ('00000000-0000-0000-0000-00000d0e0b05', 'DogEdit', 'MailInTwo', 'dogedit-mailin2@example.test', NULL);

INSERT INTO public.dogs (id, call_name, breed, owner_id, created_by, created_from_show_id) VALUES
  ('00000000-0000-0000-0000-00000d0e0d06', 'DogEdit Mail-in', 'Poodle',
   '00000000-0000-0000-0000-00000d0e0b04', '00000000-0000-0000-0000-00000d0e0101', NULL);

DO $$
DECLARE
  secretary  uuid := '00000000-0000-0000-0000-00000d0e0101';
  owner_user uuid := '00000000-0000-0000-0000-00000d0e0102';
  created_by_sec uuid := '00000000-0000-0000-0000-00000d0e0d01';  -- account holder's dog
  untied         uuid := '00000000-0000-0000-0000-00000d0e0d03';
  mail_in_dog    uuid := '00000000-0000-0000-0000-00000d0e0d06';
  account_owner  uuid := '00000000-0000-0000-0000-00000d0e0b02';
  mail_in_owner  uuid := '00000000-0000-0000-0000-00000d0e0b04';
  mail_in_two    uuid := '00000000-0000-0000-0000-00000d0e0b05';
  n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', secretary, 'role', 'authenticated')::text, true);

  -- Positive control: the creator arm still lets her correct the account holder's dog.
  UPDATE public.dogs SET date_of_birth = DATE '2020-02-01' WHERE id = created_by_sec;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL control: the creating secretary could not edit the dog (% rows); '
      'the ownership refusals below would prove nothing', n;
  END IF;

  IF public.can_change_dog_owner(created_by_sec) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL can_change_dog_owner() offers the secretary an account holder''s dog';
  END IF;

  BEGIN
    UPDATE public.dogs SET owner_id = mail_in_two WHERE id = created_by_sec;
    RAISE EXCEPTION 'FAIL a non-owner re-owned an account holder''s dog';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.dogs SET co_owner_id = mail_in_two WHERE id = created_by_sec;
    RAISE EXCEPTION 'FAIL a non-owner set the co-owner of an account holder''s dog';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- A dog she may not edit at all is not offered either.
  IF public.can_change_dog_owner(untied) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL can_change_dog_owner() offers a dog the secretary cannot edit';
  END IF;

  -- Mail-in dog: she may correct its owner, then hand it to an exhibitor with an
  -- account (Codex #2989: WITH CHECK reads the new row, and the creator arm admits it).
  IF public.can_change_dog_owner(mail_in_dog) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL can_change_dog_owner() refuses the secretary her own mail-in dog';
  END IF;
  UPDATE public.dogs SET owner_id = mail_in_two WHERE id = mail_in_dog;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL the secretary could not correct a mail-in dog''s owner (% rows)', n;
  END IF;
  UPDATE public.dogs SET owner_id = account_owner WHERE id = mail_in_dog;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL the secretary could not hand a mail-in dog to an account holder (% rows)', n;
  END IF;

  -- From then on the dog is the account holder's: details yes, ownership no.
  UPDATE public.dogs SET date_of_birth = DATE '2020-02-02' WHERE id = mail_in_dog;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL the secretary lost detail edits after the handoff (% rows)', n;
  END IF;
  BEGIN
    UPDATE public.dogs SET owner_id = mail_in_owner WHERE id = mail_in_dog;
    RAISE EXCEPTION 'FAIL the secretary took the dog back from the account holder';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Not on the server is unanswered, not "no".
  IF public.can_change_dog_owner('00000000-0000-0000-0000-00000d0e0dff') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL can_change_dog_owner() of an unknown dog id is not NULL';
  END IF;

  -- The account holder may change her own dog's ownership.
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', owner_user, 'role', 'authenticated')::text, true);
  IF public.can_change_dog_owner(created_by_sec) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL can_change_dog_owner() refuses the owner her own dog';
  END IF;
  UPDATE public.dogs SET co_owner_id = mail_in_two WHERE id = created_by_sec;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL the owner could not set her own dog''s co-owner (% rows)', n;
  END IF;

  RESET ROLE;

  SELECT count(*) INTO n FROM public.dogs
  WHERE (id = created_by_sec AND owner_id = account_owner AND co_owner_id = mail_in_two)
     OR (id = mail_in_dog AND owner_id = account_owner);
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL ownership changed after a refusal (% of 2 rows as expected)', n;
  END IF;

  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.can_change_dog_owner(untied);
    RAISE EXCEPTION 'FAIL anon executed can_change_dog_owner()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'PASS MYK9-1158: a non-owner who may edit an account holder''s dog cannot re-own '
    'it; a mail-in dog''s owner can be corrected and handed to an account holder, after which '
    'it is frozen; the owner changes her own; can_change_dog_owner() agrees; anon refused';
END;
$$;

ROLLBACK;
