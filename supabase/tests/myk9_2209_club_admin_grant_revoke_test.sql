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

-- ---------------------------------------------------------------------------------------------
-- Round 1 additions.
-- ---------------------------------------------------------------------------------------------

-- The unknown address's grant lapses after about a week (squatting guard); an account's never does.
DO $$
DECLARE
  invited record;
BEGIN
  SELECT * INTO invited FROM public.get_club_admins('00000000-0000-0000-0000-000000220901') a
  WHERE a.person_email = 'new.admin@example.test';
  IF invited.expires_at IS NULL
     OR invited.expires_at < now() + interval '6 days 23 hours'
     OR invited.expires_at > now() + interval '7 days 1 hour' THEN
    RAISE EXCEPTION 'FAIL the unclaimed grant should expire in 7 days: %', invited.expires_at;
  END IF;
  RAISE NOTICE 'PASS an unclaimed admin grant expires in 7 days';
END;
$$;

-- Re-adding a revoked account reactivates it, with no expiry, and a double add makes no duplicates.
DO $$
DECLARE
  again record;
  invited_a uuid;
  invited_b uuid;
BEGIN
  SELECT * INTO again FROM public.add_club_admin_by_email(
    '00000000-0000-0000-0000-000000220901', 'bystander@example.test');
  SELECT person_id INTO invited_a FROM public.add_club_admin_by_email(
    '00000000-0000-0000-0000-000000220901', 'new.admin@example.test');
  SELECT person_id INTO invited_b FROM public.add_club_admin_by_email(
    '00000000-0000-0000-0000-000000220901', ' NEW.admin@example.test ');
  IF invited_a IS DISTINCT FROM invited_b THEN
    RAISE EXCEPTION 'FAIL double add by email made two people';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.get_club_admins('00000000-0000-0000-0000-000000220901') a
    WHERE a.person_id = again.person_id AND a.expires_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL the revoked account was not reactivated without an expiry';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220813', true);
DO $$
BEGIN
  IF NOT public.is_club_admin('00000000-0000-0000-0000-000000220901') THEN
    RAISE EXCEPTION 'FAIL is_club_admin stayed false after the re-grant';
  END IF;
END;
$$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = '00000000-0000-0000-0000-000000220913'
        AND ur.club_id = '00000000-0000-0000-0000-000000220901' AND r.name = 'club_admin') <> 1 THEN
    RAISE EXCEPTION 'FAIL re-grant duplicated the user_roles row';
  END IF;
  IF (SELECT count(*) FROM public.people WHERE lower(email) = 'new.admin@example.test') <> 1 THEN
    RAISE EXCEPTION 'FAIL double add duplicated the people row';
  END IF;
  RAISE NOTICE 'PASS re-grant reactivates; double add creates no duplicate';
END;
$$;

-- Step-up: a stale or missing amr is refused with MKAUT; a fresh one passes. All three writers.
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_club constant uuid := '00000000-0000-0000-0000-000000220901';
  v_case record;
  v_state text;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('missing amr', false, NULL::integer),
      ('stale amr', false, 3600),
      ('fresh amr', true, 5)
    ) AS t(label, should_pass, age_seconds)
  LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', '00000000-0000-0000-0000-000000220811', 'role', 'authenticated',
      'amr', CASE WHEN v_case.age_seconds IS NULL THEN NULL ELSE jsonb_build_array(jsonb_build_object(
        'method', 'password',
        'timestamp', floor(extract(epoch FROM now())) - v_case.age_seconds)) END)::text, true);

    FOR v_state IN SELECT unnest(ARRAY['grant', 'add', 'revoke']) LOOP
      BEGIN
        IF v_state = 'grant' THEN
          PERFORM public.grant_club_admin(v_club, '00000000-0000-0000-0000-000000220912');
        ELSIF v_state = 'add' THEN
          PERFORM * FROM public.add_club_admin_by_email(v_club, 'existing.account@example.test');
        ELSE
          PERFORM public.revoke_club_admin(v_club, '00000000-0000-0000-0000-000000220912');
        END IF;
        IF NOT v_case.should_pass THEN
          RAISE EXCEPTION 'FAIL % was allowed with a % token', v_state, v_case.label;
        END IF;
      EXCEPTION WHEN SQLSTATE 'MKAUT' THEN
        IF v_case.should_pass THEN
          RAISE EXCEPTION 'FAIL % was refused with a % token', v_state, v_case.label;
        END IF;
      END;
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'PASS grant, add by email and revoke need a fresh sign-in confirmation';
END;
$$;

-- An expired grant does not count toward the last-admin guard, and neither does the unclaimed
-- invite: with the bystander's grant lapsed, the only admin who counts is 220911.
RESET ROLE;
UPDATE public.user_roles ur SET expires_at = now() - interval '1 hour'
FROM public.roles r
WHERE r.id = ur.role_id AND r.name = 'club_admin'
  AND ur.club_id = '00000000-0000-0000-0000-000000220901'
  AND ur.user_id IN ('00000000-0000-0000-0000-000000220913', '00000000-0000-0000-0000-000000220912');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.revoke_club_admin(
      '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220911');
    RAISE EXCEPTION 'FAIL an expired or unclaimed admin counted toward the last-admin guard';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'A club needs at least one admin. Add another admin first.' THEN
      RAISE;
    END IF;
  END;
  RAISE NOTICE 'PASS expired and unclaimed admins do not count toward the last-admin guard';
END;
$$;

-- A site admin who administers no club can grant and revoke.
RESET ROLE;
INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000000220915', 'Site', 'Admin', 'site.admin@example.test');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) VALUES ('00000000-0000-0000-0000-000000220815', '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'site.admin@example.test', '', now(), now(), now(),
          '{}', '{}', false, false, false);
INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000220915', r.id, true, '00000000-0000-0000-0000-000000220815'
FROM public.roles r WHERE r.name = 'site_admin';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220815', true);
DO $$
BEGIN
  PERFORM public.grant_club_admin(
    '00000000-0000-0000-0000-000000220902', '00000000-0000-0000-0000-000000220912');
  PERFORM public.revoke_club_admin(
    '00000000-0000-0000-0000-000000220902', '00000000-0000-0000-0000-000000220912');
  RAISE NOTICE 'PASS a site admin can grant and revoke';
END;
$$;

-- The claim path end to end: the invited person signs up with the address.
RESET ROLE;
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) VALUES ('00000000-0000-0000-0000-000000220816', '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'new.admin@example.test', '', now(), now(), now(),
          '{}', '{}', false, false, false);
DO $$
DECLARE
  v_person uuid;
  v_role record;
BEGIN
  SELECT id INTO v_person FROM public.people
  WHERE auth_user_id = '00000000-0000-0000-0000-000000220816';
  IF v_person IS NULL THEN
    RAISE EXCEPTION 'FAIL sign-up did not adopt the invited people row';
  END IF;
  SELECT ur.auth_user_id, ur.expires_at INTO v_role
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_person AND r.name = 'club_admin'
    AND ur.club_id = '00000000-0000-0000-0000-000000220901' AND ur.is_active;
  IF v_role.auth_user_id IS DISTINCT FROM '00000000-0000-0000-0000-000000220816'::uuid THEN
    RAISE EXCEPTION 'FAIL the role did not follow the new auth id: %', v_role.auth_user_id;
  END IF;
  IF v_role.expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the expiry was not cleared on sign-up: %', v_role.expires_at;
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220816', true);
DO $$
BEGIN
  IF NOT public.is_club_admin('00000000-0000-0000-0000-000000220901') THEN
    RAISE EXCEPTION 'FAIL the invited admin is not a club admin after signing up';
  END IF;
  RAISE NOTICE 'PASS sign-up claims the invited grant: auth ids follow, expiry cleared, is_club_admin true';
END;
$$;

ROLLBACK;
