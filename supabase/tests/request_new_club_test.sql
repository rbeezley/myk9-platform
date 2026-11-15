-- MYK9-2046: request_new_club() creates the club at once for the signed-in caller.
-- Covers: anon refused; signed-in caller gets an unauthorized club with admin,
-- secretary and member rows, registry numbers and a pending request; a repeat
-- returns the same club; a taken name (any case or spacing) is refused; the owner's
-- approve confirms that club; decline marks the request denied and removes nothing,
-- even when the club was already deleted. All fixtures and role changes roll back.
-- Only request.jwt.claim.sub is set, so auth.jwt() is NULL and
-- require_recent_reauth() treats the session as system (as the MYK9-682 test does).

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000002046001', 'MYK9-2046 Existing Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000002046011', 'MYK9', 'Requester', 'myk9-2046-requester@example.test', NULL),
  ('00000000-0000-0000-0000-000002046012', 'MYK9', 'Site Admin', 'myk9-2046-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000002046013', 'MYK9', 'Other', 'myk9-2046-other@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000002046101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2046-requester@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002046102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2046-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002046103', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2046-other@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = CASE email
  WHEN 'myk9-2046-requester@example.test' THEN '00000000-0000-0000-0000-000002046101'::uuid
  WHEN 'myk9-2046-admin@example.test' THEN '00000000-0000-0000-0000-000002046102'::uuid
  WHEN 'myk9-2046-other@example.test' THEN '00000000-0000-0000-0000-000002046103'::uuid
END
WHERE email IN (
  'myk9-2046-requester@example.test',
  'myk9-2046-admin@example.test',
  'myk9-2046-other@example.test'
);

INSERT INTO public.user_roles (user_id, role_id, is_active, granted_by, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000002046012',
  id,
  true,
  '00000000-0000-0000-0000-000002046012',
  '00000000-0000-0000-0000-000002046102'
FROM public.roles
WHERE name = 'site_admin';

-- 1. Anon cannot call it.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.request_new_club('MYK9-2046 Anon Club', '{"AKC":"1"}'::jsonb);
    RAISE EXCEPTION 'FAIL 2046.1 anon created a club';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 2046.1 anon is refused';
  END;
END;
$$;
RESET ROLE;

-- 2. A signed-in user gets the club, the roles and the request in one call.
CREATE TEMP TABLE result_first (r jsonb);
CREATE TEMP TABLE result_second (r jsonb);
GRANT ALL ON result_first, result_second TO PUBLIC;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002046101', true);
INSERT INTO result_first
SELECT public.request_new_club(
  '  MYK9-2046   New Club ', '{"AKC":"12345"}'::jsonb, 'Contact: Requester', NULL
);
RESET ROLE;

DO $$
DECLARE
  v_r jsonb := (SELECT r FROM result_first);
  v_club uuid := (v_r->>'club_id')::uuid;
BEGIN
  IF (v_r->>'already_requested')::boolean THEN
    RAISE EXCEPTION 'FAIL 2046.2 first call reported already_requested';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clubs
    WHERE id = v_club AND name = 'MYK9-2046 New Club' AND authorized_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL 2046.2 club missing, misnamed or already authorized';
  END IF;
  IF (
    SELECT count(DISTINCT r.name)
    FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = '00000000-0000-0000-0000-000002046011'
      AND ur.club_id = v_club AND ur.show_id IS NULL AND ur.is_active
      AND r.name IN ('club_admin', 'secretary')
  ) <> 2 THEN
    RAISE EXCEPTION 'FAIL 2046.2 requester is not both club admin and secretary';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = v_club AND person_id = '00000000-0000-0000-0000-000002046011'
      AND membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'FAIL 2046.2 requester is not an active member';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.club_registry_numbers
    WHERE club_id = v_club AND organization = 'AKC' AND number = '12345'
  ) THEN
    RAISE EXCEPTION 'FAIL 2046.2 registry number not stored';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.club_access_requests
    WHERE id = (v_r->>'request_id')::uuid AND status = 'pending'
      AND created_club_id = v_club
      AND requester_auth_user_id = '00000000-0000-0000-0000-000002046101'
  ) THEN
    RAISE EXCEPTION 'FAIL 2046.2 pending request not filed against the club';
  END IF;
  RAISE NOTICE 'PASS 2046.2 club, roles, member, numbers and request created together';
END;
$$;

-- 3. Same request again returns the same club; a taken name is refused.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002046101', true);
DO $$
DECLARE
  v_first jsonb := (SELECT r FROM result_first);
  v_again jsonb;
BEGIN
  v_again := public.request_new_club('myk9-2046 new club', '{"AKC":"12345"}'::jsonb);
  IF v_again->>'club_id' <> v_first->>'club_id'
     OR NOT (v_again->>'already_requested')::boolean THEN
    RAISE EXCEPTION 'FAIL 2046.3 repeat did not return the same club';
  END IF;
  RAISE NOTICE 'PASS 2046.3 repeat returns the same club';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002046103', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.request_new_club('  myk9-2046   EXISTING club', '{"AKC":"9"}'::jsonb);
    RAISE EXCEPTION 'FAIL 2046.4 a taken name was accepted';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM <> 'club_name_taken' THEN
      RAISE EXCEPTION 'FAIL 2046.4 wrong message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS 2046.4 a taken name is refused';
  END;
  BEGIN
    PERFORM public.request_new_club('MYK9-2046 Other Club', '{}'::jsonb);
    RAISE EXCEPTION 'FAIL 2046.5 a request with no club number was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS 2046.5 no club number is refused';
  END;
END;
$$;
RESET ROLE;

-- 4. Decline removes nothing: the club and its draft show stay, the request is denied.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
SELECT '00000000-0000-0000-0000-000002046201', 'MYK9-2046 Draft Show', 'AKC',
       DATE '2027-03-01', DATE '2027-03-02', (r->>'club_id')::uuid, 'draft'
FROM result_first;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002046102', true);
SET LOCAL ROLE authenticated;
SELECT public.review_club_access_request(
  (SELECT (r->>'request_id')::uuid FROM result_first), 'denied', NULL, NULL, 'No'
);
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM public.clubs
       WHERE id = (SELECT (r->>'club_id')::uuid FROM result_first) AND deleted_at IS NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.shows
       WHERE id = '00000000-0000-0000-0000-000002046201' AND deleted_at IS NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.club_access_requests
       WHERE id = (SELECT (r->>'request_id')::uuid FROM result_first)
         AND status = 'denied' AND review_note = 'No'
     ) THEN
    RAISE EXCEPTION 'FAIL 2046.6 decline removed something or did not deny the request';
  END IF;
  RAISE NOTICE 'PASS 2046.6 decline marks the request denied and removes nothing';
END;
$$;

-- 5. Approving a fresh request confirms its club.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002046101', true);
INSERT INTO result_second
SELECT public.request_new_club('MYK9-2046 Second Club', '{"UKC":"U7"}'::jsonb);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002046102', true);
SELECT public.review_club_access_request(
  (SELECT (r->>'request_id')::uuid FROM result_second), 'approved', NULL, 'Ignored Name', NULL
);
RESET ROLE;

DO $$
DECLARE
  v_r jsonb := (SELECT r FROM result_second);
BEGIN
  IF (v_r->>'club_id') = (SELECT r->>'club_id' FROM result_first)
     OR NOT EXISTS (
       SELECT 1 FROM public.clubs
       WHERE id = (v_r->>'club_id')::uuid AND name = 'MYK9-2046 Second Club'
         AND authorized_at IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.club_access_requests
       WHERE id = (v_r->>'request_id')::uuid AND status = 'approved'
         AND approved_club_id = (v_r->>'club_id')::uuid
     )
     OR (SELECT count(*) FROM public.clubs WHERE name = 'Ignored Name') <> 0 THEN
    RAISE EXCEPTION 'FAIL 2046.8 approval did not confirm and authorize the created club';
  END IF;
  RAISE NOTICE 'PASS 2046.8 approval authorizes the created club';
END;
$$;

-- 6. A caller who last confirmed her password an hour ago still gets her club (the RPC
-- must not call grant_club_secretary, which demands a recent confirmation).
CREATE TEMP TABLE result_third (r jsonb);
GRANT ALL ON result_third TO PUBLIC;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000002046101',
    'role', 'authenticated',
    'amr', json_build_array(
      json_build_object('method', 'password', 'timestamp', extract(epoch FROM now())::bigint - 3600)
    )
  )::text,
  true
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002046101', true);
INSERT INTO result_third
SELECT public.request_new_club('MYK9-2046 Third Club', '{"AKC":"3"}'::jsonb);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

DO $$
DECLARE
  v_club uuid := (SELECT (r->>'club_id')::uuid FROM result_third);
BEGIN
  IF (
    SELECT count(DISTINCT r.name)
    FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = '00000000-0000-0000-0000-000002046011'
      AND ur.club_id = v_club AND ur.is_active AND r.name IN ('club_admin', 'secretary')
  ) <> 2 OR NOT EXISTS (
    SELECT 1 FROM public.permission_audit_log
    WHERE action = 'club_secretary_granted'
      AND new_value->>'club_id' = v_club::text
  ) THEN
    RAISE EXCEPTION 'FAIL 2046.9 old sign-in did not get admin, secretary and audit row';
  END IF;
  RAISE NOTICE 'PASS 2046.9 works for a caller whose password confirmation is an hour old';
END;
$$;

-- 7. A punctuation variant of a taken name is refused as taken, not as a raw index error.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002046103', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.request_new_club('myk9-2046: third  CLUB!', '{"AKC":"4"}'::jsonb);
    RAISE EXCEPTION 'FAIL 2046.10 a punctuation variant of a taken name was accepted';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM <> 'club_name_taken' THEN
      RAISE EXCEPTION 'FAIL 2046.10 wrong message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS 2046.10 punctuation variant is club_name_taken';
  END;
END;
$$;
RESET ROLE;

-- 8. Approving a request whose club was deleted is refused in plain words.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002046102', true);
SET LOCAL ROLE authenticated;
SELECT public.soft_delete_club((SELECT (r->>'club_id')::uuid FROM result_third));
DO $$
BEGIN
  BEGIN
    PERFORM public.review_club_access_request(
      (SELECT (r->>'request_id')::uuid FROM result_third), 'approved', NULL, NULL, NULL
    );
    RAISE EXCEPTION 'FAIL 2046.11 approved a request whose club was deleted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%has been deleted%' THEN
      RAISE EXCEPTION 'FAIL 2046.11 wrong message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS 2046.11 approval of a deleted club is refused';
  END;
END;
$$;
RESET ROLE;

-- 9. Declining a request whose club is already deleted still succeeds and denies it.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002046102', true);
SET LOCAL ROLE authenticated;
SELECT public.review_club_access_request(
  (SELECT (r->>'request_id')::uuid FROM result_third), 'denied', NULL, NULL, NULL
);
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.club_access_requests
    WHERE id = (SELECT (r->>'request_id')::uuid FROM result_third) AND status = 'denied'
  ) THEN
    RAISE EXCEPTION 'FAIL 2046.12 decline of a deleted-club request did not deny it';
  END IF;
  RAISE NOTICE 'PASS 2046.12 decline works when the club is already deleted';
END;
$$;

-- 10. An older pending request with the same name is upgraded, not duplicated.
INSERT INTO public.club_access_requests (
  id, requester_person_id, requester_auth_user_id, requested_club_name
) VALUES (
  '00000000-0000-0000-0000-000002046301',
  '00000000-0000-0000-0000-000002046013',
  '00000000-0000-0000-0000-000002046103',
  'MYK9-2046 Older Path Club'
);
CREATE TEMP TABLE result_fourth (r jsonb);
GRANT ALL ON result_fourth TO PUBLIC;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002046103', true);
INSERT INTO result_fourth
SELECT public.request_new_club('MYK9-2046 Older Path Club', '{"ASCA":"A1"}'::jsonb, 'My note');
RESET ROLE;
DO $$
DECLARE
  v_r jsonb := (SELECT r FROM result_fourth);
BEGIN
  IF v_r->>'request_id' <> '00000000-0000-0000-0000-000002046301'
     OR (SELECT count(*) FROM public.club_access_requests
         WHERE requester_person_id = '00000000-0000-0000-0000-000002046013'
           AND lower(requested_club_name) = 'myk9-2046 older path club') <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.club_access_requests
       WHERE id = '00000000-0000-0000-0000-000002046301' AND status = 'pending'
         AND created_club_id = (v_r->>'club_id')::uuid
         AND request_note = 'My note' AND club_numbers = '{"ASCA":"A1"}'::jsonb
     ) THEN
    RAISE EXCEPTION 'FAIL 2046.13 the older pending request was not upgraded in place';
  END IF;
  RAISE NOTICE 'PASS 2046.13 older pending request upgraded to the new club';
END;
$$;

ROLLBACK;
