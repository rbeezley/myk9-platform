-- MYK9-1395 (SA-2026-10-24-04): notify_site_admins_club_awaiting_authorization()
-- folds repeats into ONE club_awaiting_authorization row per active site admin per
-- creator (deep link /admin/onboarding?creator=<auth uid>), updated in place with
-- the latest club name and resurfaced unread. Proved here: single-row and multi-row
-- inserts, a club inserted with deleted_at set and a cleared created_by never add
-- rows; a read row is reset to unread with a newer created_at; a second creator
-- gets its own row; a 200-character name is truncated; no ledger table exists.
--
-- NOT exercised: two concurrent transactions by one creator. One psql session
-- cannot interleave them. That case rests on pg_advisory_xact_lock keyed on the
-- creator, which serialises the find-or-insert so a second transaction sees the
-- first one's committed row and UPDATEs it.
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

-- Rows for one creator's link, counted as postgres.
CREATE FUNCTION pg_temp.t1395_rows(p_creator uuid) RETURNS integer
LANGUAGE sql AS $$
  SELECT count(*)::integer FROM public.notifications n
  WHERE n.type = 'club_awaiting_authorization'
    AND n.deep_link_url = '/admin/onboarding?creator=' || p_creator
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

-- Fixed-admin row for one creator (admin A, auth ...101).
CREATE FUNCTION pg_temp.t1395_admin_a_row(p_creator uuid)
RETURNS public.notifications
LANGUAGE sql AS $$
  SELECT n.* FROM public.notifications n
  WHERE n.type = 'club_awaiting_authorization'
    AND n.user_id = '00000000-0000-0000-0000-000001395101'
    AND n.deep_link_url = '/admin/onboarding?creator=' || p_creator
$$;

-- 1. Creator 1 inserts three clubs in separate statements: exactly one row per
--    admin, message names the LATEST club, unread.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395104', true);
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 A1');
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 A2');
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 A3');
RESET ROLE;

DO $$
DECLARE
  v_c1 uuid := '00000000-0000-0000-0000-000001395104';
  v_row public.notifications;
BEGIN
  IF pg_temp.t1395_admins() < 2 THEN
    RAISE EXCEPTION 'FAIL fixture should yield at least 2 active site admins, found %', pg_temp.t1395_admins();
  END IF;
  IF pg_temp.t1395_rows(v_c1) <> pg_temp.t1395_admins() THEN
    RAISE EXCEPTION 'FAIL notify_site_admins_club_awaiting_authorization: expected one row per admin (%), found %', pg_temp.t1395_admins(), pg_temp.t1395_rows(v_c1);
  END IF;
  v_row := pg_temp.t1395_admin_a_row(v_c1);
  IF v_row.message IS DISTINCT FROM 'Sam Secretary created clubs waiting for authorization, latest: MYK9-1395 A3.' THEN
    RAISE EXCEPTION 'FAIL the folded message does not name the latest club: %', v_row.message;
  END IF;
  IF v_row.read_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the folded row is not unread';
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: 3 clubs from one creator fold into one unread row per admin naming the latest club';
END;
$$;

-- 2. A read row resurfaces: mark it read and old, insert another club.
UPDATE public.notifications
SET read_at = now(), created_at = now() - interval '1 hour'
WHERE type = 'club_awaiting_authorization'
  AND deep_link_url = '/admin/onboarding?creator=00000000-0000-0000-0000-000001395104';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395104', true);
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 A4');
RESET ROLE;

DO $$
DECLARE
  v_c1 uuid := '00000000-0000-0000-0000-000001395104';
  v_row public.notifications := pg_temp.t1395_admin_a_row(v_c1);
BEGIN
  IF pg_temp.t1395_rows(v_c1) <> pg_temp.t1395_admins() THEN
    RAISE EXCEPTION 'FAIL a fourth club added rows: %', pg_temp.t1395_rows(v_c1);
  END IF;
  IF v_row.read_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the folded row stayed read';
  END IF;
  IF v_row.created_at <= now() - interval '30 minutes' THEN
    RAISE EXCEPTION 'FAIL created_at did not advance: %', v_row.created_at;
  END IF;
  IF v_row.message NOT LIKE '%latest: MYK9-1395 A4.' THEN
    RAISE EXCEPTION 'FAIL message not updated: %', v_row.message;
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: a read row resurfaces unread with a newer created_at';
END;
$$;

-- 3. A club inserted with deleted_at set and a cleared created_by add no rows
--    (nothing reads club state); either statement may be rejected by policy.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395104', true);
DO $$
BEGIN
  INSERT INTO public.clubs (name, deleted_at) VALUES ('MYK9-1395 D1', now());
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'INFO insert with deleted_at set was rejected: %', SQLERRM;
END;
$$;
DO $$
BEGIN
  UPDATE public.clubs SET created_by = NULL WHERE name = 'MYK9-1395 A1';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'INFO clearing created_by was rejected: %', SQLERRM;
END;
$$;
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 C1');
RESET ROLE;

DO $$
BEGIN
  IF pg_temp.t1395_rows('00000000-0000-0000-0000-000001395104') <> pg_temp.t1395_admins() THEN
    RAISE EXCEPTION 'FAIL deleted_at / cleared created_by added rows: %', pg_temp.t1395_rows('00000000-0000-0000-0000-000001395104');
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: deleted_at on insert and a cleared created_by add no rows';
END;
$$;

-- 4. Creator 2 gets its own row per admin; creator 1's rows are untouched.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395105', true);
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 B1');
RESET ROLE;

DO $$
BEGIN
  IF pg_temp.t1395_rows('00000000-0000-0000-0000-000001395105') <> pg_temp.t1395_admins() THEN
    RAISE EXCEPTION 'FAIL creator 2 did not get its own row per admin: %', pg_temp.t1395_rows('00000000-0000-0000-0000-000001395105');
  END IF;
  IF (SELECT count(*) FROM public.notifications
      WHERE type = 'club_awaiting_authorization'
        AND user_id = '00000000-0000-0000-0000-000001395101'
        AND deep_link_url LIKE '/admin/onboarding?creator=00000000-0000-0000-0000-00000139510%') <> 2 THEN
    RAISE EXCEPTION 'FAIL admin A should hold exactly two rows, one per creator';
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: a second creator gets its own row';
END;
$$;

-- 5. A multi-row insert stays one row per admin per creator.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395105', true);
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 M1'), ('MYK9-1395 M2'), ('MYK9-1395 M3');
RESET ROLE;

DO $$
BEGIN
  IF pg_temp.t1395_rows('00000000-0000-0000-0000-000001395105') <> pg_temp.t1395_admins() THEN
    RAISE EXCEPTION 'FAIL a 3-row insert changed the row count: %', pg_temp.t1395_rows('00000000-0000-0000-0000-000001395105');
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: a multi-row insert keeps one row per admin per creator';
END;
$$;

-- 6. A 200-character name is capped at 80 characters plus an ellipsis.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001395104', true);
INSERT INTO public.clubs (name) VALUES ('MYK9-1395 L' || repeat('x', 189));
RESET ROLE;

DO $$
DECLARE
  v_long text := 'MYK9-1395 L' || repeat('x', 189);
  v_row public.notifications := pg_temp.t1395_admin_a_row('00000000-0000-0000-0000-000001395104');
BEGIN
  IF v_row.message IS DISTINCT FROM 'Sam Secretary created clubs waiting for authorization, latest: ' || left(v_long, 80) || '....' THEN
    RAISE EXCEPTION 'FAIL the club name was not capped at 80 characters: %', v_row.message;
  END IF;
  IF v_row.deep_link_url IS DISTINCT FROM '/admin/onboarding?creator=00000000-0000-0000-0000-000001395104' THEN
    RAISE EXCEPTION 'FAIL unexpected deep link: %', v_row.deep_link_url;
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: a 200-character name is truncated and the deep link targets Admin Onboarding';
END;
$$;

-- 7. No ledger table is created by this change.
DO $$
BEGIN
  IF to_regclass('private.club_awaiting_authorization_notice_log') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL the notice ledger table exists';
  END IF;
  RAISE NOTICE 'PASS notify_site_admins_club_awaiting_authorization: no ledger table exists';
END;
$$;

ROLLBACK;
