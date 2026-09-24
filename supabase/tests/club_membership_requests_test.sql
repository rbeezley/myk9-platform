-- Behavioral test for club membership requests (MYK9-685) and the
-- once-only access-request email guard (MYK9-681). All fixtures roll back.
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
--      requester's own status reads is_member = true; a second ask is MK685.
--   6. A denial keeps its note, reads back as 'denied', and blocks a
--      resubmission (MK571).
--   7. anon cannot execute the submit RPC.
--   8. email_log_access_request_once_idx rejects a second claim for the same
--      (email_type, related_id, recipient), case-insensitively, and does not
--      touch other email types.
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
  ('00000000-0000-0000-0000-000000000d16', 'Other', 'Admin', 'myk9-685-other-admin@example.test');

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
    '00000000-0000-0000-0000-000000000d16'
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
  v_member boolean;
  v_status text;
BEGIN
  SELECT is_member, request_status INTO v_member, v_status
  FROM public.get_my_club_membership_request_status('00000000-0000-0000-0000-000000000d21');
  IF v_member IS NOT TRUE OR v_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'FAIL requester status after approval: member=%, status=%', v_member, v_status;
  END IF;

  BEGIN
    PERFORM public.submit_club_membership_request('00000000-0000-0000-0000-000000000d21', NULL);
    RAISE EXCEPTION 'FAIL an active member could ask to join again';
  EXCEPTION WHEN SQLSTATE 'MK685' THEN
    RAISE NOTICE 'PASS an active member cannot ask again (MK685)';
  END;

  RAISE NOTICE 'PASS requester reads is_member after approval';
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
  v_member boolean;
  v_status text;
  v_note text;
BEGIN
  SELECT is_member, request_status, reviewer_note INTO v_member, v_status, v_note
  FROM public.get_my_club_membership_request_status('00000000-0000-0000-0000-000000000d21');
  IF v_member OR v_status IS DISTINCT FROM 'denied'
     OR v_note IS DISTINCT FROM 'Membership is limited to residents of the county.' THEN
    RAISE EXCEPTION 'FAIL denied status read back as member=%, status=%, note=%',
      v_member, v_status, v_note;
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

-- ============================================================================
-- 8. Once-only access-request email claims.
-- ============================================================================

DO $$
DECLARE
  v_related uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.email_log (recipient_email, email_type, related_id, status)
  VALUES ('Mary@Example.test', 'access_request_membership_submitted', v_related, 'queued');

  BEGIN
    INSERT INTO public.email_log (recipient_email, email_type, related_id, status)
    VALUES ('mary@example.test', 'access_request_membership_submitted', v_related, 'queued');
    RAISE EXCEPTION 'FAIL a second access-request email claim was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS a second claim for the same access-request email is rejected';
  END;

  INSERT INTO public.email_log (recipient_email, email_type, related_id, status)
  VALUES ('mary@example.test', 'support_notification', v_related, 'sent'),
         ('mary@example.test', 'support_notification', v_related, 'sent');
  RAISE NOTICE 'PASS other email types are not constrained by the once-only index';
END;
$$;

ROLLBACK;
