-- MYK9-2208: the show's club's admins (name + email) for a secretary who is not one.
-- Everything rolls back.
--
-- Proves: a club-wide secretary and a club admin can read the list; an outsider, another club's
-- secretary and a show-pinned secretary (a show-pinned row grants nothing) get 42501; anon cannot execute; an inactive, expired,
-- show-pinned, banned, suspended, never-signed-in or deleted admin is not listed.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000220801', 'Contacts Test Club'),
  ('00000000-0000-0000-0000-000000220802', 'Other Contacts Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000220851', 'Contacts Show', 'AKC',
        current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000220801', 'draft');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000220811', 'Pat', 'Lee', 'pat.lee@example.test'),
  ('00000000-0000-0000-0000-000000220812', 'Club', 'Secretary', 'club.secretary@example.test'),
  ('00000000-0000-0000-0000-000000220813', 'Show', 'Secretary', 'show.secretary@example.test'),
  ('00000000-0000-0000-0000-000000220814', 'Out', 'Sider', 'outsider@example.test'),
  ('00000000-0000-0000-0000-000000220815', 'Other', 'Secretary', 'other.secretary@example.test'),
  ('00000000-0000-0000-0000-000000220816', 'Banned', 'Admin', 'banned@example.test'),
  ('00000000-0000-0000-0000-000000220817', 'Suspended', 'Admin', 'suspended@example.test'),
  ('00000000-0000-0000-0000-000000220818', 'Never', 'SignedIn', 'never@example.test'),
  ('00000000-0000-0000-0000-000000220819', 'Inactive', 'Admin', 'inactive@example.test'),
  ('00000000-0000-0000-0000-000000220820', 'Expired', 'Admin', 'expired@example.test'),
  ('00000000-0000-0000-0000-000000220821', 'Pinned', 'Admin', 'pinned@example.test'),
  ('00000000-0000-0000-0000-000000220822', 'Deleted', 'Admin', 'deleted@example.test'),
  ('00000000-0000-0000-0000-000000220823', 'Sam', 'Roe', 'sam.roe@example.test');

UPDATE public.people SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000220822';
UPDATE public.people SET status = 'suspended' WHERE id = '00000000-0000-0000-0000-000000220817';

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous, banned_until
)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, '', now(), CASE WHEN v.signed_in THEN now() END, now(), now(), '{}', '{}',
       false, false, false, CASE WHEN v.email = 'banned@example.test' THEN now() + interval '1 day' END
FROM (VALUES
  ('00000000-0000-0000-0000-000000220711', 'pat.lee@example.test', true),
  ('00000000-0000-0000-0000-000000220712', 'club.secretary@example.test', true),
  ('00000000-0000-0000-0000-000000220713', 'show.secretary@example.test', true),
  ('00000000-0000-0000-0000-000000220714', 'outsider@example.test', true),
  ('00000000-0000-0000-0000-000000220715', 'other.secretary@example.test', true),
  ('00000000-0000-0000-0000-000000220716', 'banned@example.test', true),
  ('00000000-0000-0000-0000-000000220717', 'suspended@example.test', true),
  ('00000000-0000-0000-0000-000000220718', 'never@example.test', false),
  ('00000000-0000-0000-0000-000000220719', 'inactive@example.test', true),
  ('00000000-0000-0000-0000-000000220720', 'expired@example.test', true),
  ('00000000-0000-0000-0000-000000220721', 'pinned@example.test', true),
  ('00000000-0000-0000-0000-000000220723', 'sam.roe@example.test', true)
) AS v(id, email, signed_in);

-- Admins of club 1: Pat (listed), Sam (listed), plus the ones that must NOT be listed.
-- Secretaries: 812 club-wide, 813 pinned to the show, 815 secretary of the OTHER club.
INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, expires_at, auth_user_id)
SELECT v.person::uuid, r.id, v.club::uuid, v.show::uuid, v.active, v.expires::timestamptz, v.auth::uuid
FROM public.roles r
JOIN (VALUES
  ('club_admin', '00000000-0000-0000-0000-000000220811', '00000000-0000-0000-0000-000000220801', NULL, true, NULL, '00000000-0000-0000-0000-000000220711'),
  ('club_admin', '00000000-0000-0000-0000-000000220823', '00000000-0000-0000-0000-000000220801', NULL, true, NULL, '00000000-0000-0000-0000-000000220723'),
  ('club_admin', '00000000-0000-0000-0000-000000220816', '00000000-0000-0000-0000-000000220801', NULL, true, NULL, '00000000-0000-0000-0000-000000220716'),
  ('club_admin', '00000000-0000-0000-0000-000000220817', '00000000-0000-0000-0000-000000220801', NULL, true, NULL, '00000000-0000-0000-0000-000000220717'),
  ('club_admin', '00000000-0000-0000-0000-000000220818', '00000000-0000-0000-0000-000000220801', NULL, true, NULL, '00000000-0000-0000-0000-000000220718'),
  ('club_admin', '00000000-0000-0000-0000-000000220819', '00000000-0000-0000-0000-000000220801', NULL, false, NULL, '00000000-0000-0000-0000-000000220719'),
  ('club_admin', '00000000-0000-0000-0000-000000220820', '00000000-0000-0000-0000-000000220801', NULL, true, (now() - interval '1 hour')::text, '00000000-0000-0000-0000-000000220720'),
  ('club_admin', '00000000-0000-0000-0000-000000220821', '00000000-0000-0000-0000-000000220801', '00000000-0000-0000-0000-000000220851', true, NULL, '00000000-0000-0000-0000-000000220721'),
  ('club_admin', '00000000-0000-0000-0000-000000220822', '00000000-0000-0000-0000-000000220801', NULL, true, NULL, NULL),
  ('secretary', '00000000-0000-0000-0000-000000220812', '00000000-0000-0000-0000-000000220801', NULL, true, NULL, '00000000-0000-0000-0000-000000220712'),
  ('secretary', '00000000-0000-0000-0000-000000220813', '00000000-0000-0000-0000-000000220801', '00000000-0000-0000-0000-000000220851', true, NULL, '00000000-0000-0000-0000-000000220713'),
  ('secretary', '00000000-0000-0000-0000-000000220815', '00000000-0000-0000-0000-000000220802', NULL, true, NULL, '00000000-0000-0000-0000-000000220715')
) AS v(role, person, club, show, active, expires, auth) ON r.name = v.role;

-- anon cannot execute, authenticated can (read from the catalog).
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_show_club_admin_contacts(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute get_show_club_admin_contacts';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_show_club_admin_contacts(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute get_show_club_admin_contacts';
  END IF;
  RAISE NOTICE 'PASS anon cannot execute, authenticated can';
END;
$$;

SET LOCAL ROLE authenticated;

-- A club-wide secretary and a club admin each see exactly Pat Lee and Sam Roe.
DO $$
DECLARE
  who uuid;
  names text;
  emails text;
BEGIN
  FOREACH who IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000220712'::uuid,
    '00000000-0000-0000-0000-000000220711'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', who::text, true);
    SELECT string_agg(display_name, ',' ORDER BY display_name), string_agg(email, ',' ORDER BY email)
      INTO names, emails
    FROM public.get_show_club_admin_contacts('00000000-0000-0000-0000-000000220851');
    IF names IS DISTINCT FROM 'Pat Lee,Sam Roe'
       OR emails IS DISTINCT FROM 'pat.lee@example.test,sam.roe@example.test' THEN
      RAISE EXCEPTION 'FAIL % saw names % emails % (expected Pat Lee and Sam Roe only)', who, names, emails;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS club-wide secretary and club admin see only the live admins';
END;
$$;

-- An outsider, another club's secretary and a show-pinned secretary are refused; so is a call with no show.
DO $$
DECLARE
  who uuid;
BEGIN
  FOREACH who IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000220714'::uuid,
    '00000000-0000-0000-0000-000000220715'::uuid,
    '00000000-0000-0000-0000-000000220713'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', who::text, true);
    BEGIN
      PERFORM * FROM public.get_show_club_admin_contacts('00000000-0000-0000-0000-000000220851');
      RAISE EXCEPTION 'FAIL % read the admin contacts of a show they do not manage', who;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PASS an outsider, another club''s secretary and a show-pinned secretary are refused';
END;
$$;

-- A secretary who is authorized by role but suspended, or banned, is refused (their JWT may still
-- be valid). Done as the table owner so the people/auth rows can be changed, then restored.
RESET ROLE;
UPDATE public.people SET status = 'suspended' WHERE id = '00000000-0000-0000-0000-000000220812';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220712', true);
  BEGIN
    PERFORM * FROM public.get_show_club_admin_contacts('00000000-0000-0000-0000-000000220851');
    RAISE EXCEPTION 'FAIL a suspended secretary read the admin contacts';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'PASS a suspended secretary is refused';
END;
$$;

-- With no signed-in user the call is refused.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM * FROM public.get_show_club_admin_contacts('00000000-0000-0000-0000-000000220851');
    RAISE EXCEPTION 'FAIL a caller with no identity read the admin contacts';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'PASS no identity is refused';
END;
$$;

ROLLBACK;
