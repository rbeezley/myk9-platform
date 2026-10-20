-- MYK9-1310: approving a club access request authorizes the club in the same
-- transaction, and a club inserted by a site admin starts authorized. A denial,
-- and a club inserted by a club-scoped secretary, leave authorized_at NULL.
--
-- Conventions match club_access_request_approval_test.sql: run with
-- psql -X -v ON_ERROR_STOP=1 after migrations; every fixture rolls back.
-- Only request.jwt.claim.sub is set, so auth.jwt() is NULL and
-- require_recent_reauth() treats the session as system (exempt), exactly as the
-- MYK9-682 approval test does.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000001310001', 'MYK9-1310 Existing Unauthorized Club'),
  ('00000000-0000-0000-0000-000001310002', 'MYK9-1310 Secretary Home Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001310011', 'MYK9', 'Requester', 'myk9-1310-requester@example.test', NULL),
  ('00000000-0000-0000-0000-000001310012', 'MYK9', 'Site Admin', 'myk9-1310-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000001310013', 'MYK9', 'Secretary', 'myk9-1310-secretary@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001310101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1310-requester@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001310102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1310-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001310103', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1310-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = CASE email
  WHEN 'myk9-1310-requester@example.test' THEN '00000000-0000-0000-0000-000001310101'::uuid
  WHEN 'myk9-1310-admin@example.test' THEN '00000000-0000-0000-0000-000001310102'::uuid
  WHEN 'myk9-1310-secretary@example.test' THEN '00000000-0000-0000-0000-000001310103'::uuid
END
WHERE email IN (
  'myk9-1310-requester@example.test',
  'myk9-1310-admin@example.test',
  'myk9-1310-secretary@example.test'
);

INSERT INTO public.user_roles (user_id, role_id, is_active, granted_by, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000001310012',
  id,
  true,
  '00000000-0000-0000-0000-000001310012',
  '00000000-0000-0000-0000-000001310102'
FROM public.roles
WHERE name = 'site_admin';

-- A club-scoped secretary: clubs_insert admits is_trial_secretary() (MYK9-572 left
-- that open on purpose), which is the self-service path that must stay unauthorized.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, granted_by, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000001310013',
  id,
  '00000000-0000-0000-0000-000001310002',
  true,
  '00000000-0000-0000-0000-000001310012',
  '00000000-0000-0000-0000-000001310103'
FROM public.roles
WHERE name = 'secretary';

INSERT INTO public.club_access_requests (
  id, requester_person_id, requester_auth_user_id, requested_club_name, request_note
)
VALUES
  ('00000000-0000-0000-0000-000001310021', '00000000-0000-0000-0000-000001310011',
   '00000000-0000-0000-0000-000001310101', 'MYK9-1310 New Club', 'new club'),
  ('00000000-0000-0000-0000-000001310022', '00000000-0000-0000-0000-000001310011',
   '00000000-0000-0000-0000-000001310101', 'MYK9-1310 Attach Request', 'attach to existing'),
  ('00000000-0000-0000-0000-000001310023', '00000000-0000-0000-0000-000001310011',
   '00000000-0000-0000-0000-000001310101', 'MYK9-1310 Denied Club', 'to be denied');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001310102', true);

-- 1. Approving with "create a new club" authorizes the new club, stamped by the reviewer,
--    with one club_authorized audit row.
DO $$
DECLARE
  v_club_id uuid;
  v_authorized_at timestamptz;
  v_authorized_by uuid;
  v_audit_count integer;
BEGIN
  SELECT public.review_club_access_request(
    '00000000-0000-0000-0000-000001310021', 'approved', NULL, NULL, NULL
  ) INTO v_club_id;

  SELECT authorized_at, authorized_by INTO v_authorized_at, v_authorized_by
  FROM public.clubs WHERE id = v_club_id;

  IF v_authorized_at IS NULL THEN
    RAISE EXCEPTION 'FAIL new-club approval left the club unauthorized';
  END IF;
  IF v_authorized_by IS DISTINCT FROM '00000000-0000-0000-0000-000001310012'::uuid THEN
    RAISE EXCEPTION 'FAIL new-club approval stamped authorized_by=% not the reviewer', v_authorized_by;
  END IF;

  SELECT count(*) INTO v_audit_count
  FROM public.permission_audit_log
  WHERE action = 'club_authorized' AND target_type = 'club' AND target_id = v_club_id;
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'FAIL expected one club_authorized audit row, found %', v_audit_count;
  END IF;

  -- Idempotent retry of an approved request: no churn, no second audit row.
  PERFORM public.review_club_access_request(
    '00000000-0000-0000-0000-000001310021', 'approved', NULL, NULL, NULL
  );
  IF (SELECT authorized_at FROM public.clubs WHERE id = v_club_id) IS DISTINCT FROM v_authorized_at THEN
    RAISE EXCEPTION 'FAIL re-approval re-stamped authorized_at';
  END IF;
  SELECT count(*) INTO v_audit_count
  FROM public.permission_audit_log
  WHERE action = 'club_authorized' AND target_type = 'club' AND target_id = v_club_id;
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'FAIL re-approval added a club_authorized audit row (now %)', v_audit_count;
  END IF;

  RAISE NOTICE 'PASS new-club approval authorizes the club once, stamped by the reviewer';
END;
$$;

-- 2. Approving onto an existing unauthorized club authorizes that club.
DO $$
DECLARE
  v_club_id uuid;
BEGIN
  SELECT public.review_club_access_request(
    '00000000-0000-0000-0000-000001310022', 'approved',
    '00000000-0000-0000-0000-000001310001', NULL, NULL
  ) INTO v_club_id;

  IF v_club_id <> '00000000-0000-0000-0000-000001310001'::uuid THEN
    RAISE EXCEPTION 'FAIL attach approval returned club %', v_club_id;
  END IF;
  IF (SELECT authorized_at FROM public.clubs WHERE id = v_club_id) IS NULL THEN
    RAISE EXCEPTION 'FAIL attach approval left the existing club unauthorized';
  END IF;

  RAISE NOTICE 'PASS attach approval authorizes the existing club';
END;
$$;

-- 3. Denial authorizes nothing and creates no club.
DO $$
DECLARE
  v_before integer;
  v_after integer;
BEGIN
  SELECT count(*) INTO v_before FROM public.clubs WHERE authorized_at IS NOT NULL;
  PERFORM public.review_club_access_request(
    '00000000-0000-0000-0000-000001310023', 'denied', NULL, NULL, 'not now'
  );
  SELECT count(*) INTO v_after FROM public.clubs WHERE authorized_at IS NOT NULL;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'FAIL denial changed the authorized club count % -> %', v_before, v_after;
  END IF;
  IF EXISTS (SELECT 1 FROM public.clubs WHERE name = 'MYK9-1310 Denied Club') THEN
    RAISE EXCEPTION 'FAIL denial created a club';
  END IF;

  RAISE NOTICE 'PASS denial authorizes nothing';
END;
$$;

-- 4. A club inserted by a site admin starts authorized, with the audit row.
DO $$
DECLARE
  v_club_id uuid;
  v_audit_count integer;
BEGIN
  INSERT INTO public.clubs (name) VALUES ('MYK9-1310 Admin Created Club')
  RETURNING id INTO v_club_id;

  IF (SELECT authorized_at FROM public.clubs WHERE id = v_club_id) IS NULL THEN
    RAISE EXCEPTION 'FAIL a site admin''s own Add Club is not authorized';
  END IF;
  IF (SELECT authorized_by FROM public.clubs WHERE id = v_club_id)
     IS DISTINCT FROM '00000000-0000-0000-0000-000001310012'::uuid THEN
    RAISE EXCEPTION 'FAIL admin-created club authorized_by is not the admin';
  END IF;
  SELECT count(*) INTO v_audit_count
  FROM public.permission_audit_log
  WHERE action = 'club_authorized' AND target_type = 'club' AND target_id = v_club_id;
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'FAIL expected one club_authorized audit row for the admin-created club, found %', v_audit_count;
  END IF;

  RAISE NOTICE 'PASS a site admin''s Add Club starts authorized';
END;
$$;

-- 5. A club inserted by a club-scoped secretary (the self-service wizard path) stays
--    unauthorized: MYK9-572's separate step still applies there.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001310103', true);

DO $$
DECLARE
  v_club_id uuid;
BEGIN
  INSERT INTO public.clubs (name) VALUES ('MYK9-1310 Secretary Created Club')
  RETURNING id INTO v_club_id;

  IF (SELECT authorized_at FROM public.clubs WHERE id = v_club_id) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a secretary''s self-created club came out authorized';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.permission_audit_log
    WHERE action = 'club_authorized' AND target_type = 'club' AND target_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'FAIL a secretary''s self-created club wrote a club_authorized audit row';
  END IF;

  RAISE NOTICE 'PASS a secretary''s self-created club stays unauthorized';
END;
$$;

ROLLBACK;
