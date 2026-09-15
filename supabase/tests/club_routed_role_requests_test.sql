-- Behavioral test for the club-routed show-access request flow (MYK9-571).
-- All fixtures and role changes roll back.
--
-- Covers:
--   1. A non-admin of the request's club cannot approve it (42501).
--   2. A club admin's approval grants the club-scoped secretary role via
--      grant_club_secretary and writes a permission_audit_log row — the same
--      grant path a direct appointment uses.
--   3. A duplicate pending submit is swallowed (NULL id), not an error.
--   4. A denial blocks a resubmission of the exact same request (YMKDN).
--   5. A requester cannot read another person's role_requests row.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000000b21', 'Routed Request Test Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  (
    '00000000-0000-0000-0000-000000000b11',
    'Club',
    'Administrator',
    '00000000-0000-0000-0000-000000000b01'
  ),
  (
    '00000000-0000-0000-0000-000000000b12',
    'Grace',
    'Hopper',
    '00000000-0000-0000-0000-000000000b02'
  ),
  (
    '00000000-0000-0000-0000-000000000b13',
    'Outside',
    'Person',
    '00000000-0000-0000-0000-000000000b03'
  ),
  (
    '00000000-0000-0000-0000-000000000b15',
    'Ada',
    'Lovelace',
    '00000000-0000-0000-0000-000000000b05'
  );

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000000b11',
  id,
  '00000000-0000-0000-0000-000000000b21',
  true,
  '00000000-0000-0000-0000-000000000b01'
FROM public.roles
WHERE name = 'club_admin';

-- ============================================================================
-- 1. Grace submits a club-scoped secretary request for the test club.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b02', true);

DO $$
DECLARE
  v_request_id uuid;
BEGIN
  v_request_id := public.submit_role_request(
    'secretary',
    'club',
    '00000000-0000-0000-0000-000000000b21',
    NULL,
    'I run entries for this club at in-person shows.'
  );

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'FAIL first submit_role_request call returned NULL';
  END IF;

  RAISE NOTICE 'PASS submit_role_request created a pending request';
END;
$$;

-- ============================================================================
-- 2. A second submit for the exact same (person, role, scope, club) is a
--    no-op (the existing partial unique index + ON CONFLICT DO NOTHING),
--    not an error.
-- ============================================================================

DO $$
DECLARE
  v_second_id uuid;
BEGIN
  v_second_id := public.submit_role_request(
    'secretary',
    'club',
    '00000000-0000-0000-0000-000000000b21',
    NULL,
    'Following up.'
  );

  IF v_second_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL duplicate pending submit was not swallowed: got id %', v_second_id;
  END IF;

  RAISE NOTICE 'PASS duplicate pending submit returns NULL, not a new row';
END;
$$;

RESET ROLE;

-- ============================================================================
-- 3. Someone who is not this club's admin (and not a site admin) cannot
--    approve the pending request.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b03', true);

DO $$
DECLARE
  v_request_id uuid;
BEGIN
  SELECT id INTO v_request_id
  FROM public.role_requests
  WHERE person_id = '00000000-0000-0000-0000-000000000b12'
    AND club_id = '00000000-0000-0000-0000-000000000b21'
    AND status = 'pending';

  BEGIN
    PERFORM public.approve_club_role_request(v_request_id, 'Approved');
    RAISE EXCEPTION 'FAIL non-admin approval succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS non-admin approval is rejected (42501)';
  END;
END;
$$;

-- ============================================================================
-- 4. Grace cannot read Ada's role_requests row (RLS: own rows or club
--    admin/site admin only). Insert Ada's row first, as the admin, then
--    check visibility as Grace.
-- ============================================================================

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b05', true);

DO $$
BEGIN
  PERFORM public.submit_role_request(
    'secretary',
    'club',
    '00000000-0000-0000-0000-000000000b21',
    NULL,
    'Ada would like to help too.'
  );
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b02', true);

DO $$
DECLARE
  v_visible_count int;
BEGIN
  SELECT count(*) INTO v_visible_count
  FROM public.role_requests
  WHERE person_id = '00000000-0000-0000-0000-000000000b15';

  IF v_visible_count <> 0 THEN
    RAISE EXCEPTION
      'FAIL requester could read another person''s role_requests row (% visible)',
      v_visible_count;
  END IF;

  RAISE NOTICE 'PASS a requester cannot read another person''s role request';
END;
$$;

RESET ROLE;

-- ============================================================================
-- 5. The club admin approves Grace's request. It must grant the club-scoped
--    secretary role via grant_club_secretary and write the same
--    permission_audit_log row a direct appointment gets.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b01', true);

DO $$
DECLARE
  v_request_id uuid;
BEGIN
  SELECT id INTO v_request_id
  FROM public.role_requests
  WHERE person_id = '00000000-0000-0000-0000-000000000b12'
    AND club_id = '00000000-0000-0000-0000-000000000b21'
    AND status = 'pending';

  PERFORM public.approve_club_role_request(v_request_id, 'Confirmed with the club.');
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_request_status text;
  v_reviewed_by uuid;
  v_role_active boolean;
  v_audit_count int;
BEGIN
  SELECT status, reviewed_by INTO v_request_status, v_reviewed_by
  FROM public.role_requests
  WHERE person_id = '00000000-0000-0000-0000-000000000b12'
    AND club_id = '00000000-0000-0000-0000-000000000b21';

  IF v_request_status IS DISTINCT FROM 'approved'
     OR v_reviewed_by IS DISTINCT FROM '00000000-0000-0000-0000-000000000b11'::uuid THEN
    RAISE EXCEPTION 'FAIL request was not marked approved by the reviewing admin: status=%, reviewed_by=%',
      v_request_status, v_reviewed_by;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = '00000000-0000-0000-0000-000000000b12'
      AND ur.club_id = '00000000-0000-0000-0000-000000000b21'
      AND ur.show_id IS NULL
      AND ur.is_active
      AND r.name = 'secretary'
  ) INTO v_role_active;

  IF NOT v_role_active THEN
    RAISE EXCEPTION 'FAIL approval did not grant an active club-scoped secretary role';
  END IF;

  SELECT count(*) INTO v_audit_count
  FROM public.permission_audit_log
  WHERE action = 'club_secretary_granted'
    AND new_value->>'person_id' = '00000000-0000-0000-0000-000000000b12'
    AND new_value->>'club_id' = '00000000-0000-0000-0000-000000000b21';

  IF v_audit_count < 1 THEN
    RAISE EXCEPTION 'FAIL approval via approve_club_role_request left no permission_audit_log row';
  END IF;

  RAISE NOTICE 'PASS club-admin approval grants secretary via grant_club_secretary and is audited';
END;
$$;

-- ============================================================================
-- 6. The admin denies Ada's request. A standing denial then blocks Ada from
--    resubmitting the exact same request while she still does not hold the
--    role.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b01', true);

DO $$
DECLARE
  v_request_id uuid;
BEGIN
  SELECT id INTO v_request_id
  FROM public.role_requests
  WHERE person_id = '00000000-0000-0000-0000-000000000b15'
    AND club_id = '00000000-0000-0000-0000-000000000b21'
    AND status = 'pending';

  PERFORM public.deny_club_role_request(v_request_id, 'Not enough context yet.');
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b05', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_role_request(
      'secretary',
      'club',
      '00000000-0000-0000-0000-000000000b21',
      NULL,
      'Asking again.'
    );
    RAISE EXCEPTION 'FAIL resubmission after a standing denial succeeded';
  EXCEPTION WHEN SQLSTATE 'YMKDN' THEN
    RAISE NOTICE 'PASS a standing denial blocks resubmission (YMKDN)';
  END;
END;
$$;

RESET ROLE;

ROLLBACK;
