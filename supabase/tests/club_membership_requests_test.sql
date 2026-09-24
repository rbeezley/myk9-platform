-- Behavioral test for club membership requests (MYK9-685). All fixtures roll
-- back.
--
-- Covers:
--   1. A requester submits a membership ask; a duplicate pending ask returns
--      NULL instead of a second row.
--   2. The requester reads their own row; an outsider reads none; nobody can
--      INSERT into the table directly (writes are RPC-only).
--   3. approve/deny give one 42501 verdict to an outsider, to another club's
--      admin, and for an id that does not exist.
--   4. list_club_membership_requests: this club's admin sees the ask; another
--      club's admin naming this club gets 42501; a NULL club is 42501.
--   5. Approval writes an ACTIVE club_members row and grants NO role; the
--      requester's own status reads 'member'; a second ask is MK685.
--   6. A denial keeps its note, reads back as 'denied', and blocks a
--      resubmission (MK571).
--   7. anon cannot execute the submit RPC.
--   9. A suspended member cannot ask to rejoin, and approving an ask that was
--      pending when the suspension landed does not lift the suspension.
--  10. Approval checks that the roster upsert actually wrote an active row:
--      when the write is skipped (standing in for a concurrent suspension
--      that makes ON CONFLICT ... WHERE match nothing), approval raises and
--      the request stays pending. A member the club added directly while the
--      ask was pending is still approved (the active row is confirmed).
--  11. get_my_club_membership_request_status returns exactly one state:
--      'none' for someone who never asked, 'pending' while an ask waits,
--      'member' for an active row, 'suspended' for a suspended row (even with
--      an ask pending), and 'none' again for a former member whose old ask
--      was approved -- the case a client used to infer, wrongly, for a
--      suspended member.
--  12. submit, approve and deny each take the shared (club, person) lock
--      before deciding, so a review cannot interleave with a resubmission
--      (proved by pg_locks for pairs no earlier statement touched; the
--      two-session interleaving itself is reproduced outside this runner).
--
-- People are inserted before auth.users so handle_new_user adopts each one
-- by email (same order as club_routed_role_requests_test.sql).

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000000d21', 'Membership Request Test Club'),
  ('00000000-0000-0000-0000-000000000d22', 'Membership Request Other Club');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000000d11', 'Club', 'Admin', 'myk9-685-club-admin@example.test'),
  ('00000000-0000-0000-0000-000000000d12', 'Mary', 'Member', 'myk9-685-mary@example.test'),
  ('00000000-0000-0000-0000-000000000d13', 'Oscar', 'Outside', 'myk9-685-oscar@example.test'),
  ('00000000-0000-0000-0000-000000000d15', 'Dana', 'Denied', 'myk9-685-dana@example.test'),
  ('00000000-0000-0000-0000-000000000d16', 'Other', 'Admin', 'myk9-685-other-admin@example.test'),
  ('00000000-0000-0000-0000-000000000d17', 'Sam', 'Suspended', 'myk9-685-sam@example.test'),
  ('00000000-0000-0000-0000-000000000d18', 'Lee', 'Lapsed', 'myk9-685-lee@example.test'),
  ('00000000-0000-0000-0000-000000000d19', 'Ann', 'Added', 'myk9-685-ann@example.test'),
  ('00000000-0000-0000-0000-000000000d1a', 'Pat', 'Pair', 'myk9-685-pat@example.test'),
  ('00000000-0000-0000-0000-000000000d1b', 'Dee', 'Denied', 'myk9-685-dee@example.test'),
  ('00000000-0000-0000-0000-000000000d1c', 'Abe', 'Approved', 'myk9-685-abe@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-685-club-admin@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-685-mary@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-685-oscar@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000d05', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-685-dana@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000d06', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-685-other-admin@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000d07', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-685-sam@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000d08', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-685-lee@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000d09', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-685-ann@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000d0a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-685-pat@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000d0b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-685-dee@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000d0c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-685-abe@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false);

DO $$
DECLARE
  v_unadopted int;
BEGIN
  SELECT count(*) INTO v_unadopted
  FROM public.people
  WHERE id = ANY(ARRAY[
    '00000000-0000-0000-0000-000000000d11',
    '00000000-0000-0000-0000-000000000d12',
    '00000000-0000-0000-0000-000000000d13',
    '00000000-0000-0000-0000-000000000d15',
    '00000000-0000-0000-0000-000000000d16',
    '00000000-0000-0000-0000-000000000d17',
    '00000000-0000-0000-0000-000000000d18',
    '00000000-0000-0000-0000-000000000d19',
    '00000000-0000-0000-0000-000000000d1a',
    '00000000-0000-0000-0000-000000000d1b',
    '00000000-0000-0000-0000-000000000d1c'
  ]::uuid[])
    AND auth_user_id IS NULL;

  IF v_unadopted <> 0 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not adopt % seeded people by email', v_unadopted;
  END IF;
END;
$$;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000000d11', id, '00000000-0000-0000-0000-000000000d21',
       true, '00000000-0000-0000-0000-000000000d01'
FROM public.roles WHERE name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000000d16', id, '00000000-0000-0000-0000-000000000d22',
       true, '00000000-0000-0000-0000-000000000d06'
FROM public.roles WHERE name = 'club_admin';

-- ============================================================================
-- 1. Mary submits; a duplicate pending ask returns NULL.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d02', true);

DO $$
DECLARE
  v_first uuid;
  v_second uuid;
BEGIN
  v_first := public.submit_club_membership_request(
    '00000000-0000-0000-0000-000000000d21', 'I have been showing with this club for years.'
  );
  IF v_first IS NULL THEN
    RAISE EXCEPTION 'FAIL first membership submit returned NULL';
  END IF;

  v_second := public.submit_club_membership_request('00000000-0000-0000-0000-000000000d21', NULL);
  IF v_second IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL duplicate pending membership ask was not swallowed: %', v_second;
  END IF;

  RAISE NOTICE 'PASS membership submit creates one pending ask; duplicate returns NULL';
END;
$$;

-- ============================================================================
-- 2. Own-row read; direct INSERT refused.
-- ============================================================================

DO $$
DECLARE
  v_visible int;
BEGIN
  SELECT count(*) INTO v_visible FROM public.club_membership_requests;
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'FAIL requester should read exactly their own ask, saw %', v_visible;
  END IF;

  BEGIN
    INSERT INTO public.club_membership_requests (club_id, person_id, auth_user_id)
    VALUES (
      '00000000-0000-0000-0000-000000000d22',
      '00000000-0000-0000-0000-000000000d12',
      '00000000-0000-0000-0000-000000000d02'
    );
    RAISE EXCEPTION 'FAIL authenticated inserted into club_membership_requests directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS direct INSERT into club_membership_requests is refused (42501)';
  END;

  RAISE NOTICE 'PASS requester reads their own membership ask';
END;
$$;

RESET ROLE;

SELECT set_config(
  'myk9_685.mary_request_id',
  (SELECT id::text FROM public.club_membership_requests
   WHERE person_id = '00000000-0000-0000-0000-000000000d12' AND status = 'pending'),
  true
);

DO $$
BEGIN
  IF coalesce(current_setting('myk9_685.mary_request_id', true), '') = '' THEN
    RAISE EXCEPTION 'FIXTURE could not resolve Mary''s pending membership request id';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d03', true);

DO $$
DECLARE
  v_visible int;
BEGIN
  SELECT count(*) INTO v_visible FROM public.club_membership_requests;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'FAIL outsider read % membership asks', v_visible;
  END IF;
  RAISE NOTICE 'PASS outsider reads no membership asks';
END;
$$;

-- ============================================================================
-- 3. One 42501 verdict: outsider, other club's admin, nonexistent id.
-- ============================================================================

DO $$
DECLARE
  v_id uuid := current_setting('myk9_685.mary_request_id')::uuid;
BEGIN
  BEGIN
    PERFORM public.approve_club_membership_request(v_id, NULL);
    RAISE EXCEPTION 'FAIL outsider approved a membership ask';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS outsider approval is rejected (42501)';
  END;

  BEGIN
    PERFORM public.deny_club_membership_request(v_id, NULL);
    RAISE EXCEPTION 'FAIL outsider denied a membership ask';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS outsider denial is rejected (42501)';
  END;

  BEGIN
    PERFORM public.approve_club_membership_request(gen_random_uuid(), NULL);
    RAISE EXCEPTION 'FAIL approving a nonexistent ask did not raise';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS nonexistent id gets the same 42501 verdict';
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d06', true);

DO $$
DECLARE
  v_id uuid := current_setting('myk9_685.mary_request_id')::uuid;
BEGIN
  BEGIN
    PERFORM public.approve_club_membership_request(v_id, NULL);
    RAISE EXCEPTION 'FAIL another club''s admin approved this club''s membership ask';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS another club''s admin cannot approve (42501)';
  END;

  BEGIN
    PERFORM * FROM public.list_club_membership_requests('00000000-0000-0000-0000-000000000d21');
    RAISE EXCEPTION 'FAIL another club''s admin listed this club''s membership asks';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS another club''s admin cannot list this club (42501)';
  END;

  BEGIN
    PERFORM * FROM public.list_club_membership_requests(NULL);
    RAISE EXCEPTION 'FAIL list_club_membership_requests(NULL) returned';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS list_club_membership_requests(NULL) is 42501';
  END;
END;
$$;

-- ============================================================================
-- 4/5. This club's admin lists and approves; membership is written, no role.
-- ============================================================================

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d01', true);

DO $$
DECLARE
  v_id uuid := current_setting('myk9_685.mary_request_id')::uuid;
  v_listed int;
BEGIN
  SELECT count(*) INTO v_listed
  FROM public.list_club_membership_requests('00000000-0000-0000-0000-000000000d21')
  WHERE id = v_id AND requester_email = 'myk9-685-mary@example.test';
  IF v_listed <> 1 THEN
    RAISE EXCEPTION 'FAIL club admin did not see the pending ask (% rows)', v_listed;
  END IF;

  PERFORM public.approve_club_membership_request(v_id, 'Welcome aboard');
  RAISE NOTICE 'PASS club admin lists and approves the membership ask';
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_status text;
  v_roles int;
BEGIN
  SELECT membership_status INTO v_status
  FROM public.club_members
  WHERE club_id = '00000000-0000-0000-0000-000000000d21'
    AND person_id = '00000000-0000-0000-0000-000000000d12';
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FAIL approval did not write an active club_members row (got %)', v_status;
  END IF;

  -- Signup gives every person a platform-wide exhibitor role; what must NOT
  -- appear is anything scoped to this club.
  SELECT count(*) INTO v_roles
  FROM public.user_roles
  WHERE user_id = '00000000-0000-0000-0000-000000000d12'
    AND club_id IS NOT NULL;
  IF v_roles <> 0 THEN
    RAISE EXCEPTION 'FAIL membership approval granted % club-scoped role rows', v_roles;
  END IF;

  IF (SELECT status FROM public.club_membership_requests
      WHERE id = current_setting('myk9_685.mary_request_id')::uuid) <> 'approved' THEN
    RAISE EXCEPTION 'FAIL approved ask did not flip to approved';
  END IF;

  RAISE NOTICE 'PASS approval writes an active membership and grants no role';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d02', true);

DO $$
DECLARE
  v_state text;
BEGIN
  SELECT state INTO v_state
  FROM public.get_my_club_membership_request_status('00000000-0000-0000-0000-000000000d21');
  IF v_state IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION 'FAIL requester state after approval: %', v_state;
  END IF;

  BEGIN
    PERFORM public.submit_club_membership_request('00000000-0000-0000-0000-000000000d21', NULL);
    RAISE EXCEPTION 'FAIL an active member could ask to join again';
  EXCEPTION WHEN SQLSTATE 'MK685' THEN
    RAISE NOTICE 'PASS an active member cannot ask again (MK685)';
  END;

  RAISE NOTICE 'PASS requester reads state member after approval';
END;
$$;

-- ============================================================================
-- 6. Dana asks, is denied with a note, and cannot resubmit.
-- ============================================================================

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d05', true);

DO $$
BEGIN
  PERFORM public.submit_club_membership_request('00000000-0000-0000-0000-000000000d21', NULL);
END;
$$;

RESET ROLE;

SELECT set_config(
  'myk9_685.dana_request_id',
  (SELECT id::text FROM public.club_membership_requests
   WHERE person_id = '00000000-0000-0000-0000-000000000d15' AND status = 'pending'),
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d01', true);

DO $$
BEGIN
  PERFORM public.deny_club_membership_request(
    current_setting('myk9_685.dana_request_id')::uuid,
    'Membership is limited to residents of the county.'
  );
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d05', true);

DO $$
DECLARE
  v_state text;
  v_note text;
BEGIN
  SELECT state, reviewer_note INTO v_state, v_note
  FROM public.get_my_club_membership_request_status('00000000-0000-0000-0000-000000000d21');
  IF v_state IS DISTINCT FROM 'denied'
     OR v_note IS DISTINCT FROM 'Membership is limited to residents of the county.' THEN
    RAISE EXCEPTION 'FAIL denied state read back as %, note=%', v_state, v_note;
  END IF;

  BEGIN
    PERFORM public.submit_club_membership_request('00000000-0000-0000-0000-000000000d21', NULL);
    RAISE EXCEPTION 'FAIL a denied requester resubmitted';
  EXCEPTION WHEN SQLSTATE 'MK571' THEN
    RAISE NOTICE 'PASS a standing denial blocks resubmission (MK571)';
  END;

  RAISE NOTICE 'PASS denial note and status read back to the requester';
END;
$$;

RESET ROLE;

-- ============================================================================
-- 9. Suspension survives the membership-request path.
-- ============================================================================

-- Sam asks while still a (lapsed) former member; the club then suspends him.
INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES ('00000000-0000-0000-0000-000000000d21', '00000000-0000-0000-0000-000000000d17', 'lapsed');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d07', true);

DO $$
BEGIN
  IF public.submit_club_membership_request('00000000-0000-0000-0000-000000000d21', NULL) IS NULL THEN
    RAISE EXCEPTION 'FAIL a lapsed former member could not ask to rejoin';
  END IF;
  RAISE NOTICE 'PASS a lapsed former member can ask to rejoin';
END;
$$;

RESET ROLE;

UPDATE public.club_members SET membership_status = 'suspended'
WHERE club_id = '00000000-0000-0000-0000-000000000d21'
  AND person_id = '00000000-0000-0000-0000-000000000d17';

SELECT set_config(
  'myk9_685.sam_request_id',
  (SELECT id::text FROM public.club_membership_requests
   WHERE person_id = '00000000-0000-0000-0000-000000000d17' AND status = 'pending'),
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d01', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.approve_club_membership_request(
      current_setting('myk9_685.sam_request_id')::uuid, NULL
    );
    RAISE EXCEPTION 'FAIL approving a membership ask lifted a suspension';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    RAISE NOTICE 'PASS approving an ask does not lift a suspension (23514)';
  END;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF (SELECT membership_status FROM public.club_members
      WHERE club_id = '00000000-0000-0000-0000-000000000d21'
        AND person_id = '00000000-0000-0000-0000-000000000d17') <> 'suspended' THEN
    RAISE EXCEPTION 'FAIL the suspension did not survive the approval attempt';
  END IF;
  RAISE NOTICE 'PASS the membership is still suspended';
END;
$$;

-- The pending ask is withdrawn by denial; a fresh ask from the suspended
-- member is refused at the door.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d01', true);
DO $$
BEGIN
  PERFORM public.deny_club_membership_request(
    current_setting('myk9_685.sam_request_id')::uuid, NULL
  );
END;
$$;

RESET ROLE;

-- Clear the denial so only the suspension can block the next ask.
UPDATE public.club_membership_requests SET status = 'approved'
WHERE id = current_setting('myk9_685.sam_request_id')::uuid;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d07', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_club_membership_request('00000000-0000-0000-0000-000000000d21', NULL);
    RAISE EXCEPTION 'FAIL a suspended member could ask to rejoin';
  EXCEPTION WHEN SQLSTATE 'MK571' THEN
    RAISE NOTICE 'PASS a suspended member cannot ask to rejoin (MK571)';
  END;
END;
$$;

RESET ROLE;

-- ============================================================================
-- 10. Approval confirms the roster write.
-- ============================================================================

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES ('00000000-0000-0000-0000-000000000d21', '00000000-0000-0000-0000-000000000d18', 'lapsed');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d08', true);
DO $$ BEGIN
  PERFORM public.submit_club_membership_request('00000000-0000-0000-0000-000000000d21', NULL);
END $$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d09', true);
DO $$ BEGIN
  PERFORM public.submit_club_membership_request('00000000-0000-0000-0000-000000000d21', NULL);
END $$;
RESET ROLE;

SELECT set_config('myk9_685.lee_request_id',
  (SELECT id::text FROM public.club_membership_requests
   WHERE person_id = '00000000-0000-0000-0000-000000000d18' AND status = 'pending'), true);
SELECT set_config('myk9_685.ann_request_id',
  (SELECT id::text FROM public.club_membership_requests
   WHERE person_id = '00000000-0000-0000-0000-000000000d19' AND status = 'pending'), true);

-- Stand-in for the interleaving: a BEFORE UPDATE trigger that drops the write,
-- exactly what ON CONFLICT ... DO UPDATE ... WHERE does when a concurrent
-- transaction has changed the row to a status the WHERE excludes.
CREATE FUNCTION pg_temp.myk9_685_skip_update() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
CREATE TRIGGER myk9_685_skip_lee BEFORE UPDATE ON public.club_members
  FOR EACH ROW WHEN (OLD.person_id = '00000000-0000-0000-0000-000000000d18')
  EXECUTE FUNCTION pg_temp.myk9_685_skip_update();

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d01', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.approve_club_membership_request(
      current_setting('myk9_685.lee_request_id')::uuid, NULL
    );
    RAISE EXCEPTION 'FAIL approval succeeded although no active roster row was written';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    RAISE NOTICE 'PASS approval raises when the roster write did not land (23514)';
  END;
END;
$$;

RESET ROLE;
DROP TRIGGER myk9_685_skip_lee ON public.club_members;

DO $$
BEGIN
  IF (SELECT status FROM public.club_membership_requests
      WHERE id = current_setting('myk9_685.lee_request_id')::uuid) <> 'pending' THEN
    RAISE EXCEPTION 'FAIL the request was marked reviewed although the roster write failed';
  END IF;
  RAISE NOTICE 'PASS the request stays pending when the roster write did not land';
END;
$$;

-- Ann is added to the roster directly while her ask is pending: approval
-- confirms the existing active row and succeeds.
INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES ('00000000-0000-0000-0000-000000000d21', '00000000-0000-0000-0000-000000000d19', 'active');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d01', true);
DO $$
BEGIN
  PERFORM public.approve_club_membership_request(
    current_setting('myk9_685.ann_request_id')::uuid, NULL
  );
  RAISE NOTICE 'PASS an ask from someone already added directly is approved';
END;
$$;
RESET ROLE;

-- ============================================================================
-- 11. One server-computed state.
-- ============================================================================

CREATE FUNCTION pg_temp.myk9_685_state_as(p_auth uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_state text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
  SET LOCAL ROLE authenticated;
  SELECT state INTO v_state
  FROM public.get_my_club_membership_request_status('00000000-0000-0000-0000-000000000d21');
  RESET ROLE;
  RETURN v_state;
END $$;

DO $$
DECLARE
  v_state text;
BEGIN
  -- Oscar never asked this club.
  v_state := pg_temp.myk9_685_state_as('00000000-0000-0000-0000-000000000d03');
  IF v_state IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION 'FAIL someone who never asked reads %, expected none', v_state;
  END IF;

  -- Mary was approved and is active.
  v_state := pg_temp.myk9_685_state_as('00000000-0000-0000-0000-000000000d02');
  IF v_state IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION 'FAIL an active member reads %, expected member', v_state;
  END IF;

  -- Sam is suspended (section 9).
  v_state := pg_temp.myk9_685_state_as('00000000-0000-0000-0000-000000000d07');
  IF v_state IS DISTINCT FROM 'suspended' THEN
    RAISE EXCEPTION 'FAIL a suspended member reads %, expected suspended', v_state;
  END IF;

  -- Lee's ask is still pending (section 10).
  v_state := pg_temp.myk9_685_state_as('00000000-0000-0000-0000-000000000d08');
  IF v_state IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'FAIL a pending asker reads %, expected pending', v_state;
  END IF;

  -- Lee is suspended while the ask is pending: suspended wins.
  UPDATE public.club_members SET membership_status = 'suspended'
  WHERE club_id = '00000000-0000-0000-0000-000000000d21'
    AND person_id = '00000000-0000-0000-0000-000000000d18';
  v_state := pg_temp.myk9_685_state_as('00000000-0000-0000-0000-000000000d08');
  IF v_state IS DISTINCT FROM 'suspended' THEN
    RAISE EXCEPTION 'FAIL a suspended member with a pending ask reads %, expected suspended', v_state;
  END IF;

  -- Mary's membership lapses: her old approved ask no longer applies.
  UPDATE public.club_members SET membership_status = 'lapsed'
  WHERE club_id = '00000000-0000-0000-0000-000000000d21'
    AND person_id = '00000000-0000-0000-0000-000000000d12';
  v_state := pg_temp.myk9_685_state_as('00000000-0000-0000-0000-000000000d02');
  IF v_state IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION 'FAIL a former member reads %, expected none', v_state;
  END IF;

  RAISE NOTICE 'PASS the status RPC returns one state: none, member, suspended, pending, none after lapse';
END;
$$;

-- ============================================================================
-- 12. The shared (club, person) lock.
-- ============================================================================

-- True when THIS backend holds the pair's advisory lock. A bigint advisory key
-- shows in pg_locks as classid = high 32 bits, objid = low 32 bits, objsubid 1.
CREATE FUNCTION pg_temp.myk9_685_pair_locked(p_club uuid, p_person uuid) RETURNS boolean
LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_locks l
    WHERE l.locktype = 'advisory'
      AND l.pid = pg_backend_pid()
      AND l.objsubid = 1
      AND ((l.classid::bigint << 32) | l.objid::bigint)
          = hashtext('club_membership_requests:' || p_club::text || ':' || p_person::text)::bigint
  );
$$;

-- Dee's and Abe's asks are inserted directly, so no function has locked
-- their pairs yet.
INSERT INTO public.club_membership_requests (club_id, person_id, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000000d21', '00000000-0000-0000-0000-000000000d1b',
   '00000000-0000-0000-0000-000000000d0b'),
  ('00000000-0000-0000-0000-000000000d21', '00000000-0000-0000-0000-000000000d1c',
   '00000000-0000-0000-0000-000000000d0c');

SELECT set_config('myk9_685.dee_request_id',
  (SELECT id::text FROM public.club_membership_requests
   WHERE person_id = '00000000-0000-0000-0000-000000000d1b'), true);
SELECT set_config('myk9_685.abe_request_id',
  (SELECT id::text FROM public.club_membership_requests
   WHERE person_id = '00000000-0000-0000-0000-000000000d1c'), true);

DO $$
BEGIN
  IF pg_temp.myk9_685_pair_locked('00000000-0000-0000-0000-000000000d21', '00000000-0000-0000-0000-000000000d1a')
     OR pg_temp.myk9_685_pair_locked('00000000-0000-0000-0000-000000000d21', '00000000-0000-0000-0000-000000000d1b')
     OR pg_temp.myk9_685_pair_locked('00000000-0000-0000-0000-000000000d21', '00000000-0000-0000-0000-000000000d1c') THEN
    RAISE EXCEPTION 'FIXTURE a pair lock was already held before the calls under test';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d0a', true);
DO $$ BEGIN
  PERFORM public.submit_club_membership_request('00000000-0000-0000-0000-000000000d21', NULL);
END $$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d01', true);
DO $$ BEGIN
  PERFORM public.deny_club_membership_request(current_setting('myk9_685.dee_request_id')::uuid, NULL);
  PERFORM public.approve_club_membership_request(current_setting('myk9_685.abe_request_id')::uuid, NULL);
END $$;
RESET ROLE;

DO $$
BEGIN
  IF NOT pg_temp.myk9_685_pair_locked('00000000-0000-0000-0000-000000000d21', '00000000-0000-0000-0000-000000000d1a') THEN
    RAISE EXCEPTION 'FAIL submit did not take the (club, person) lock';
  END IF;
  IF NOT pg_temp.myk9_685_pair_locked('00000000-0000-0000-0000-000000000d21', '00000000-0000-0000-0000-000000000d1b') THEN
    RAISE EXCEPTION 'FAIL deny did not take the (club, person) lock';
  END IF;
  IF NOT pg_temp.myk9_685_pair_locked('00000000-0000-0000-0000-000000000d21', '00000000-0000-0000-0000-000000000d1c') THEN
    RAISE EXCEPTION 'FAIL approve did not take the (club, person) lock';
  END IF;
  RAISE NOTICE 'PASS submit, deny and approve all take the shared (club, person) lock';
END;
$$;

-- ============================================================================
-- 7. anon cannot execute the submit RPC.
-- ============================================================================

SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_club_membership_request('00000000-0000-0000-0000-000000000d21', NULL);
    RAISE EXCEPTION 'FAIL anon executed submit_club_membership_request';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS anon cannot execute submit_club_membership_request';
  END;
END;
$$;

RESET ROLE;

ROLLBACK;
