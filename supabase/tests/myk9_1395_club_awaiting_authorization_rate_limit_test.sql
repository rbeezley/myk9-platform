-- MYK9-1395 (SA-2026-10-24-04): notify_site_admins_club_awaiting_authorization()
-- raises at most one notice set (one notification per active site admin) per
-- creator per 24 hours, claimed in private.club_awaiting_authorization_notice_log.
-- Proved here: repeated single-row inserts, a club inserted with deleted_at set,
-- and a created_by that was cleared all fail to reset the window; another creator
-- is not suppressed; moving the ledger back 25h re-arms the creator; a multi-row
-- insert notifies once; a 200-character name is truncated; the ledger grants no
-- privilege to anon or authenticated.
--
-- NOT exercised: two concurrent transactions by one creator. One psql session
-- cannot interleave them. That case rests on INSERT .. ON CONFLICT DO UPDATE
-- taking the conflicting row's lock: the second transaction blocks until the first
-- commits, then re-evaluates the WHERE (last_notified_at <= now() - 24h) against
-- the committed row, finds it false, and returns no row.
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

CREATE FUNCTION pg_temp.t1395_admins() RETURNS integer
LANGUAGE sql AS $$
  SELECT count(DISTINCT p.auth_user_id)::integer
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.people p ON p.id = ur.user_id
  WHERE r.name = 'site_admin' AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
    AND p.status = 'active' AND p.auth_user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.auth_user_id)
$$;

-- 1. Creator 1 inserts three unauthorized clubs in separate statements: only the
--    first notifies, one notification per active site admin.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395104', true);
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 A1');
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 A2');
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 A3');
RESET ROLE;
INSERT INTO _t1395_club SELECT id, name FROM public.clubs WHERE name LIKE 'MYK9-1395 A%';

DO $$
BEGIN
  IF pg_temp.t1395_admins() < 2 THEN
    RAISE EXCEPTION 'FAIL fixture should yield at least 2 active site admins, found %', pg_temp.t1395_admins();
  END IF;
  IF pg_temp.t1395_notices('MYK9-1395 A1') <> pg_temp.t1395_admins() THEN
    RAISE EXCEPTION 'FAIL first club: expected % notifications, found %', pg_temp.t1395_admins(), pg_temp.t1395_notices('MYK9-1395 A1');
  END IF;
  IF pg_temp.t1395_notices('MYK9-1395 A2') <> 0 OR pg_temp.t1395_notices('MYK9-1395 A3') <> 0 THEN
    RAISE EXCEPTION 'FAIL notify_site_admins_club_awaiting_authorization was not bounded: A2 got %, A3 got %',
      pg_temp.t1395_notices('MYK9-1395 A2'), pg_temp.t1395_notices('MYK9-1395 A3');
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: 3 unauthorized clubs from one creator raise exactly one notice per site admin';
END;
$$;

-- 2. A club inserted with deleted_at already set must not reset the window. The
--    block trigger is BEFORE UPDATE only, so the insert may succeed or be rejected
--    by policy; either way the next ordinary insert must stay quiet.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395104', true);
DO $$
BEGIN
  INSERT INTO public.clubs (name, deleted_at) VALUES ('MYK9-1395 D1', now());
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'INFO insert with deleted_at set was rejected: %', SQLERRM;
END;
$$;
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 D2');
RESET ROLE;
INSERT INTO _t1395_club SELECT id, name FROM public.clubs WHERE name IN ('MYK9-1395 D1', 'MYK9-1395 D2');

DO $$
BEGIN
  IF pg_temp.t1395_notices('MYK9-1395 D1') <> 0 OR pg_temp.t1395_notices('MYK9-1395 D2') <> 0 THEN
    RAISE EXCEPTION 'FAIL a club inserted with deleted_at set reset the window (D1 got %, D2 got %)',
      pg_temp.t1395_notices('MYK9-1395 D1'), pg_temp.t1395_notices('MYK9-1395 D2');
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: a club inserted with deleted_at set does not reset the window';
END;
$$;

-- 3. Clearing created_by on the earlier club (if the guard allows it) must not
--    reset the window either.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395104', true);
DO $$
BEGIN
  UPDATE public.clubs SET created_by = NULL WHERE name = 'MYK9-1395 A1';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'INFO clearing created_by was rejected: %', SQLERRM;
END;
$$;
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 C1');
RESET ROLE;
INSERT INTO _t1395_club SELECT id, name FROM public.clubs WHERE name = 'MYK9-1395 C1';

DO $$
BEGIN
  IF pg_temp.t1395_notices('MYK9-1395 C1') <> 0 THEN
    RAISE EXCEPTION 'FAIL clearing created_by reset the window (C1 got %)', pg_temp.t1395_notices('MYK9-1395 C1');
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: clearing created_by does not reset the window';
END;
$$;

-- 4. A different creator is not suppressed.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395105', true);
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 B1');
RESET ROLE;
INSERT INTO _t1395_club SELECT id, name FROM public.clubs WHERE name = 'MYK9-1395 B1';

DO $$
BEGIN
  IF pg_temp.t1395_notices('MYK9-1395 B1') <> pg_temp.t1395_admins() THEN
    RAISE EXCEPTION 'FAIL a second creator was suppressed or over-notified (B1 got %)', pg_temp.t1395_notices('MYK9-1395 B1');
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: a different creator is not suppressed';
END;
$$;

-- 5. Moving creator 1's ledger row back 25 hours re-arms the creator.
UPDATE private.club_awaiting_authorization_notice_log
SET last_notified_at = now() - interval '25 hours'
WHERE creator = '00000000-0000-0000-0000-000001395104';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395104', true);
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 R1');
RESET ROLE;
INSERT INTO _t1395_club SELECT id, name FROM public.clubs WHERE name = 'MYK9-1395 R1';

DO $$
BEGIN
  IF pg_temp.t1395_notices('MYK9-1395 R1') <> pg_temp.t1395_admins() THEN
    RAISE EXCEPTION 'FAIL after 25h the creator was not re-armed (R1 got %)', pg_temp.t1395_notices('MYK9-1395 R1');
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: notifies again once the 24h window has passed';
END;
$$;

-- 6. A multi-row insert notifies once (the first row claims), not per row.
UPDATE private.club_awaiting_authorization_notice_log
SET last_notified_at = now() - interval '25 hours'
WHERE creator = '00000000-0000-0000-0000-000001395105';
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
  IF v_total <> pg_temp.t1395_admins() THEN
    RAISE EXCEPTION 'FAIL a 3-row insert raised % notifications, expected exactly one set (%)', v_total, pg_temp.t1395_admins();
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: a multi-row insert raises exactly one notice set';
END;
$$;

-- 7. The club name in the message is capped at 80 characters plus an ellipsis.
UPDATE private.club_awaiting_authorization_notice_log
SET last_notified_at = now() - interval '25 hours'
WHERE creator = '00000000-0000-0000-0000-000001395104';
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

-- 8. The ledger is not reachable by client roles.
DO $$
DECLARE
  v_role text;
  v_priv text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(v_role, 'private.club_awaiting_authorization_notice_log', v_priv) THEN
        RAISE EXCEPTION 'FAIL % has % on the notice ledger', v_role, v_priv;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: anon and authenticated have no privilege on the notice ledger';
END;
$$;

ROLLBACK;
