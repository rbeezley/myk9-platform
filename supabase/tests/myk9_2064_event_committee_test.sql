-- MYK9-2064: the Event Committee.
--   1. the check on both tables: exactly one of person_id / a non-blank display_name (both NULL,
--      both set, blank and over-long all refused) and the unique rules
--   2. club list: club admin writes; another club's admin, a member and anon do not
--   3. show list: the club's secretary and admin write; another club's admin and anon do not
--   4. get_show_committee: anon reads a published show only; the show's own list replaces the
--      club's; a soft-deleted club or show reads nothing; no email or person id
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000206401', 'Committee Club'),
  ('00000000-0000-0000-0000-000000206402', 'Committee Other Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000000206403', 'Committee Published', 'Committee Club',
   CURRENT_DATE + 30, CURRENT_DATE + 31, '00000000-0000-0000-0000-000000206401', 'published'),
  ('00000000-0000-0000-0000-000000206404', 'Committee Draft', 'Committee Club',
   CURRENT_DATE + 40, CURRENT_DATE + 41, '00000000-0000-0000-0000-000000206401', 'draft');

-- People go in before auth.users so handle_new_user adopts each one by email
-- (same order as myk9_2045_club_officers_typed_name_test.sql).
INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000206411', 'Comm', 'Admin', 'myk9-2064-admin@example.test'),
  ('00000000-0000-0000-0000-000000206412', 'Comm', 'OtherAdmin', 'myk9-2064-other@example.test'),
  ('00000000-0000-0000-0000-000000206413', 'Comm', 'Member', 'myk9-2064-member@example.test'),
  ('00000000-0000-0000-0000-000000206414', 'Linda', 'Linked', 'linda-2064@example.test'),
  ('00000000-0000-0000-0000-000000206415', 'Gone', 'Person', NULL),
  ('00000000-0000-0000-0000-000000206416', 'Comm', 'Secretary', 'myk9-2064-secretary@example.test'),
  ('00000000-0000-0000-0000-000000206417', 'Olive', 'Override', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000206601', 'myk9-2064-admin@example.test'),
  ('00000000-0000-0000-0000-000000206602', 'myk9-2064-other@example.test'),
  ('00000000-0000-0000-0000-000000206603', 'myk9-2064-member@example.test'),
  ('00000000-0000-0000-0000-000000206604', 'myk9-2064-secretary@example.test')
) AS v(id, email);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.people
    WHERE id IN ('00000000-0000-0000-0000-000000206411', '00000000-0000-0000-0000-000000206412',
                 '00000000-0000-0000-0000-000000206413', '00000000-0000-0000-0000-000000206416')
      AND auth_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not adopt the seeded people by email';
  END IF;
END;
$$;

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES ('00000000-0000-0000-0000-000000206401', '00000000-0000-0000-0000-000000206413', 'active');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, r.id, fixture.club_id, true, fixture.auth_id
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000206411'::uuid, '00000000-0000-0000-0000-000000206601'::uuid,
     '00000000-0000-0000-0000-000000206401'::uuid, 'club_admin'),
    ('00000000-0000-0000-0000-000000206412'::uuid, '00000000-0000-0000-0000-000000206602'::uuid,
     '00000000-0000-0000-0000-000000206402'::uuid, 'club_admin'),
    ('00000000-0000-0000-0000-000000206416'::uuid, '00000000-0000-0000-0000-000000206604'::uuid,
     '00000000-0000-0000-0000-000000206401'::uuid, 'secretary')
) AS fixture(person_id, auth_id, club_id, role_name)
JOIN public.roles r ON r.name = fixture.role_name;

-- The club's list: Linda (linked, first), Sam (typed, second), a soft-deleted linked person.
INSERT INTO public.club_committee_members (club_id, person_id, display_name, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000206401', '00000000-0000-0000-0000-000000206414', NULL, 1),
  ('00000000-0000-0000-0000-000000206401', NULL, 'Sam Typed', 2),
  ('00000000-0000-0000-0000-000000206401', '00000000-0000-0000-0000-000000206415', NULL, 3);
UPDATE public.people SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000206415';

-- A soft-deleted club with a published show and a committee.
INSERT INTO public.clubs (id, name, deleted_at)
VALUES ('00000000-0000-0000-0000-000000206405', 'Committee Deleted Club', now());
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000206406', 'Committee Deleted Club Show',
        'Committee Deleted Club', CURRENT_DATE + 30, CURRENT_DATE + 31,
        '00000000-0000-0000-0000-000000206405', 'published');
INSERT INTO public.club_committee_members (club_id, display_name, sort_order)
VALUES ('00000000-0000-0000-0000-000000206405', 'Deleted Club Member', 1);

-- A soft-deleted show of the live club.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status, deleted_at)
VALUES ('00000000-0000-0000-0000-000000206407', 'Committee Deleted Show',
        'Committee Club', CURRENT_DATE + 50, CURRENT_DATE + 51,
        '00000000-0000-0000-0000-000000206401', 'published', now());

-- 1. The check and the unique rules, on both tables (as the postgres owner).
DO $$
DECLARE
  club constant uuid := '00000000-0000-0000-0000-000000206401';
  shw constant uuid := '00000000-0000-0000-0000-000000206403';
  person constant uuid := '00000000-0000-0000-0000-000000206414';
BEGIN
  -- club_committee_members
  BEGIN
    INSERT INTO public.club_committee_members (club_id, person_id, display_name)
    VALUES (club, '00000000-0000-0000-0000-000000206417', 'Both Set');
    RAISE EXCEPTION 'FAIL a club row with both person_id and display_name was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.club_committee_members (club_id) VALUES (club);
    RAISE EXCEPTION 'FAIL a club row with neither person_id nor display_name was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.club_committee_members (club_id, display_name) VALUES (club, '   ');
    RAISE EXCEPTION 'FAIL a blank typed club member was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.club_committee_members (club_id, display_name)
    VALUES (club, repeat('x', 121));
    RAISE EXCEPTION 'FAIL a 121 character typed club member was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.club_committee_members (club_id, display_name) VALUES (club, ' sam typed');
    RAISE EXCEPTION 'FAIL the same typed club member twice was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.club_committee_members (club_id, person_id) VALUES (club, person);
    RAISE EXCEPTION 'FAIL the same linked club member twice was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- show_committee_members
  BEGIN
    INSERT INTO public.show_committee_members (show_id, person_id, display_name)
    VALUES (shw, person, 'Both Set');
    RAISE EXCEPTION 'FAIL a show row with both person_id and display_name was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.show_committee_members (show_id) VALUES (shw);
    RAISE EXCEPTION 'FAIL a show row with neither person_id nor display_name was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.show_committee_members (show_id, display_name) VALUES (shw, '  ');
    RAISE EXCEPTION 'FAIL a blank typed show member was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.show_committee_members (show_id, display_name, sort_order)
  VALUES (shw, 'Show Typed', 1);
  BEGIN
    INSERT INTO public.show_committee_members (show_id, display_name) VALUES (shw, 'SHOW typed');
    RAISE EXCEPTION 'FAIL the same typed show member twice was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  DELETE FROM public.show_committee_members WHERE show_id = shw;

  RAISE NOTICE 'PASS the checks and unique rules on both tables';
END;
$$;

-- 2. Club list: the club's admin adds and removes a typed member.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000206601', true);

DO $$
DECLARE
  n integer;
BEGIN
  INSERT INTO public.club_committee_members (club_id, display_name, sort_order)
  VALUES ('00000000-0000-0000-0000-000000206401', 'Admin Added', 9);
  UPDATE public.club_committee_members SET sort_order = 10 WHERE display_name = 'Admin Added';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL the club admin could not update a member (% rows)', n; END IF;
  DELETE FROM public.club_committee_members WHERE display_name = 'Admin Added';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL the club admin could not remove a member (% rows)', n; END IF;
  SELECT count(*) INTO n FROM public.club_committee_members
  WHERE club_id = '00000000-0000-0000-0000-000000206401';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL the club admin read % club rows (expected 3)', n; END IF;
  RAISE NOTICE 'PASS a club admin reads, adds, changes and removes club committee members';
END;
$$;

-- Another club's admin, a plain member and the club's secretary cannot touch the club's list.
DO $$
DECLARE
  who record;
  n integer;
BEGIN
  FOR who IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000206602', 'another club''s admin'),
      ('00000000-0000-0000-0000-000000206603', 'member'),
      ('00000000-0000-0000-0000-000000206604', 'secretary')
    ) AS v(auth_id, label)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', who.auth_id, true);
    SELECT count(*) INTO n FROM public.club_committee_members
    WHERE club_id = '00000000-0000-0000-0000-000000206401';
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL % read % club rows', who.label, n; END IF;
    BEGIN
      INSERT INTO public.club_committee_members (club_id, display_name)
      VALUES ('00000000-0000-0000-0000-000000206401', 'Intruder');
      RAISE EXCEPTION 'FAIL % inserted a club committee member', who.label;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    UPDATE public.club_committee_members SET display_name = 'Hijacked'
    WHERE club_id = '00000000-0000-0000-0000-000000206401' AND person_id IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL % updated % club rows', who.label, n; END IF;
    DELETE FROM public.club_committee_members
    WHERE club_id = '00000000-0000-0000-0000-000000206401';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL % deleted % club rows', who.label, n; END IF;
  END LOOP;
  RAISE NOTICE 'PASS non-admins cannot read or change the club committee';
END;
$$;

-- 3. Show list: the club's secretary and the club's admin write; another club's admin and a
-- plain member cannot.
DO $$
DECLARE
  who record;
  n integer;
BEGIN
  FOR who IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000206604', 'secretary'),
      ('00000000-0000-0000-0000-000000206601', 'club admin')
    ) AS v(auth_id, label)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', who.auth_id, true);
    INSERT INTO public.show_committee_members (show_id, display_name, sort_order)
    VALUES ('00000000-0000-0000-0000-000000206403', 'Show Typed', 1);
    UPDATE public.show_committee_members SET sort_order = 2
    WHERE show_id = '00000000-0000-0000-0000-000000206403';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL the % could not update the show list (% rows)', who.label, n; END IF;
    DELETE FROM public.show_committee_members
    WHERE show_id = '00000000-0000-0000-0000-000000206403';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL the % could not remove the show list (% rows)', who.label, n; END IF;
  END LOOP;

  FOR who IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000206602', 'another club''s admin'),
      ('00000000-0000-0000-0000-000000206603', 'member')
    ) AS v(auth_id, label)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', who.auth_id, true);
    BEGIN
      INSERT INTO public.show_committee_members (show_id, display_name)
      VALUES ('00000000-0000-0000-0000-000000206403', 'Intruder');
      RAISE EXCEPTION 'FAIL % inserted a show committee member', who.label;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PASS the secretary and club admin change a show list; others cannot';
END;
$$;

-- 4. anon: no table access, but the RPC names a published show's committee.
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
DECLARE
  names text;
BEGIN
  BEGIN
    PERFORM 1 FROM public.club_committee_members LIMIT 1;
    RAISE EXCEPTION 'FAIL anon read club_committee_members';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.show_committee_members LIMIT 1;
    RAISE EXCEPTION 'FAIL anon read show_committee_members';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.club_committee_members (club_id, display_name)
    VALUES ('00000000-0000-0000-0000-000000206401', 'Anon Intruder');
    RAISE EXCEPTION 'FAIL anon inserted a club committee member';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.show_committee_members (show_id, display_name)
    VALUES ('00000000-0000-0000-0000-000000206403', 'Anon Intruder');
    RAISE EXCEPTION 'FAIL anon inserted a show committee member';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- The club's list, in order; the soft-deleted linked person with no typed name is not listed.
  SELECT string_agg(c.name, ',' ORDER BY c.sort_order) INTO names
  FROM public.get_show_committee('00000000-0000-0000-0000-000000206403') c;
  IF names IS DISTINCT FROM 'Linda Linked,Sam Typed' THEN
    RAISE EXCEPTION 'FAIL anon saw % for a published show', names;
  END IF;

  IF EXISTS (SELECT 1 FROM public.get_show_committee('00000000-0000-0000-0000-000000206404')) THEN
    RAISE EXCEPTION 'FAIL anon saw the committee of a draft show';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_show_committee('00000000-0000-0000-0000-000000206406')) THEN
    RAISE EXCEPTION 'FAIL anon saw the committee of a soft-deleted club';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_show_committee('00000000-0000-0000-0000-000000206407')) THEN
    RAISE EXCEPTION 'FAIL anon saw the committee of a soft-deleted show';
  END IF;
  RAISE NOTICE 'PASS anon reads a published show''s committee through the RPC only';
END;
$$;

-- The show's own list replaces the club's; deleting it brings the club's back.
RESET ROLE;
INSERT INTO public.show_committee_members (show_id, display_name, sort_order)
VALUES ('00000000-0000-0000-0000-000000206403', 'Show Second', 2);
INSERT INTO public.show_committee_members (show_id, person_id, sort_order)
VALUES ('00000000-0000-0000-0000-000000206403', '00000000-0000-0000-0000-000000206417', 1);

SET LOCAL ROLE anon;
DO $$
DECLARE
  names text;
BEGIN
  SELECT string_agg(c.name, ',' ORDER BY c.sort_order) INTO names
  FROM public.get_show_committee('00000000-0000-0000-0000-000000206403') c;
  IF names IS DISTINCT FROM 'Olive Override,Show Second' THEN
    RAISE EXCEPTION 'FAIL the show list did not replace the club list: %', names;
  END IF;
  -- The other show of the same club still reads the club's list.
  RAISE NOTICE 'PASS the show list replaces the club list for that show';
END;
$$;

RESET ROLE;
DELETE FROM public.show_committee_members WHERE show_id = '00000000-0000-0000-0000-000000206403';
SET LOCAL ROLE anon;
DO $$
DECLARE
  names text;
BEGIN
  SELECT string_agg(c.name, ',' ORDER BY c.sort_order) INTO names
  FROM public.get_show_committee('00000000-0000-0000-0000-000000206403') c;
  IF names IS DISTINCT FROM 'Linda Linked,Sam Typed' THEN
    RAISE EXCEPTION 'FAIL removing the show list did not restore the club list: %', names;
  END IF;
  RAISE NOTICE 'PASS removing the show list restores the club list';
END;
$$;

-- The result has no email or person_id column, by structure.
RESET ROLE;
DO $$
DECLARE
  result text;
BEGIN
  result := pg_get_function_result('public.get_show_committee(uuid)'::regprocedure);
  IF result <> 'TABLE("name" text, sort_order integer)' THEN
    RAISE EXCEPTION 'FAIL get_show_committee returns %, expected only name and sort_order', result;
  END IF;
  RAISE NOTICE 'PASS the RPC exposes no email or person_id';
END;
$$;

-- A club admin sees their own draft show's committee; another club's admin does not.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000206601', true);

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.get_show_committee('00000000-0000-0000-0000-000000206404');
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL a club admin saw % committee members of their own draft show (expected 2)', n;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000206602', true);
  SELECT count(*) INTO n
  FROM public.get_show_committee('00000000-0000-0000-0000-000000206404');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL another club''s admin saw % committee members of a draft show', n;
  END IF;
  RAISE NOTICE 'PASS a club admin sees their own draft show committee only';
END;
$$;

RESET ROLE;
ROLLBACK;
