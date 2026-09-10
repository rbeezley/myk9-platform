-- MYK9-457: raw role grants stay private while live person screens can read
-- only effective role labels through get_visible_person_roles(uuid[]).
-- A policy widened to is_show_manager() or USING (true) must fail this test.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES
  ('secretary', 'MYK9-457 fixture', true),
  ('judge', 'MYK9-457 fixture', true),
  ('exhibitor', 'MYK9-457 fixture', true),
  ('club_admin', 'MYK9-457 fixture', true),
  ('site_admin', 'MYK9-457 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000457001', 'MYK9-457 Club A'),
  ('00000000-0000-0000-0000-000000457002', 'MYK9-457 Club B');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000457011', 'Club A', 'Secretary', 'myk9-457-secretary-a@example.test', NULL),
  ('00000000-0000-0000-0000-000000457012', 'Club A', 'Judge', 'myk9-457-judge-a@example.test', NULL),
  ('00000000-0000-0000-0000-000000457013', 'Plain', 'Exhibitor', 'myk9-457-exhibitor@example.test', NULL),
  ('00000000-0000-0000-0000-000000457014', 'Club B', 'Admin', 'myk9-457-admin-b@example.test', NULL),
  ('00000000-0000-0000-0000-000000457015', 'Club B', 'Judge', 'myk9-457-judge-b@example.test', NULL),
  ('00000000-0000-0000-0000-000000457016', 'Site', 'Admin', 'myk9-457-site-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000000457017', 'Inactive', 'Judge', 'myk9-457-inactive@example.test', NULL),
  ('00000000-0000-0000-0000-000000457018', 'Expired', 'Judge', 'myk9-457-expired@example.test', NULL),
  ('00000000-0000-0000-0000-000000457019', 'Removed', 'Judge', 'myk9-457-removed@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT
  fixture.auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', fixture.email, '', now(), now(), now(), '{}', '{}',
  false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000457101'::uuid, 'myk9-457-secretary-a@example.test'::text),
  ('00000000-0000-0000-0000-000000457102'::uuid, 'myk9-457-judge-a@example.test'::text),
  ('00000000-0000-0000-0000-000000457103'::uuid, 'myk9-457-exhibitor@example.test'::text),
  ('00000000-0000-0000-0000-000000457104'::uuid, 'myk9-457-admin-b@example.test'::text),
  ('00000000-0000-0000-0000-000000457105'::uuid, 'myk9-457-judge-b@example.test'::text),
  ('00000000-0000-0000-0000-000000457106'::uuid, 'myk9-457-site-admin@example.test'::text),
  ('00000000-0000-0000-0000-000000457107'::uuid, 'myk9-457-inactive@example.test'::text),
  ('00000000-0000-0000-0000-000000457108'::uuid, 'myk9-457-expired@example.test'::text),
  ('00000000-0000-0000-0000-000000457109'::uuid, 'myk9-457-removed@example.test'::text)
) AS fixture(auth_id, email);

DO $$
DECLARE linked integer;
BEGIN
  SELECT count(*) INTO linked
  FROM public.people
  WHERE id BETWEEN '00000000-0000-0000-0000-000000457011'::uuid
               AND '00000000-0000-0000-0000-000000457019'::uuid
    AND auth_user_id IS NOT NULL;
  IF linked <> 9 THEN
    RAISE EXCEPTION 'FAIL fixture: handle_new_user adopted % of 9 people', linked;
  END IF;
END;
$$;

-- Club-scoped secretary access is valid only with active membership.
INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES (
  '00000000-0000-0000-0000-000000457001',
  '00000000-0000-0000-0000-000000457011',
  'active'
);

INSERT INTO public.user_roles (
  user_id, role_id, club_id, show_id, is_active, auth_user_id, expires_at
)
SELECT fixture.person_id, r.id, fixture.club_id, NULL, fixture.is_active,
       fixture.auth_id, fixture.expires_at
FROM (VALUES
  ('00000000-0000-0000-0000-000000457011'::uuid, 'secretary'::text, '00000000-0000-0000-0000-000000457001'::uuid, true,  '00000000-0000-0000-0000-000000457101'::uuid, NULL::timestamptz),
  ('00000000-0000-0000-0000-000000457012'::uuid, 'judge'::text,     NULL::uuid,                                   true,  '00000000-0000-0000-0000-000000457102'::uuid, NULL::timestamptz),
  ('00000000-0000-0000-0000-000000457014'::uuid, 'club_admin'::text,'00000000-0000-0000-0000-000000457002'::uuid, true,  '00000000-0000-0000-0000-000000457104'::uuid, NULL::timestamptz),
  ('00000000-0000-0000-0000-000000457015'::uuid, 'judge'::text,     NULL::uuid,                                   true,  '00000000-0000-0000-0000-000000457105'::uuid, NULL::timestamptz),
  ('00000000-0000-0000-0000-000000457016'::uuid, 'site_admin'::text,NULL::uuid,                                   true,  '00000000-0000-0000-0000-000000457106'::uuid, NULL::timestamptz),
  ('00000000-0000-0000-0000-000000457017'::uuid, 'judge'::text,     NULL::uuid,                                   false, '00000000-0000-0000-0000-000000457107'::uuid, NULL::timestamptz),
  ('00000000-0000-0000-0000-000000457018'::uuid, 'judge'::text,     NULL::uuid,                                   true,  '00000000-0000-0000-0000-000000457108'::uuid, now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000457019'::uuid, 'judge'::text,     NULL::uuid,                                   true,  '00000000-0000-0000-0000-000000457109'::uuid, NULL::timestamptz)
) AS fixture(person_id, role_name, club_id, is_active, auth_id, expires_at)
JOIN public.roles r ON r.name = fixture.role_name;

-- Leave an active grant behind a tombstone to prove both the policy and RPC
-- filter on the person, not only on user_roles.is_active.
UPDATE public.people
SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-000000457019';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  secretary_uid uuid := '00000000-0000-0000-0000-000000457101';
  judge_a_uid   uuid := '00000000-0000-0000-0000-000000457102';
  exhibitor_uid uuid := '00000000-0000-0000-0000-000000457103';
  admin_b_uid   uuid := '00000000-0000-0000-0000-000000457104';
  site_uid      uuid := '00000000-0000-0000-0000-000000457106';
  visible       integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', secretary_uid::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', secretary_uid, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO visible FROM public.user_roles WHERE auth_user_id = secretary_uid;
  IF visible = 0 THEN
    RAISE EXCEPTION 'FAIL secretary cannot read their own grants';
  END IF;

  SELECT count(*) INTO visible
  FROM public.user_roles
  WHERE auth_user_id IN (judge_a_uid, admin_b_uid, site_uid,
    '00000000-0000-0000-0000-000000457109'::uuid);
  IF visible <> 0 THEN
    RAISE EXCEPTION 'FAIL secretary read another person''s raw grants (visible=%)', visible;
  END IF;

  SELECT count(*) INTO visible
  FROM public.get_visible_person_roles(ARRAY[
    '00000000-0000-0000-0000-000000457012'::uuid,
    '00000000-0000-0000-0000-000000457015'::uuid
  ])
  WHERE role_name = 'judge';
  IF visible <> 2 THEN
    RAISE EXCEPTION 'FAIL secretary did not receive both current judge labels (visible=%)', visible;
  END IF;

  SELECT count(*) INTO visible
  FROM public.get_visible_person_roles(ARRAY[
    '00000000-0000-0000-0000-000000457016'::uuid,
    '00000000-0000-0000-0000-000000457017'::uuid,
    '00000000-0000-0000-0000-000000457018'::uuid,
    '00000000-0000-0000-0000-000000457019'::uuid
  ])
  WHERE role_name = 'site_admin'
     OR (person_id IN (
       '00000000-0000-0000-0000-000000457017'::uuid,
       '00000000-0000-0000-0000-000000457018'::uuid
     ) AND role_name = 'judge')
     OR person_id = '00000000-0000-0000-0000-000000457019'::uuid;
  IF visible <> 0 THEN
    RAISE EXCEPTION 'FAIL RPC exposed site-admin, inactive, expired, or removed role labels (visible=%)', visible;
  END IF;

  -- A club admin receives safe labels but no raw cross-person rows.
  PERFORM set_config('request.jwt.claim.sub', admin_b_uid::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', admin_b_uid, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO visible FROM public.user_roles WHERE auth_user_id = judge_a_uid;
  IF visible <> 0 THEN
    RAISE EXCEPTION 'FAIL club admin read another person''s raw grants';
  END IF;
  SELECT count(*) INTO visible
  FROM public.get_visible_person_roles(ARRAY['00000000-0000-0000-0000-000000457015'::uuid])
  WHERE role_name = 'judge';
  IF visible <> 1 THEN
    RAISE EXCEPTION 'FAIL club admin cannot read a current judge label';
  END IF;

  -- Even site admins do not receive deleted grants through the general table;
  -- the removed-person screen uses its dedicated history RPC.
  PERFORM set_config('request.jwt.claim.sub', site_uid::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', site_uid, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO visible
  FROM public.user_roles
  WHERE auth_user_id = '00000000-0000-0000-0000-000000457109'::uuid;
  IF visible <> 0 THEN
    RAISE EXCEPTION 'FAIL site admin read removed-person grants through user_roles';
  END IF;
  SELECT count(*) INTO visible
  FROM public.get_deleted_person_role_history(
    '00000000-0000-0000-0000-000000457019'::uuid
  )
  WHERE role_name = 'judge';
  IF visible <> 1 THEN
    RAISE EXCEPTION 'FAIL removed-person history RPC did not return the held judge role';
  END IF;

  -- Plain exhibitors may ask only for their own effective labels.
  PERFORM set_config('request.jwt.claim.sub', exhibitor_uid::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', exhibitor_uid, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO visible
  FROM public.get_visible_person_roles(ARRAY['00000000-0000-0000-0000-000000457012'::uuid]);
  IF visible <> 0 THEN
    RAISE EXCEPTION 'FAIL exhibitor read another person''s role labels';
  END IF;
  SELECT count(*) INTO visible
  FROM public.get_visible_person_roles(ARRAY['00000000-0000-0000-0000-000000457013'::uuid])
  WHERE role_name = 'exhibitor';
  IF visible <> 1 THEN
    RAISE EXCEPTION 'FAIL exhibitor cannot read their own current role label';
  END IF;

  RAISE NOTICE 'PASS MYK9-457 raw grants private; visible role labels current and bounded';
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_visible_person_roles(uuid[])', 'execute') THEN
    RAISE EXCEPTION 'FAIL anon can execute get_visible_person_roles';
  END IF;
  IF has_function_privilege('anon', 'public.get_deleted_person_role_history(uuid)', 'execute') THEN
    RAISE EXCEPTION 'FAIL anon can execute get_deleted_person_role_history';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_visible_person_roles(uuid[])', 'execute') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute get_visible_person_roles';
  END IF;
END;
$$;

ROLLBACK;
