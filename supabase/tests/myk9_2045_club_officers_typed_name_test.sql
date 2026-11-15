-- MYK9-2045: the Officers list accepts a typed name with no account.
--   1. the check: exactly one of person_id / a non-blank display_name
--   2. a typed name is unique per club and position, case-insensitively
--   3. writes: club admin yes; another club's admin, a member and anon no
--   4. get_show_club_officers: anon sees a published show's officers, not a draft's
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000204501', 'Typed Officers Club'),
  ('00000000-0000-0000-0000-000000204502', 'Typed Officers Other Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000000204503', 'Typed Officers Published', 'Typed Officers Club',
   CURRENT_DATE + 30, CURRENT_DATE + 31, '00000000-0000-0000-0000-000000204501', 'published'),
  ('00000000-0000-0000-0000-000000204504', 'Typed Officers Draft', 'Typed Officers Club',
   CURRENT_DATE + 40, CURRENT_DATE + 41, '00000000-0000-0000-0000-000000204501', 'draft');

-- People go in before auth.users so handle_new_user adopts each one by email
-- (same order as club_members_own_row_test.sql); auth_user_id is never set by hand.
INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000204511', 'Typed', 'Admin', 'myk9-2045-admin@example.test'),
  ('00000000-0000-0000-0000-000000204512', 'Typed', 'OtherAdmin', 'myk9-2045-other@example.test'),
  ('00000000-0000-0000-0000-000000204513', 'Typed', 'Member', 'myk9-2045-member@example.test'),
  ('00000000-0000-0000-0000-000000204514', 'Linda', 'Linked', NULL),
  ('00000000-0000-0000-0000-000000204515', 'Gone', 'Person', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000204601', 'myk9-2045-admin@example.test'),
  ('00000000-0000-0000-0000-000000204602', 'myk9-2045-other@example.test'),
  ('00000000-0000-0000-0000-000000204603', 'myk9-2045-member@example.test')
) AS v(id, email);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.people
    WHERE id IN ('00000000-0000-0000-0000-000000204511', '00000000-0000-0000-0000-000000204512',
                 '00000000-0000-0000-0000-000000204513')
      AND auth_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not adopt the seeded people by email';
  END IF;
END;
$$;

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES ('00000000-0000-0000-0000-000000204501', '00000000-0000-0000-0000-000000204513', 'active');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, r.id, fixture.club_id, true, fixture.auth_id
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000204511'::uuid, '00000000-0000-0000-0000-000000204601'::uuid,
     '00000000-0000-0000-0000-000000204501'::uuid),
    ('00000000-0000-0000-0000-000000204512'::uuid, '00000000-0000-0000-0000-000000204602'::uuid,
     '00000000-0000-0000-0000-000000204502'::uuid)
) AS fixture(person_id, auth_id, club_id)
JOIN public.roles r ON r.name = 'club_admin';

INSERT INTO public.club_officers (club_id, person_id, position)
VALUES ('00000000-0000-0000-0000-000000204501', '00000000-0000-0000-0000-000000204514', 'president');

-- A club that is soft-deleted, with a published show and an officer.
INSERT INTO public.clubs (id, name, deleted_at)
VALUES ('00000000-0000-0000-0000-000000204505', 'Typed Officers Deleted Club', now());
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000204506', 'Typed Officers Deleted Club Show',
        'Typed Officers Deleted Club', CURRENT_DATE + 30, CURRENT_DATE + 31,
        '00000000-0000-0000-0000-000000204505', 'published');
INSERT INTO public.club_officers (club_id, display_name, position)
VALUES ('00000000-0000-0000-0000-000000204505', 'Deleted Club Officer', 'president');

-- A soft-deleted show of the live club.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status, deleted_at)
VALUES ('00000000-0000-0000-0000-000000204507', 'Typed Officers Deleted Show',
        'Typed Officers Club', CURRENT_DATE + 50, CURRENT_DATE + 51,
        '00000000-0000-0000-0000-000000204501', 'published', now());

-- A linked person who is soft-deleted, with no typed name: nothing to print.
INSERT INTO public.club_officers (club_id, person_id, position)
VALUES ('00000000-0000-0000-0000-000000204501', '00000000-0000-0000-0000-000000204515', 'treasurer');
UPDATE public.people SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000204515';

-- 1. The check and 2. the unique index (as the postgres owner).
DO $$
DECLARE
  club constant uuid := '00000000-0000-0000-0000-000000204501';
  person constant uuid := '00000000-0000-0000-0000-000000204514';
BEGIN
  INSERT INTO public.club_officers (club_id, display_name, position)
  VALUES (club, '  Sam Typed  ', 'secretary');

  BEGIN
    INSERT INTO public.club_officers (club_id, person_id, display_name, position)
    VALUES (club, person, 'Both Set', 'treasurer');
    RAISE EXCEPTION 'FAIL a row with both person_id and display_name was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.club_officers (club_id, position) VALUES (club, 'treasurer');
    RAISE EXCEPTION 'FAIL a row with neither person_id nor display_name was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.club_officers (club_id, display_name, position)
    VALUES (club, '   ', 'treasurer');
    RAISE EXCEPTION 'FAIL a blank typed name was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.club_officers (club_id, display_name, position)
    VALUES (club, 'sam typed', 'secretary');
    RAISE EXCEPTION 'FAIL the same typed name twice in one position was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Same typed name in another position, and a linked person in the same position: both fine.
  INSERT INTO public.club_officers (club_id, display_name, position)
  VALUES (club, 'Sam Typed', 'board_member');

  RAISE NOTICE 'PASS the check and the typed-name unique index';
END;
$$;

-- 3. Writes: the club's admin may add and remove a typed officer.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000204601', true);

DO $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.club_officers (club_id, display_name, position)
  VALUES ('00000000-0000-0000-0000-000000204501', 'Admin Added', 'vice_president');
  DELETE FROM public.club_officers WHERE display_name = 'Admin Added';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL the club admin could not remove a typed officer (% rows)', n;
  END IF;
  RAISE NOTICE 'PASS a club admin adds and removes a typed officer';
END;
$$;

-- Another club's admin and a plain member cannot write or change.
DO $$
DECLARE
  who record;
  n integer;
BEGIN
  FOR who IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000204602', 'another club''s admin'),
      ('00000000-0000-0000-0000-000000204603', 'member')
    ) AS v(auth_id, label)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', who.auth_id, true);
    BEGIN
      INSERT INTO public.club_officers (club_id, display_name, position)
      VALUES ('00000000-0000-0000-0000-000000204501', 'Intruder', 'treasurer');
      RAISE EXCEPTION 'FAIL % inserted an officer', who.label;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    UPDATE public.club_officers SET display_name = 'Hijacked'
    WHERE club_id = '00000000-0000-0000-0000-000000204501' AND person_id IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL % updated % officers', who.label, n; END IF;
    DELETE FROM public.club_officers
    WHERE club_id = '00000000-0000-0000-0000-000000204501';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL % deleted % officers', who.label, n; END IF;
  END LOOP;
  RAISE NOTICE 'PASS non-admins cannot add, change or remove officers';
END;
$$;

-- anon: no table access, but the RPC names a published show's officers.
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
DECLARE
  names text;
BEGIN
  BEGIN
    PERFORM 1 FROM public.club_officers LIMIT 1;
    RAISE EXCEPTION 'FAIL anon read club_officers';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT string_agg(o.position || '=' || o.name, ',' ORDER BY o.position, o.name) INTO names
  FROM public.get_show_club_officers('00000000-0000-0000-0000-000000204503') o;
  IF names IS DISTINCT FROM 'board_member=Sam Typed,president=Linda Linked,secretary=Sam Typed' THEN
    RAISE EXCEPTION 'FAIL anon saw % for a published show', names;
  END IF;

  IF EXISTS (SELECT 1 FROM public.get_show_club_officers('00000000-0000-0000-0000-000000204504')) THEN
    RAISE EXCEPTION 'FAIL anon saw officers of a draft show';
  END IF;

  IF EXISTS (SELECT 1 FROM public.get_show_club_officers('00000000-0000-0000-0000-000000204506')) THEN
    RAISE EXCEPTION 'FAIL anon saw officers of a soft-deleted club';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_show_club_officers('00000000-0000-0000-0000-000000204507')) THEN
    RAISE EXCEPTION 'FAIL anon saw officers of a soft-deleted show';
  END IF;
  IF names LIKE '%treasurer%' THEN
    RAISE EXCEPTION 'FAIL a soft-deleted linked person with no typed name was listed';
  END IF;

  -- anon may not write the table at all.
  BEGIN
    INSERT INTO public.club_officers (club_id, display_name, position)
    VALUES ('00000000-0000-0000-0000-000000204501', 'Anon Intruder', 'treasurer');
    RAISE EXCEPTION 'FAIL anon inserted an officer';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.club_officers SET display_name = 'Hijacked' WHERE person_id IS NULL;
    RAISE EXCEPTION 'FAIL anon updated an officer';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.club_officers;
    RAISE EXCEPTION 'FAIL anon deleted officers';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RAISE NOTICE 'PASS anon reads a published show''s officers through the RPC only';
END;
$$;

-- The result has no email or person_id column, by structure.
RESET ROLE;
DO $$
DECLARE
  result text;
BEGIN
  result := pg_get_function_result('public.get_show_club_officers(uuid)'::regprocedure);
  IF result <> 'TABLE("position" text, name text)' THEN
    RAISE EXCEPTION 'FAIL get_show_club_officers returns %, expected only position and name', result;
  END IF;
  RAISE NOTICE 'PASS the RPC exposes no email or person_id';
END;
$$;

-- A club admin sees their own draft show's officers; another club's admin does not.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000204601', true);

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.get_show_club_officers('00000000-0000-0000-0000-000000204504');
  IF n <> 3 THEN
    RAISE EXCEPTION 'FAIL a club admin saw % officers of their own draft show (expected 3)', n;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000204602', true);
  SELECT count(*) INTO n
  FROM public.get_show_club_officers('00000000-0000-0000-0000-000000204504');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL another club''s admin saw % officers of a draft show', n;
  END IF;
  RAISE NOTICE 'PASS a club admin sees their own draft show officers only';
END;
$$;

RESET ROLE;
ROLLBACK;
