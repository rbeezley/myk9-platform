-- Behavioral contract for 20261012224900_dogs_update_secretary_created_dogs.sql.
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

ROLLBACK;
