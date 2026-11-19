-- MYK9-2209: a club admin adds an existing account as a club admin, and removes one.
-- Everything rolls back.
--
-- Proves: an admin grants (by person and by email); an address with no account, an account that
-- never signed in, a deleted-free unclaimed person and a suspended account are NOT granted; a
-- non-admin and another club's admin are refused; anon cannot execute any of the functions;
-- revoke deactivates (every assignment, show-pinned too) and stamps deactivated_at; the last
-- admin who can sign in cannot be removed (a suspended co-admin does not count); is_club_admin
-- follows each step; grant, add and revoke need a fresh sign-in confirmation.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000220901', 'Admin Grant Test Club'),
  ('00000000-0000-0000-0000-000000220902', 'Other Admin Grant Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000220951', 'Admin Grant Show', 'AKC',
        current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000220901', 'published');

-- Unclaimed people first, then their sign-ins: handle_new_user adopts each row by email (the
-- sign-in email invariant refuses a people row that carries an auth id without a matching
-- auth.users email). 917 never gets a sign-in; 916 gets one that has never been used.
INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000220911', 'Grant', 'Admin', 'grant.admin@example.test'),
  ('00000000-0000-0000-0000-000000220912', 'Existing', 'Account', 'existing.account@example.test'),
  ('00000000-0000-0000-0000-000000220913', 'Plain', 'Bystander', 'bystander@example.test'),
  ('00000000-0000-0000-0000-000000220914', 'Other', 'ClubAdmin', 'other.admin@example.test'),
  ('00000000-0000-0000-0000-000000220915', 'Site', 'Admin', 'site.admin@example.test'),
  ('00000000-0000-0000-0000-000000220916', 'Never', 'SignedIn', 'never.signed.in@example.test'),
  ('00000000-0000-0000-0000-000000220917', 'Un', 'Claimed', 'unclaimed@example.test'),
  ('00000000-0000-0000-0000-000000220918', 'Suspended', 'CoAdmin', 'suspended@example.test'),
  ('00000000-0000-0000-0000-000000220919', 'Show', 'Pinned', 'show.pinned@example.test'),
  ('00000000-0000-0000-0000-000000220920', 'Banned', 'CoAdmin', 'banned@example.test'),
  ('00000000-0000-0000-0000-000000220921', 'Expired', 'CoAdmin', 'expired@example.test'),
  ('00000000-0000-0000-0000-000000220922', 'Inactive', 'Admin', 'inactive@example.test'),
  ('00000000-0000-0000-0000-000000220923', 'Deleted', 'Admin', 'deleted@example.test');

UPDATE public.people SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000220923';

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous, banned_until
)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, '', now(), CASE WHEN v.signed_in THEN now() END, now(), now(), '{}', '{}',
       false, false, false, CASE WHEN v.email = 'banned@example.test' THEN now() + interval '1 day' END
FROM (VALUES
  ('00000000-0000-0000-0000-000000220811', 'grant.admin@example.test', true),
  ('00000000-0000-0000-0000-000000220812', 'existing.account@example.test', true),
  ('00000000-0000-0000-0000-000000220813', 'bystander@example.test', true),
  ('00000000-0000-0000-0000-000000220814', 'other.admin@example.test', true),
  ('00000000-0000-0000-0000-000000220815', 'site.admin@example.test', true),
  ('00000000-0000-0000-0000-000000220816', 'never.signed.in@example.test', false),
  ('00000000-0000-0000-0000-000000220818', 'suspended@example.test', true),
  ('00000000-0000-0000-0000-000000220819', 'show.pinned@example.test', true),
  ('00000000-0000-0000-0000-000000220820', 'banned@example.test', true),
  ('00000000-0000-0000-0000-000000220821', 'expired@example.test', true)
) AS v(id, email, signed_in);

UPDATE public.people SET status = 'suspended' WHERE id = '00000000-0000-0000-0000-000000220918';

-- Club A: 911 (club-wide), 918 (club-wide, suspended), 920 (club-wide, banned), 919 (pinned to a
-- show only), 921 (club-wide but expired), 922 (inactive), 923 (deleted person). Club B: 914.
INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, expires_at, auth_user_id)
SELECT v.person::uuid, r.id, v.club::uuid, v.show::uuid, v.active, v.expires::timestamptz, v.auth::uuid
FROM public.roles r,
  (VALUES
    ('00000000-0000-0000-0000-000000220911', '00000000-0000-0000-0000-000000220901', NULL, true, NULL,
     '00000000-0000-0000-0000-000000220811'),
    ('00000000-0000-0000-0000-000000220918', '00000000-0000-0000-0000-000000220901', NULL, true, NULL,
     '00000000-0000-0000-0000-000000220818'),
    ('00000000-0000-0000-0000-000000220920', '00000000-0000-0000-0000-000000220901', NULL, true, NULL,
     '00000000-0000-0000-0000-000000220820'),
    ('00000000-0000-0000-0000-000000220919', '00000000-0000-0000-0000-000000220901',
     '00000000-0000-0000-0000-000000220951', true, NULL, '00000000-0000-0000-0000-000000220819'),
    ('00000000-0000-0000-0000-000000220921', '00000000-0000-0000-0000-000000220901', NULL, true,
     (now() - interval '1 hour')::text, '00000000-0000-0000-0000-000000220821'),
    ('00000000-0000-0000-0000-000000220922', '00000000-0000-0000-0000-000000220901', NULL, false, NULL, NULL),
    ('00000000-0000-0000-0000-000000220923', '00000000-0000-0000-0000-000000220901', NULL, true, NULL, NULL),
    ('00000000-0000-0000-0000-000000220914', '00000000-0000-0000-0000-000000220902', NULL, true, NULL,
     '00000000-0000-0000-0000-000000220814')
  ) AS v(person, club, show, active, expires, auth)
WHERE r.name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000220915', r.id, true, '00000000-0000-0000-0000-000000220815'
FROM public.roles r WHERE r.name = 'site_admin';

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
  IF has_function_privilege('authenticated', 'public.person_can_sign_in(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.person_can_sign_in(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL the internal person_can_sign_in helper is callable by clients';
  END IF;
  RAISE NOTICE 'PASS anon cannot execute, authenticated can, the helper is internal';
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
        '00000000-0000-0000-0000-000000220901', 'existing.account@example.test');
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

-- get_club_admins: name and email, exactly the club-wide effective admins of THIS club (not another
-- club's, a show-pinned-only person, an inactive or expired row, or a deleted person), and a site
-- admin who administers nothing can list.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
DO $$
DECLARE
  ids uuid[];
  me record;
BEGIN
  SELECT array_agg(a.person_id ORDER BY a.person_id) INTO ids
  FROM public.get_club_admins('00000000-0000-0000-0000-000000220901') a;
  IF ids IS DISTINCT FROM ARRAY[
    '00000000-0000-0000-0000-000000220911',
    '00000000-0000-0000-0000-000000220918',
    '00000000-0000-0000-0000-000000220920'
  ]::uuid[] THEN
    RAISE EXCEPTION 'FAIL get_club_admins listed the wrong people: %', ids;
  END IF;
  SELECT * INTO me FROM public.get_club_admins('00000000-0000-0000-0000-000000220901') a
  WHERE a.person_id = '00000000-0000-0000-0000-000000220911';
  IF me.person_name IS DISTINCT FROM 'Grant Admin'
     OR me.person_email IS DISTINCT FROM 'grant.admin@example.test' THEN
    RAISE EXCEPTION 'FAIL get_club_admins returned the wrong name or email: %', me;
  END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220815', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_club_admins('00000000-0000-0000-0000-000000220901')) <> 3 THEN
    RAISE EXCEPTION 'FAIL a site admin could not list the club admins';
  END IF;
  RAISE NOTICE 'PASS get_club_admins lists the right people with name and email; a site admin can list';
END;
$$;

-- The admin grants an existing account: that person becomes a club admin at once.
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

-- By email: an existing account (padded, mixed case) is added; everything else grants nothing.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
DO $$
DECLARE
  existing record;
  addr text;
  res record;
  people_before bigint;
BEGIN
  SELECT * INTO existing FROM public.add_club_admin_by_email(
    '00000000-0000-0000-0000-000000220901', '  Bystander@Example.Test ');
  IF existing.outcome IS DISTINCT FROM 'added'
     OR existing.person_id IS DISTINCT FROM '00000000-0000-0000-0000-000000220913'::uuid THEN
    RAISE EXCEPTION 'FAIL existing account by email: %', existing;
  END IF;

  SELECT count(*) INTO people_before FROM public.people;
  FOREACH addr IN ARRAY ARRAY[
    'never.signed.in@example.test',  -- has an auth user that never signed in
    'unclaimed@example.test',        -- a person row with no account
    'suspended@example.test',        -- suspended
    'nobody.at.all@example.test'     -- unknown
  ] LOOP
    SELECT * INTO res FROM public.add_club_admin_by_email(
      '00000000-0000-0000-0000-000000220901', addr);
    IF res.outcome IS DISTINCT FROM 'no_account' OR res.person_id IS NOT NULL THEN
      RAISE EXCEPTION 'FAIL % should be no_account: %', addr, res;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.people) <> people_before THEN
    RAISE EXCEPTION 'FAIL add by email created a people row';
  END IF;

  BEGIN
    PERFORM * FROM public.add_club_admin_by_email(
      '00000000-0000-0000-0000-000000220901', 'not an email');
    RAISE EXCEPTION 'FAIL a malformed email was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  -- Direct grants to a person who cannot sign in are refused too.
  BEGIN
    PERFORM public.grant_club_admin(
      '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220916');
    RAISE EXCEPTION 'FAIL a never-signed-in person was granted admin';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  BEGIN
    PERFORM public.grant_club_admin(
      '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220917');
    RAISE EXCEPTION 'FAIL a person with no account was granted admin';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  RAISE NOTICE 'PASS add by email grants an existing account and nothing else';
END;
$$;

RESET ROLE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE r.name = 'club_admin'
      AND ur.user_id IN ('00000000-0000-0000-0000-000000220916',
                         '00000000-0000-0000-0000-000000220917')
  ) THEN
    RAISE EXCEPTION 'FAIL a no-account person ended up with a club_admin row';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;

-- A show-pinned-only person is not a club admin on this page: not listed, and granting adds a
-- club-wide row beside the pinned one. Removal then deactivates every row, so the server's
-- is_club_admin turns false.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_club_admins('00000000-0000-0000-0000-000000220901') a
             WHERE a.person_id = '00000000-0000-0000-0000-000000220919') THEN
    RAISE EXCEPTION 'FAIL a show-pinned-only person was listed as a club admin';
  END IF;
END;
$$;
SELECT public.grant_club_admin(
  '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220919');

RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE r.name = 'club_admin' AND ur.is_active
        AND ur.user_id = '00000000-0000-0000-0000-000000220919') <> 2
     OR (SELECT count(*) FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE r.name = 'club_admin' AND ur.is_active AND ur.show_id IS NULL
        AND ur.user_id = '00000000-0000-0000-0000-000000220919') <> 1 THEN
    RAISE EXCEPTION 'FAIL granting a show-pinned-only person did not add exactly one club-wide row';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_club_admins('00000000-0000-0000-0000-000000220901') a
      WHERE a.person_id = '00000000-0000-0000-0000-000000220919') <> 1 THEN
    RAISE EXCEPTION 'FAIL the person was not listed exactly once after the grant';
  END IF;
END;
$$;
SELECT public.revoke_club_admin(
  '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220919');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220819', true);
DO $$
BEGIN
  IF public.is_club_admin('00000000-0000-0000-0000-000000220901') THEN
    RAISE EXCEPTION 'FAIL is_club_admin stayed true after removing every assignment';
  END IF;
  RAISE NOTICE 'PASS a show-pinned-only person is not listed; grant adds a club-wide row; removal clears every row';
END;
$$;

-- Re-granting an expired co-admin resets the expiry (they were not counted while expired).
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
SELECT public.grant_club_admin(
  '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220921');
RESET ROLE;
DO $$
BEGIN
  IF (SELECT ur.expires_at FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE r.name = 'club_admin' AND ur.user_id = '00000000-0000-0000-0000-000000220921'
        AND ur.club_id = '00000000-0000-0000-0000-000000220901') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL re-granting an expired admin did not reset expires_at';
  END IF;
  -- Lapse it again so it stays out of the last-admin count below.
  UPDATE public.user_roles ur SET expires_at = now() - interval '1 hour'
  FROM public.roles r
  WHERE r.id = ur.role_id AND r.name = 'club_admin'
    AND ur.user_id = '00000000-0000-0000-0000-000000220921';
  RAISE NOTICE 'PASS re-granting an expired admin resets expires_at';
END;
$$;
SET LOCAL ROLE authenticated;

-- Revoke deactivates and stamps; is_club_admin turns false; re-granting reactivates the same row.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
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
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
SELECT * FROM public.add_club_admin_by_email(
  '00000000-0000-0000-0000-000000220901', 'existing.account@example.test');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220812', true);
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
      WHERE ur.user_id = '00000000-0000-0000-0000-000000220912'
        AND ur.club_id = '00000000-0000-0000-0000-000000220901' AND r.name = 'club_admin') <> 1 THEN
    RAISE EXCEPTION 'FAIL re-grant duplicated the user_roles row';
  END IF;
  RAISE NOTICE 'PASS revoke deactivates and stamps, is_club_admin follows, re-grant reactivates';
END;
$$;
SET LOCAL ROLE authenticated;

-- Step-up: a stale or missing amr is refused with MKAUT; a fresh one passes. All three writers.
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
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
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

-- A site admin who administers no club can grant and revoke.
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

-- Audit rows: one per real grant and per real revoke, none for a no-op.
RESET ROLE;
SELECT set_config('t.audit', (SELECT count(*) FROM public.permission_audit_log
  WHERE action IN ('club_admin_granted', 'club_admin_revoked'))::text, true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
SELECT public.grant_club_admin(
  '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220911'); -- no-op
SELECT public.revoke_club_admin(
  '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220913'); -- real (+1)
SELECT public.revoke_club_admin(
  '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220913'); -- no-op
SELECT public.grant_club_admin(
  '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220913'); -- real (+1)
SELECT public.grant_club_admin(
  '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220913'); -- no-op
SELECT public.revoke_club_admin(
  '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220913'); -- real (+1)
RESET ROLE;
DO $$
DECLARE
  v_now bigint;
BEGIN
  SELECT count(*) INTO v_now FROM public.permission_audit_log
  WHERE action IN ('club_admin_granted', 'club_admin_revoked');
  IF v_now - current_setting('t.audit')::bigint <> 3 THEN
    RAISE EXCEPTION 'FAIL expected 3 audit rows (2 revokes, 1 grant), got %',
      v_now - current_setting('t.audit')::bigint;
  END IF;
  RAISE NOTICE 'PASS audit rows exist for real grants and revokes and none for no-ops';
END;
$$;
SET LOCAL ROLE authenticated;

-- Last admin. Club A's other club-wide admins are 918 (suspended), 920 (banned) and 921 (expired):
-- none can act, so 911 is the only admin who counts.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220811', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.revoke_club_admin(
      '00000000-0000-0000-0000-000000220901', '00000000-0000-0000-0000-000000220911');
    RAISE EXCEPTION 'FAIL the last admin who can sign in was removed (a suspended, banned or expired co-admin counted)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'A club needs at least one admin. Add another admin first.' THEN
      RAISE;
    END IF;
  END;

  IF NOT public.is_club_admin('00000000-0000-0000-0000-000000220901') THEN
    RAISE EXCEPTION 'FAIL the last admin lost access despite the refusal';
  END IF;
  RAISE NOTICE 'PASS the last admin cannot be removed; suspended, banned and expired co-admins do not count';
END;
$$;

ROLLBACK;
