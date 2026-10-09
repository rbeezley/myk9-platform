-- Behavioral test for 20261008213900_myk9_1010_fill_entry_owner_address.sql
-- (MYK9-1010, Codex P1).
--
-- A show's secretary keying an owner's FIRST entry must be able to fill the
-- owner's missing address parts, or the AKC owner-address refusal deadlocks
-- the entry. public.fill_entry_owner_address fills ONLY blank parts, for a
-- caller who can manage the show, for the owner of a live dog.
--
-- Why each case earns its place:
--   0. Positive control on the premise: the same secretary is refused by
--      update_person_details (the owner has no entry in any show she manages,
--      so can_manage_show_person is false). Without this, case 1 could pass on
--      a fixture where the old path already worked.
--   1. That secretary fills the owner's blank street/state/ZIP; the stored
--      city is KEPT although she sent a different one; inputs are trimmed.
--   2. A second call with all-new values changes nothing (never overwrites).
--   3. Blank inputs write nothing and clear nothing.
--   4. An authenticated user who manages no show is refused 42501, and the
--      row is unchanged.
--   5. A dog with no owner, and a soft-deleted dog, are refused 22023.
--   6. A secretary of ANOTHER club is refused for this show (42501).
--   7. anon cannot execute the function at all (42501 insufficient_privilege),
--      and no column other than the four address parts changed.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/myk9_1010_fill_entry_owner_address_test.sql
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000001010a10', 'MYK9-1010 Fill Club'),
  ('00000000-0000-0000-0000-000001010a11', 'MYK9-1010 Other Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, pre_entry_fee)
VALUES (
  '00000000-0000-0000-0000-000001010a20', 'MYK9-1010 Fill Show', 'AKC',
  current_date + 5, current_date + 6, '00000000-0000-0000-0000-000001010a10', 'published',
  (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, 30
);

-- a01 the owner (blank street, stored city, no state, empty ZIP),
-- a02 the club's secretary, a03 a user with no role, a04 another club's secretary.
INSERT INTO public.people (id, first_name, last_name, email, phone,
                           street_address, city, state, zip_code)
VALUES
  ('00000000-0000-0000-0000-000001010a01', 'MYK9-1010', 'MailInOwner',
   'myk9-1010-mailin-owner@example.test', '555-0101', '   ', 'Keepcity', NULL, ''),
  ('00000000-0000-0000-0000-000001010a02', 'MYK9-1010', 'FillSecretary',
   'myk9-1010-fill-secretary@example.test', NULL, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000001010a03', 'MYK9-1010', 'NoRole',
   'myk9-1010-no-role@example.test', NULL, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000001010a04', 'MYK9-1010', 'OtherSecretary',
   'myk9-1010-other-secretary@example.test', NULL, NULL, NULL, NULL, NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001010b02', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1010-fill-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001010b03', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1010-no-role@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001010b04', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1010-other-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000001010a02'::uuid, '00000000-0000-0000-0000-000001010b02'::uuid),
  ('00000000-0000-0000-0000-000001010a03'::uuid, '00000000-0000-0000-0000-000001010b03'::uuid),
  ('00000000-0000-0000-0000-000001010a04'::uuid, '00000000-0000-0000-0000-000001010b04'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

-- The signup trigger adopts pre-seeded people by email; restate the owner's
-- address so the premise is the fixture's.
UPDATE public.people
SET street_address = '   ', city = 'Keepcity', state = NULL, zip_code = ''
WHERE id = '00000000-0000-0000-0000-000001010a01';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, roles.id, fixture.club_id, true, fixture.auth_id
FROM public.roles
CROSS JOIN (VALUES
  ('00000000-0000-0000-0000-000001010a02'::uuid, '00000000-0000-0000-0000-000001010a10'::uuid,
   '00000000-0000-0000-0000-000001010b02'::uuid),
  ('00000000-0000-0000-0000-000001010a04'::uuid, '00000000-0000-0000-0000-000001010a11'::uuid,
   '00000000-0000-0000-0000-000001010b04'::uuid)
) AS fixture(person_id, club_id, auth_id)
WHERE roles.name = 'secretary';

-- `breed` and `call_name` are NOT NULL without defaults on public.dogs. The
-- owner has NO entry anywhere, which is the point of this test.
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id, deleted_at)
VALUES
  ('00000000-0000-0000-0000-000001010c01', 'MYK9-1010 Mailin', 'Mailin', 'Beagle', 'active',
   '00000000-0000-0000-0000-000001010a01', NULL),
  ('00000000-0000-0000-0000-000001010c02', 'MYK9-1010 Ownerless', 'Ownerless', 'Beagle', 'active',
   NULL, NULL),
  ('00000000-0000-0000-0000-000001010c03', 'MYK9-1010 Removed', 'Removed', 'Beagle', 'active',
   '00000000-0000-0000-0000-000001010a01', now());

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  secretary_auth CONSTANT uuid := '00000000-0000-0000-0000-000001010b02';
  no_role_auth   CONSTANT uuid := '00000000-0000-0000-0000-000001010b03';
  other_auth     CONSTANT uuid := '00000000-0000-0000-0000-000001010b04';
  show_id        CONSTANT uuid := '00000000-0000-0000-0000-000001010a20';
  owner_id       CONSTANT uuid := '00000000-0000-0000-0000-000001010a01';
  dog_id         CONSTANT uuid := '00000000-0000-0000-0000-000001010c01';
  got            record;
  caught         text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', secretary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_auth, 'role', 'authenticated')::text, true);

  -- 0. Premise: the full person editor refuses this secretary.
  caught := NULL;
  BEGIN
    PERFORM public.update_person_details(
      owner_id, jsonb_build_object('street_address', '1 Old Path'), '{}'::jsonb, false);
  EXCEPTION WHEN OTHERS THEN
    caught := SQLSTATE;
  END;
  IF caught IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FIXTURE update_person_details was not refused (state %): the deadlock premise does not hold', caught;
  END IF;

  -- 1. Fill the blanks; the stored city is kept; inputs are trimmed.
  SELECT * INTO got FROM public.fill_entry_owner_address(
    show_id, dog_id, '  12 Elm St ', 'Overwrite City', ' IL ', '62701');
  IF got.street_address IS DISTINCT FROM '12 Elm St' OR got.city IS DISTINCT FROM 'Keepcity'
     OR got.state IS DISTINCT FROM 'IL' OR got.zip_code IS DISTINCT FROM '62701' THEN
    RAISE EXCEPTION 'FAIL case 1: got %', got;
  END IF;

  -- 2. A second call never overwrites.
  SELECT * INTO got FROM public.fill_entry_owner_address(
    show_id, dog_id, '9 New Rd', 'Newtown', 'TX', '75001');
  IF got.street_address IS DISTINCT FROM '12 Elm St' OR got.city IS DISTINCT FROM 'Keepcity'
     OR got.state IS DISTINCT FROM 'IL' OR got.zip_code IS DISTINCT FROM '62701' THEN
    RAISE EXCEPTION 'FAIL case 2: a stored part was overwritten: %', got;
  END IF;

  -- 3. Blank inputs clear nothing.
  SELECT * INTO got FROM public.fill_entry_owner_address(show_id, dog_id, '', NULL, '  ', '');
  IF got.street_address IS DISTINCT FROM '12 Elm St' OR got.zip_code IS DISTINCT FROM '62701' THEN
    RAISE EXCEPTION 'FAIL case 3: a blank input cleared a part: %', got;
  END IF;

  -- 5. No owner, and a soft-deleted dog.
  caught := NULL;
  BEGIN
    PERFORM public.fill_entry_owner_address(
      show_id, '00000000-0000-0000-0000-000001010c02', '1 A', 'B', 'C', 'D');
  EXCEPTION WHEN OTHERS THEN caught := SQLSTATE;
  END;
  IF caught IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'FAIL case 5: ownerless dog not refused 22023 (state %)', caught;
  END IF;
  caught := NULL;
  BEGIN
    PERFORM public.fill_entry_owner_address(
      show_id, '00000000-0000-0000-0000-000001010c03', '1 A', 'B', 'C', 'D');
  EXCEPTION WHEN OTHERS THEN caught := SQLSTATE;
  END;
  IF caught IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'FAIL case 5: deleted dog not refused 22023 (state %)', caught;
  END IF;

  -- 4. A user who manages no show.
  PERFORM set_config('request.jwt.claim.sub', no_role_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', no_role_auth, 'role', 'authenticated')::text, true);
  caught := NULL;
  BEGIN
    PERFORM public.fill_entry_owner_address(show_id, dog_id, '1 A', 'B', 'C', 'D');
  EXCEPTION WHEN OTHERS THEN caught := SQLSTATE;
  END;
  IF caught IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL case 4: non-manager not refused 42501 (state %)', caught;
  END IF;

  -- 6. Another club's secretary.
  PERFORM set_config('request.jwt.claim.sub', other_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', other_auth, 'role', 'authenticated')::text, true);
  caught := NULL;
  BEGIN
    PERFORM public.fill_entry_owner_address(show_id, dog_id, '1 A', 'B', 'C', 'D');
  EXCEPTION WHEN OTHERS THEN caught := SQLSTATE;
  END;
  IF caught IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL case 6: other club''s secretary not refused 42501 (state %)', caught;
  END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE anon;

DO $$
DECLARE
  caught text;
BEGIN
  BEGIN
    PERFORM public.fill_entry_owner_address(
      '00000000-0000-0000-0000-000001010a20', '00000000-0000-0000-0000-000001010c01',
      '1 A', 'B', 'C', 'D');
  EXCEPTION WHEN OTHERS THEN caught := SQLSTATE;
  END;
  IF caught IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL case 7: anon could execute fill_entry_owner_address (state %)', caught;
  END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  p record;
BEGIN
  SELECT * INTO p FROM public.people WHERE id = '00000000-0000-0000-0000-000001010a01';
  IF p.street_address IS DISTINCT FROM '12 Elm St' OR p.city IS DISTINCT FROM 'Keepcity'
     OR p.state IS DISTINCT FROM 'IL' OR p.zip_code IS DISTINCT FROM '62701' THEN
    RAISE EXCEPTION 'FAIL: stored address is %/%/%/%', p.street_address, p.city, p.state, p.zip_code;
  END IF;
  IF p.first_name IS DISTINCT FROM 'MYK9-1010' OR p.last_name IS DISTINCT FROM 'MailInOwner'
     OR p.email IS DISTINCT FROM 'myk9-1010-mailin-owner@example.test'
     OR p.phone IS DISTINCT FROM '555-0101' OR p.auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL case 7: a column other than the address changed: %', to_jsonb(p);
  END IF;

  RAISE NOTICE 'PASS myk9_1010_fill_entry_owner_address_test';
END;
$$;

ROLLBACK;
