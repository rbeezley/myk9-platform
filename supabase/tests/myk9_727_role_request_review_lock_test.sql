-- Behavioral test for MYK9-727: submit_role_request and every role-request
-- review RPC share one (person, club) advisory lock, and a deny followed by a
-- resubmission is refused as a standing denial. All fixtures roll back.
--
-- Covers:
--   1. submit_role_request, approve_club_role_request, deny_club_role_request,
--      approve_role_request and deny_role_request each hold the shared
--      (person, club) lock after they return (pg_locks, for pairs no earlier
--      statement touched, with a fixture guard proving none was held before).
--   2. Deny-then-resubmit: a club admin denies a pending club-scoped secretary
--      ask and the requester's resubmission raises MK571, with no second
--      pending row written.
--
-- A concurrent interleaving cannot be driven from one psql session, so 1 pins
-- the mechanism (the same lock key in all five RPCs, taken inside them) and 2
-- pins the outcome that mechanism protects. Mirrors section 12 of
-- club_membership_requests_test.sql (MYK9-685).
--
-- Identities follow club_routed_role_requests_test.sql: people are inserted
-- first with emails, then auth.users rows, and handle_new_user() adopts each
-- person by email, so role_requests.auth_user_id has a real auth.users row.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000007221', 'MYK9-727 Lock Test Club');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000007211', 'Club', 'Admin', 'myk9-727-club-admin@example.test'),
  ('00000000-0000-0000-0000-000000007212', 'Site', 'Admin', 'myk9-727-site-admin@example.test'),
  ('00000000-0000-0000-0000-00000000721a', 'Sam', 'Submit', 'myk9-727-sam@example.test'),
  ('00000000-0000-0000-0000-00000000721b', 'Dee', 'DenyClub', 'myk9-727-dee@example.test'),
  ('00000000-0000-0000-0000-00000000721c', 'Abe', 'ApproveClub', 'myk9-727-abe@example.test'),
  ('00000000-0000-0000-0000-00000000721d', 'Sid', 'DenySite', 'myk9-727-sid@example.test'),
  ('00000000-0000-0000-0000-00000000721e', 'Ava', 'ApproveSite', 'myk9-727-ava@example.test'),
  ('00000000-0000-0000-0000-00000000721f', 'Rae', 'Resubmit', 'myk9-727-rae@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000007201', 'myk9-727-club-admin@example.test'),
  ('00000000-0000-0000-0000-000000007202', 'myk9-727-site-admin@example.test'),
  ('00000000-0000-0000-0000-00000000720a', 'myk9-727-sam@example.test'),
  ('00000000-0000-0000-0000-00000000720b', 'myk9-727-dee@example.test'),
  ('00000000-0000-0000-0000-00000000720c', 'myk9-727-abe@example.test'),
  ('00000000-0000-0000-0000-00000000720d', 'myk9-727-sid@example.test'),
  ('00000000-0000-0000-0000-00000000720e', 'myk9-727-ava@example.test'),
  ('00000000-0000-0000-0000-00000000720f', 'myk9-727-rae@example.test')
) AS u(id, email);

DO $$
DECLARE
  v_unadopted int;
BEGIN
  SELECT count(*) INTO v_unadopted
  FROM public.people
  WHERE email LIKE 'myk9-727-%@example.test'
    AND auth_user_id IS NULL;

  IF v_unadopted <> 0 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not adopt % seeded people by email', v_unadopted;
  END IF;
END;
$$;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000007211', id, '00000000-0000-0000-0000-000000007221', true,
       '00000000-0000-0000-0000-000000007201'
FROM public.roles WHERE name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000007212', id, NULL, true,
       '00000000-0000-0000-0000-000000007202'
FROM public.roles WHERE name = 'site_admin';

-- Pending club-scoped secretary asks for the four review calls, inserted as
-- the superuser so no function has locked their pairs yet.
INSERT INTO public.role_requests (
  auth_user_id, person_id, requested_role, requested_scope, club_id, requester_note
)
VALUES
  ('00000000-0000-0000-0000-00000000720b', '00000000-0000-0000-0000-00000000721b',
   'secretary', 'club', '00000000-0000-0000-0000-000000007221', 'deny club'),
  ('00000000-0000-0000-0000-00000000720c', '00000000-0000-0000-0000-00000000721c',
   'secretary', 'club', '00000000-0000-0000-0000-000000007221', 'approve club'),
  ('00000000-0000-0000-0000-00000000720d', '00000000-0000-0000-0000-00000000721d',
   'secretary', 'club', '00000000-0000-0000-0000-000000007221', 'deny site'),
  ('00000000-0000-0000-0000-00000000720e', '00000000-0000-0000-0000-00000000721e',
   'secretary', 'club', '00000000-0000-0000-0000-000000007221', 'approve site');

SELECT set_config('myk9_727.dee', (SELECT id::text FROM public.role_requests
  WHERE person_id = '00000000-0000-0000-0000-00000000721b'), true);
SELECT set_config('myk9_727.abe', (SELECT id::text FROM public.role_requests
  WHERE person_id = '00000000-0000-0000-0000-00000000721c'), true);
SELECT set_config('myk9_727.sid', (SELECT id::text FROM public.role_requests
  WHERE person_id = '00000000-0000-0000-0000-00000000721d'), true);
SELECT set_config('myk9_727.ava', (SELECT id::text FROM public.role_requests
  WHERE person_id = '00000000-0000-0000-0000-00000000721e'), true);

-- True when THIS backend holds the pair's advisory lock. A bigint advisory key
-- shows in pg_locks as classid = high 32 bits, objid = low 32 bits, objsubid 1,
-- both as unsigned oids. Compare each half against the signed key masked to 32
-- bits: rebuilding a bigint from the oids is unsigned, so it never equals a
-- negative hashtext() key even when the lock is held.
CREATE FUNCTION pg_temp.myk9_727_pair_locked(p_person uuid) RETURNS boolean
LANGUAGE sql AS $$
  WITH k AS (
    SELECT hashtext('role_requests:00000000-0000-0000-0000-000000007221:' || p_person::text)::bigint AS key
  )
  SELECT EXISTS (
    SELECT 1 FROM pg_locks l, k
    WHERE l.locktype = 'advisory'
      AND l.pid = pg_backend_pid()
      AND l.objsubid = 1
      AND l.classid::bigint = ((k.key >> 32) & 4294967295)
      AND l.objid::bigint = (k.key & 4294967295)
  );
$$;

-- ============================================================================
-- 1. All five RPCs take the shared (person, club) lock.
-- ============================================================================

DO $$
BEGIN
  IF pg_temp.myk9_727_pair_locked('00000000-0000-0000-0000-00000000721a')
     OR pg_temp.myk9_727_pair_locked('00000000-0000-0000-0000-00000000721b')
     OR pg_temp.myk9_727_pair_locked('00000000-0000-0000-0000-00000000721c')
     OR pg_temp.myk9_727_pair_locked('00000000-0000-0000-0000-00000000721d')
     OR pg_temp.myk9_727_pair_locked('00000000-0000-0000-0000-00000000721e') THEN
    RAISE EXCEPTION 'FIXTURE a pair lock was already held before the calls under test';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000720a', true);
DO $$
BEGIN
  IF public.submit_role_request(
    'secretary', 'club', '00000000-0000-0000-0000-000000007221', NULL, 'I keep the books.'
  ) IS NULL THEN
    RAISE EXCEPTION 'FIXTURE submit_role_request returned NULL for a first ask';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000007201', true);
DO $$
BEGIN
  PERFORM public.deny_club_role_request(current_setting('myk9_727.dee')::uuid, NULL);
  PERFORM public.approve_club_role_request(current_setting('myk9_727.abe')::uuid, NULL);
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000007202', true);
DO $$
BEGIN
  PERFORM public.deny_role_request(current_setting('myk9_727.sid')::uuid, NULL);
  PERFORM public.approve_role_request(
    current_setting('myk9_727.ava')::uuid, '00000000-0000-0000-0000-000000007221', NULL, NULL
  );
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT pg_temp.myk9_727_pair_locked('00000000-0000-0000-0000-00000000721a') THEN
    RAISE EXCEPTION 'FAIL submit_role_request did not take the (person, club) lock';
  END IF;
  IF NOT pg_temp.myk9_727_pair_locked('00000000-0000-0000-0000-00000000721b') THEN
    RAISE EXCEPTION 'FAIL deny_club_role_request did not take the (person, club) lock';
  END IF;
  IF NOT pg_temp.myk9_727_pair_locked('00000000-0000-0000-0000-00000000721c') THEN
    RAISE EXCEPTION 'FAIL approve_club_role_request did not take the (person, club) lock';
  END IF;
  IF NOT pg_temp.myk9_727_pair_locked('00000000-0000-0000-0000-00000000721d') THEN
    RAISE EXCEPTION 'FAIL deny_role_request did not take the (person, club) lock';
  END IF;
  IF NOT pg_temp.myk9_727_pair_locked('00000000-0000-0000-0000-00000000721e') THEN
    RAISE EXCEPTION 'FAIL approve_role_request did not take the (person, club) lock';
  END IF;
  RAISE NOTICE 'PASS submit and all four review RPCs take the shared (person, club) lock';
END;
$$;

-- The review calls above really reviewed: the lock assertions are not riding
-- on calls that raised before reaching the lock.
DO $$
BEGIN
  IF (SELECT status FROM public.role_requests WHERE id = current_setting('myk9_727.dee')::uuid) <> 'denied'
     OR (SELECT status FROM public.role_requests WHERE id = current_setting('myk9_727.abe')::uuid) <> 'approved'
     OR (SELECT status FROM public.role_requests WHERE id = current_setting('myk9_727.sid')::uuid) <> 'denied'
     OR (SELECT status FROM public.role_requests WHERE id = current_setting('myk9_727.ava')::uuid) <> 'approved' THEN
    RAISE EXCEPTION 'FAIL a review call did not write its verdict';
  END IF;
  RAISE NOTICE 'PASS each review call wrote its verdict';
END;
$$;

-- ============================================================================
-- 2. Deny-then-resubmit is a standing denial (MK571), and writes no new row.
-- ============================================================================

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000720f', true);
DO $$
DECLARE
  v_request_id uuid;
BEGIN
  v_request_id := public.submit_role_request(
    'secretary', 'club', '00000000-0000-0000-0000-000000007221', NULL, 'Please appoint me.'
  );
  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'FIXTURE Rae''s first ask returned NULL';
  END IF;
  PERFORM set_config('myk9_727.rae', v_request_id::text, true);
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000007201', true);
DO $$
BEGIN
  PERFORM public.deny_club_role_request(current_setting('myk9_727.rae')::uuid, 'Not yet.');
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000720f', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.submit_role_request(
      'secretary', 'club', '00000000-0000-0000-0000-000000007221', NULL, 'Asking again.'
    );
    RAISE EXCEPTION 'FAIL a resubmission after a denial was accepted';
  EXCEPTION WHEN SQLSTATE 'MK571' THEN
    RAISE NOTICE 'PASS deny-then-resubmit raises the standing denial (MK571)';
  END;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT count(*) FROM public.role_requests
    WHERE person_id = '00000000-0000-0000-0000-00000000721f'
      AND status = 'pending'
  ) <> 0 THEN
    RAISE EXCEPTION 'FAIL a pending request exists after the refused resubmission';
  END IF;
  RAISE NOTICE 'PASS the refused resubmission left no pending request';
END;
$$;

ROLLBACK;
