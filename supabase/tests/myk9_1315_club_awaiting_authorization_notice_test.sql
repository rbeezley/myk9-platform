-- MYK9-1315: a club a non-admin creates (unauthorized) notifies every active site
-- admin once; a site admin's own insert, a seed/service insert (no auth.uid()), and
-- inactive site admins produce no notification.
--
-- Conventions match myk9_1310_approval_authorizes_club_test.sql: run with
-- psql -X -v ON_ERROR_STOP=1 after migrations; every fixture rolls back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001315001', 'MYK9-1315 Secretary Home Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001315011', 'Alma', 'Admin', 'myk9-1315-admin-a@example.test', NULL),
  ('00000000-0000-0000-0000-000001315012', 'Boris', 'Admin', 'myk9-1315-admin-b@example.test', NULL),
  ('00000000-0000-0000-0000-000001315013', 'Ines', 'Inactive', 'myk9-1315-inactive@example.test', NULL),
  ('00000000-0000-0000-0000-000001315014', 'Sam', 'Secretary', 'myk9-1315-secretary@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001315101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1315-admin-a@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001315102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1315-admin-b@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001315103', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1315-inactive@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001315104', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1315-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = CASE email
  WHEN 'myk9-1315-admin-a@example.test' THEN '00000000-0000-0000-0000-000001315101'::uuid
  WHEN 'myk9-1315-admin-b@example.test' THEN '00000000-0000-0000-0000-000001315102'::uuid
  WHEN 'myk9-1315-inactive@example.test' THEN '00000000-0000-0000-0000-000001315103'::uuid
  WHEN 'myk9-1315-secretary@example.test' THEN '00000000-0000-0000-0000-000001315104'::uuid
END
WHERE email LIKE 'myk9-1315-%@example.test';

-- Two active site admins and one inactive site admin.
INSERT INTO public.user_roles (user_id, role_id, is_active, granted_by, auth_user_id)
SELECT p.id, r.id, p.is_active, '00000000-0000-0000-0000-000001315011', p.auth_id
FROM public.roles r
CROSS JOIN (VALUES
  ('00000000-0000-0000-0000-000001315011'::uuid, true,  '00000000-0000-0000-0000-000001315101'::uuid),
  ('00000000-0000-0000-0000-000001315012'::uuid, true,  '00000000-0000-0000-0000-000001315102'::uuid),
  ('00000000-0000-0000-0000-000001315013'::uuid, false, '00000000-0000-0000-0000-000001315103'::uuid)
) AS p(id, is_active, auth_id)
WHERE r.name = 'site_admin';

-- A club-scoped secretary (clubs_insert admits is_trial_secretary()).
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, granted_by, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000001315014',
  id,
  '00000000-0000-0000-0000-000001315001',
  true,
  '00000000-0000-0000-0000-000001315011',
  '00000000-0000-0000-0000-000001315104'
FROM public.roles
WHERE name = 'secretary';

-- Club ids created under the test roles, read back by the verification blocks.
CREATE TEMP TABLE _t1315_club (id uuid, name text);
GRANT ALL ON _t1315_club TO authenticated;

SET LOCAL ROLE authenticated;

-- 1. A secretary's insert notifies every active site admin exactly once, with the
--    deep link, and nobody else.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001315104', true);

INSERT INTO public.clubs (name) VALUES ('MYK9-1315 Secretary Created Club');
INSERT INTO _t1315_club SELECT id, name FROM public.clubs WHERE name = 'MYK9-1315 Secretary Created Club';

RESET ROLE;

DO $$
DECLARE
  v_club_id uuid;
  v_total integer;
  v_active_admins integer;
  v_msg text;
BEGIN
  SELECT id INTO v_club_id FROM _t1315_club WHERE name = 'MYK9-1315 Secretary Created Club';
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'FAIL the secretary could not read back its own club';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.notifications
  WHERE type = 'club_awaiting_authorization' AND deep_link_url = '/admin/onboarding?creator=00000000-0000-0000-0000-000001315104';

  SELECT count(DISTINCT p.auth_user_id) INTO v_active_admins
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  WHERE r.name = 'site_admin' AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
    AND p.status = 'active' AND p.auth_user_id IS NOT NULL;

  IF v_active_admins < 2 THEN
    RAISE EXCEPTION 'FAIL fixture should yield at least 2 active site admins, found %', v_active_admins;
  END IF;
  IF v_total <> v_active_admins THEN
    RAISE EXCEPTION 'FAIL expected % notifications (one per active site admin), found %', v_active_admins, v_total;
  END IF;

  FOR v_msg IN
    SELECT user_id::text FROM public.notifications
    WHERE type = 'club_awaiting_authorization' AND deep_link_url = '/admin/onboarding?creator=00000000-0000-0000-0000-000001315104'
    GROUP BY user_id HAVING count(*) > 1
  LOOP
    RAISE EXCEPTION 'FAIL admin % got more than one notification for the club', v_msg;
  END LOOP;

  IF (SELECT count(*) FROM public.notifications
      WHERE type = 'club_awaiting_authorization' AND deep_link_url = '/admin/onboarding?creator=00000000-0000-0000-0000-000001315104'
        AND user_id IN ('00000000-0000-0000-0000-000001315101', '00000000-0000-0000-0000-000001315102')) <> 2 THEN
    RAISE EXCEPTION 'FAIL the two fixture site admins did not each get a notification';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE type = 'club_awaiting_authorization' AND deep_link_url = '/admin/onboarding?creator=00000000-0000-0000-0000-000001315104'
      AND user_id IN ('00000000-0000-0000-0000-000001315103', '00000000-0000-0000-0000-000001315104')
  ) THEN
    RAISE EXCEPTION 'FAIL an inactive site admin or the creator was notified';
  END IF;

  SELECT message INTO v_msg
  FROM public.notifications
  WHERE type = 'club_awaiting_authorization' AND deep_link_url = '/admin/onboarding?creator=00000000-0000-0000-0000-000001315104'
    AND user_id = '00000000-0000-0000-0000-000001315101';
  IF v_msg IS DISTINCT FROM 'MYK9-1315 Secretary Created Club was created by Sam Secretary and is waiting for authorization.' THEN
    RAISE EXCEPTION 'FAIL unexpected message: %', v_msg;
  END IF;

  RAISE NOTICE 'PASS a secretary''s club notifies each active site admin once with the deep link';
END;
$$;

-- 2. A site admin's own insert is authorized at creation and notifies nobody.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001315101', true);

INSERT INTO public.clubs (name) VALUES ('MYK9-1315 Admin Created Club');
INSERT INTO _t1315_club SELECT id, name FROM public.clubs WHERE name = 'MYK9-1315 Admin Created Club';

RESET ROLE;

DO $$
DECLARE
  v_club_id uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_club_id FROM _t1315_club WHERE name = 'MYK9-1315 Admin Created Club';

  IF (SELECT authorized_at FROM public.clubs WHERE id = v_club_id) IS NULL THEN
    RAISE EXCEPTION 'FAIL the site admin''s club is not authorized';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.notifications
  WHERE type = 'club_awaiting_authorization' AND deep_link_url = '/admin/onboarding?creator=00000000-0000-0000-0000-000001315101';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL a site admin''s own club raised % notifications', v_count;
  END IF;

  RAISE NOTICE 'PASS a site admin''s own club raises no notification';
END;
$$;

-- 3. A seed/service insert (no auth.uid()) notifies nobody.
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  v_club_id uuid;
  v_count integer;
BEGIN
  INSERT INTO public.clubs (name) VALUES ('MYK9-1315 Seed Created Club')
  RETURNING id INTO v_club_id;

  SELECT count(*) INTO v_count
  FROM public.notifications
  WHERE type = 'club_awaiting_authorization' AND message LIKE '%MYK9-1315 Seed Created Club%';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL a seed insert raised % notifications', v_count;
  END IF;

  RAISE NOTICE 'PASS a seed insert with no auth.uid() raises no notification';
END;
$$;

ROLLBACK;
