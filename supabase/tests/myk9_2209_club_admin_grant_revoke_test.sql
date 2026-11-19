-- MYK9-2209: a club admin adds and removes club admins. Everything rolls back.
--
-- Proves: an admin grants (by person and by email); a non-admin and another club's admin are
-- refused; anon cannot execute any of the four functions; revoke deactivates and stamps
-- deactivated_at; the last signed-in admin cannot be removed (an unclaimed invite does not
-- count); is_club_admin follows the grant and the revoke.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000220901', 'Admin Grant Test Club'),
  ('00000000-0000-0000-0000-000000220902', 'Other Admin Grant Test Club');

-- Unclaimed people first, then their sign-ins: handle_new_user adopts each row by email, which
-- is also how an invited admin is claimed on sign-up (the sign-in email invariant refuses a
-- people row that carries an auth id without a matching auth.users email).
INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000220911', 'Grant', 'Admin', 'grant.admin@example.test'),
  ('00000000-0000-0000-0000-000000220912', 'Existing', 'Account', 'existing.account@example.test'),
  ('00000000-0000-0000-0000-000000220913', 'Plain', 'Bystander', 'bystander@example.test'),
  ('00000000-0000-0000-0000-000000220914', 'Other', 'ClubAdmin', 'other.admin@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000220811', 'grant.admin@example.test'),
  ('00000000-0000-0000-0000-000000220812', 'existing.account@example.test'),
  ('00000000-0000-0000-0000-000000220813', 'bystander@example.test'),
  ('00000000-0000-0000-0000-000000220814', 'other.admin@example.test')
) AS v(id, email);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000220911', r.id, '00000000-0000-0000-0000-000000220901', true,
       '00000000-0000-0000-0000-000000220811'
FROM public.roles r WHERE r.name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000220914', r.id, '00000000-0000-0000-0000-000000220902', true,
       '00000000-0000-0000-0000-000000220814'
FROM public.roles r WHERE r.name = 'club_admin';

-- anon and authenticated privileges, read from the catalog.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_club_admins(uuid)',
    'public.grant_club_admin(uuid, uuid)',
    'public.add_club_admin_by_email(uuid, text)',
    'public.revoke_club_admin(uuid, uuid)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL anon can execute %', fn;
    END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL authenticated cannot execute %', fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS anon cannot execute, authenticated can';
END;
$$;

SET LOCAL ROLE authenticated;

-- A non-admin and another club's admin are refused by all four.
DO $$
DECLARE
  who uuid;
BEGIN
  FOREACH who IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000220813'::uuid,
    '00000000-0000-0000-0000-000000220814'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', who::text, true);

    BEGIN
      PERFORM public.grant_club_admin(
        '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220912');
      RAISE EXCEPTION 'FAIL % granted an admin on a club they do not administer', who;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;

    BEGIN
      PERFORM * FROM public.add_club_admin_by_email(
        '00000000-0000-0000-0000-000000220901', 'sneaky@example.test');
      RAISE EXCEPTION 'FAIL % added an admin by email on a club they do not administer', who;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;

    BEGIN
      PERFORM public.revoke_club_admin(
        '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220911');
      RAISE EXCEPTION 'FAIL % removed an admin from a club they do not administer', who;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;

    BEGIN
      PERFORM * FROM public.get_club_admins('00000000-0000-0000-0000-000000220901');
      RAISE EXCEPTION 'FAIL % listed the admins of a club they do not administer', who;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PASS a non-admin and another club''s admin are refused';
END;
$$;

-- The admin grants an existing person: that person becomes a club admin at once.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220812', true);
DO $$
BEGIN
  IF public.is_club_admin('00000000-0000-0000-0000-000000220901') THEN
    RAISE EXCEPTION 'FAIL the existing account was a club admin before being granted';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
SELECT public.grant_club_admin(
  '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220912');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220812', true);
DO $$
BEGIN
  IF NOT public.is_club_admin('00000000-0000-0000-0000-000000220901') THEN
    RAISE EXCEPTION 'FAIL is_club_admin stayed false after the grant';
  END IF;
  RAISE NOTICE 'PASS an admin grants, and is_club_admin turns true';
END;
$$;

-- By email: an existing account (mixed-case input) and an unknown address.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
DO $$
DECLARE
  existing record;
  fresh record;
  fresh_role_active boolean;
  fresh_auth uuid;
BEGIN
  SELECT * INTO existing FROM public.add_club_admin_by_email(
    '00000000-0000-0000-0000-000000220901', '  Bystander@Example.Test ');
  IF existing.person_id IS DISTINCT FROM '00000000-0000-0000-0000-000000220913'::uuid
     OR existing.has_account IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL existing account by email: %', existing;
  END IF;

  SELECT * INTO fresh FROM public.add_club_admin_by_email(
    '00000000-0000-0000-0000-000000220901', 'New.Admin@Example.Test');
  IF fresh.person_id IS NULL OR fresh.has_account IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL unknown email should return an unclaimed person: %', fresh;
  END IF;

  SELECT p.auth_user_id INTO fresh_auth FROM public.people p WHERE p.id = fresh.person_id;
  IF fresh_auth IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the new person row should be unclaimed';
  END IF;

  -- user_roles is not readable cross-user, so read the grant back through the admin list.
  SELECT TRUE INTO fresh_role_active
  FROM public.get_club_admins('00000000-0000-0000-0000-000000220901') a
  WHERE a.person_id = fresh.person_id AND a.has_account = false;
  IF fresh_role_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL the unclaimed person did not get the club_admin grant';
  END IF;

  BEGIN
    PERFORM * FROM public.add_club_admin_by_email(
      '00000000-0000-0000-0000-000000220901', 'not an email');
    RAISE EXCEPTION 'FAIL a malformed email was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  RAISE NOTICE 'PASS add by email: existing account at once, unknown address as an unclaimed grant';
END;
$$;

-- Revoke deactivates (and stamps), and is_club_admin turns false.
SELECT public.revoke_club_admin(
  '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220912');

RESET ROLE;
DO $$
DECLARE
  row_active boolean;
  row_stamp timestamptz;
BEGIN
  SELECT ur.is_active, ur.deactivated_at INTO row_active, row_stamp
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = '00000000-0000-0000-0000-000000220912'
    AND ur.club_id = '00000000-0000-0000-0000-000000220901'
    AND r.name = 'club_admin';
  IF row_active IS DISTINCT FROM false OR row_stamp IS NULL THEN
    RAISE EXCEPTION 'FAIL revoke did not deactivate and stamp: active=%, stamp=%', row_active, row_stamp;
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220812', true);
DO $$
BEGIN
  IF public.is_club_admin('00000000-0000-0000-0000-000000220901') THEN
    RAISE EXCEPTION 'FAIL is_club_admin stayed true after the revoke';
  END IF;
  RAISE NOTICE 'PASS revoke deactivates and is_club_admin turns false';
END;
$$;

-- Last admin: with the bystander removed, the only signed-in admin is 220911; the unclaimed
-- invite from above does not count as someone who can run the club.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
SELECT public.revoke_club_admin(
  '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220913');

DO $$
BEGIN
  BEGIN
    PERFORM public.revoke_club_admin(
      '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220911');
    RAISE EXCEPTION 'FAIL the last signed-in admin was removed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'A club needs at least one admin. Add another admin first.' THEN
      RAISE;
    END IF;
  END;

  IF NOT public.is_club_admin('00000000-0000-0000-0000-000000220901') THEN
    RAISE EXCEPTION 'FAIL the last admin lost access despite the refusal';
  END IF;
  RAISE NOTICE 'PASS the last admin cannot be removed';
END;
$$;

ROLLBACK;
