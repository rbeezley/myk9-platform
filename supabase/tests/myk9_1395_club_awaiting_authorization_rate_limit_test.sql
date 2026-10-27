-- MYK9-1395 (SA-2026-10-24-04): notify_site_admins_club_awaiting_authorization()
-- is bounded per creator. While a creator has another club that is unauthorized
-- and not soft-deleted, further inserts raise no notification (one outstanding
-- notice set per creator); once that club is authorized or soft-deleted the next
-- insert notifies again; another creator is never suppressed; the club name in the
-- message is capped at 80 characters.
--
-- Conventions match myk9_1315_club_awaiting_authorization_notice_test.sql: run
-- with psql -X -v ON_ERROR_STOP=1 after migrations; every fixture rolls back.
-- Runs only in CI (no local Postgres on the development Mac).

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001395001', 'MYK9-1395 Home Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001395011', 'Alma', 'Admin', 'myk9-1395-admin-a@example.test', NULL),
  ('00000000-0000-0000-0000-000001395012', 'Boris', 'Admin', 'myk9-1395-admin-b@example.test', NULL),
  ('00000000-0000-0000-0000-000001395014', 'Sam', 'Secretary', 'myk9-1395-secretary-1@example.test', NULL),
  ('00000000-0000-0000-0000-000001395015', 'Tess', 'Secretary', 'myk9-1395-secretary-2@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001395101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1395-admin-a@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001395102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1395-admin-b@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001395104', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1395-secretary-1@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001395105', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1395-secretary-2@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = CASE email
  WHEN 'myk9-1395-admin-a@example.test' THEN '00000000-0000-0000-0000-000001395101'::uuid
  WHEN 'myk9-1395-admin-b@example.test' THEN '00000000-0000-0000-0000-000001395102'::uuid
  WHEN 'myk9-1395-secretary-1@example.test' THEN '00000000-0000-0000-0000-000001395104'::uuid
  WHEN 'myk9-1395-secretary-2@example.test' THEN '00000000-0000-0000-0000-000001395105'::uuid
END
WHERE email LIKE 'myk9-1395-%@example.test';

INSERT INTO public.user_roles (user_id, role_id, is_active, granted_by, auth_user_id)
SELECT p.id, r.id, true, '00000000-0000-0000-0000-000001395011', p.auth_id
FROM public.roles r
CROSS JOIN (VALUES
  ('00000000-0000-0000-0000-000001395011'::uuid, '00000000-0000-0000-0000-000001395101'::uuid),
  ('00000000-0000-0000-0000-000001395012'::uuid, '00000000-0000-0000-0000-000001395102'::uuid)
) AS p(id, auth_id)
WHERE r.name = 'site_admin';

-- Two club-scoped secretaries (clubs_insert admits is_trial_secretary()).
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, granted_by, auth_user_id)
SELECT p.id, r.id, '00000000-0000-0000-0000-000001395001', true,
       '00000000-0000-0000-0000-000001395011', p.auth_id
FROM public.roles r
CROSS JOIN (VALUES
  ('00000000-0000-0000-0000-000001395014'::uuid, '00000000-0000-0000-0000-000001395104'::uuid),
  ('00000000-0000-0000-0000-000001395015'::uuid, '00000000-0000-0000-0000-000001395105'::uuid)
) AS p(id, auth_id)
WHERE r.name = 'secretary';

-- Club ids by name, filled as postgres after each insert phase.
CREATE TEMP TABLE _t1395_club (id uuid, name text);

-- Notifications per club, counted as postgres.
CREATE FUNCTION pg_temp.t1395_notices(p_name text) RETURNS integer
LANGUAGE sql AS $$
  SELECT count(*)::integer FROM public.notifications n
  JOIN _t1395_club c ON n.deep_link_url = '/clubs/' || c.id
  WHERE n.type = 'club_awaiting_authorization' AND c.name = p_name
$$;

-- 1. Secretary 1 inserts three unauthorized clubs: only the first notifies, and
--    exactly one notification per active site admin.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395104', true);

-- Three statements, not one: row-level AFTER triggers fire at the end of the
-- statement, so in a multi-row insert every row already sees its siblings (phase 6).
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 A1');
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 A2');
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 A3');

RESET ROLE;
INSERT INTO _t1395_club SELECT id, name FROM public.clubs WHERE name LIKE 'MYK9-1395 A%';

DO $$
DECLARE
  v_admins integer;
  v_a1 integer := pg_temp.t1395_notices('MYK9-1395 A1');
  v_a2 integer := pg_temp.t1395_notices('MYK9-1395 A2');
  v_a3 integer := pg_temp.t1395_notices('MYK9-1395 A3');
BEGIN
  SELECT count(DISTINCT p.auth_user_id) INTO v_admins
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  WHERE r.name = 'site_admin' AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
    AND p.status = 'active' AND p.auth_user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.auth_user_id);
  IF v_admins < 2 THEN
    RAISE EXCEPTION 'FAIL fixture should yield at least 2 active site admins, found %', v_admins;
  END IF;

  IF v_a1 <> v_admins THEN
    RAISE EXCEPTION 'FAIL first club: expected % notifications (one per active site admin), found %', v_admins, v_a1;
  END IF;
  IF v_a2 <> 0 OR v_a3 <> 0 THEN
    RAISE EXCEPTION 'FAIL notify_site_admins_club_awaiting_authorization was not bounded: A2 got %, A3 got %', v_a2, v_a3;
  END IF;

  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: 3 unauthorized clubs from one creator raise exactly one notice per site admin';
END;
$$;

-- 2. A different creator is not suppressed by secretary 1's pending clubs.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395105', true);

INSERT INTO public.clubs (name) VALUES ('MYK9-1395 B1');

RESET ROLE;
INSERT INTO _t1395_club SELECT id, name FROM public.clubs WHERE name = 'MYK9-1395 B1';

DO $$
BEGIN
  IF pg_temp.t1395_notices('MYK9-1395 B1') <> pg_temp.t1395_notices('MYK9-1395 A1') THEN
    RAISE EXCEPTION 'FAIL a second creator was suppressed by the first creator''s pending club (B1 got %)',
      pg_temp.t1395_notices('MYK9-1395 B1');
  END IF;
  IF pg_temp.t1395_notices('MYK9-1395 B1') = 0 THEN
    RAISE EXCEPTION 'FAIL the second creator''s first club raised no notification';
  END IF;

  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: a different creator is not suppressed';
END;
$$;

-- 3. While any earlier club is still pending, a further insert stays quiet: only
--    A1 authorized and A2 soft-deleted leaves A3 pending.
UPDATE public.clubs SET authorized_at = now()
WHERE id = (SELECT id FROM _t1395_club WHERE name = 'MYK9-1395 A1');
UPDATE public.clubs SET deleted_at = now()
WHERE id = (SELECT id FROM _t1395_club WHERE name = 'MYK9-1395 A2');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395104', true);
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 A4');
RESET ROLE;
INSERT INTO _t1395_club SELECT id, name FROM public.clubs WHERE name = 'MYK9-1395 A4';

DO $$
BEGIN
  IF pg_temp.t1395_notices('MYK9-1395 A4') <> 0 THEN
    RAISE EXCEPTION 'FAIL a club inserted while A3 is still pending raised % notifications',
      pg_temp.t1395_notices('MYK9-1395 A4');
  END IF;

  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: one still-pending club keeps further inserts quiet';
END;
$$;

-- 4. Once every earlier club is authorized or soft-deleted, the next insert
--    notifies again, and its notice set is again one per site admin.
UPDATE public.clubs SET authorized_at = now()
WHERE id IN (SELECT id FROM _t1395_club WHERE name IN ('MYK9-1395 A3', 'MYK9-1395 A4'));

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395104', true);
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 A5');
RESET ROLE;
INSERT INTO _t1395_club SELECT id, name FROM public.clubs WHERE name = 'MYK9-1395 A5';

DO $$
BEGIN
  IF pg_temp.t1395_notices('MYK9-1395 A5') <> pg_temp.t1395_notices('MYK9-1395 A1') THEN
    RAISE EXCEPTION 'FAIL after the earlier clubs were authorized or deleted, expected % notifications, found %',
      pg_temp.t1395_notices('MYK9-1395 A1'), pg_temp.t1395_notices('MYK9-1395 A5');
  END IF;

  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: notifies again once earlier clubs are authorized or deleted';
END;
$$;

-- 5. The club name in the message is capped at 80 characters plus an ellipsis.
UPDATE public.clubs SET authorized_at = now()
WHERE id IN (SELECT id FROM _t1395_club WHERE name = 'MYK9-1395 A5');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395104', true);
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 L' || repeat('x', 189));
RESET ROLE;

DO $$
DECLARE
  v_msg text;
  v_long text := 'MYK9-1395 L' || repeat('x', 189);
BEGIN
  SELECT n.message INTO v_msg
  FROM public.notifications n
  JOIN public.clubs c ON n.deep_link_url = '/clubs/' || c.id
  WHERE n.type = 'club_awaiting_authorization' AND c.name = v_long
    AND n.user_id = '00000000-0000-0000-0000-000001395101';

  IF v_msg IS NULL THEN
    RAISE EXCEPTION 'FAIL the long-named club raised no notification';
  END IF;
  IF v_msg IS DISTINCT FROM left(v_long, 80) || '... was created by Sam Secretary and is waiting for authorization.' THEN
    RAISE EXCEPTION 'FAIL the club name was not capped at 80 characters: %', v_msg;
  END IF;

  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: a 200-character name is truncated in the message';
END;
$$;

-- 6. A multi-row insert from a creator with nothing pending: every row's trigger
--    sees its sibling rows as pending, so the statement raises no notice at all.
--    That stays inside the bound (zero, not N); Admin -> Onboarding still lists them.
UPDATE public.clubs SET authorized_at = now()
WHERE id = (SELECT id FROM _t1395_club WHERE name = 'MYK9-1395 B1');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395105', true);
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 M1'), ('MYK9-1395 M2'), ('MYK9-1395 M3');
RESET ROLE;
INSERT INTO _t1395_club SELECT id, name FROM public.clubs WHERE name LIKE 'MYK9-1395 M%';

DO $$
DECLARE
  v_total integer := pg_temp.t1395_notices('MYK9-1395 M1')
                   + pg_temp.t1395_notices('MYK9-1395 M2')
                   + pg_temp.t1395_notices('MYK9-1395 M3');
BEGIN
  IF v_total <> 0 THEN
    RAISE EXCEPTION 'FAIL notify_site_admins_club_awaiting_authorization: a 3-row insert raised % notifications; each row should see its siblings as pending and raise none', v_total;
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: a multi-row insert raises no notice (siblings count as pending)';
END;
$$;

ROLLBACK;
