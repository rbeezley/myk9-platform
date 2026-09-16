-- Behavioral test for the club-routed show-access request flow (MYK9-571).
-- All fixtures and role changes roll back.
--
-- Covers:
--   1. A non-admin of the request's club cannot approve it (42501), captured
--      from an id read as a SUPERUSER so RLS never has a chance to hide the
--      row and turn the assertion vacuous (a NULL id would raise P0002, not
--      42501, and the test would pass for the wrong reason).
--   2. A club admin's approval grants the club-scoped secretary role via
--      grant_club_secretary and writes a permission_audit_log row — the same
--      grant path a direct appointment uses.
--   3. A duplicate pending submit is swallowed (NULL id), not an error.
--   4. A denial blocks a resubmission of the exact same request (MK571).
--   5. A requester cannot read another person's role_requests row.
--   6. A club admin CAN read a pending secretary request for their own club
--      through list_club_role_requests, CANNOT read one for a club they do
--      not administer through it (42501), and CANNOT read a NULL-club
--      secretary request via a direct SELECT either way — the P0 round 1
--      shipped and round 2 removed.
--   7. A LEGACY SHOW-scoped secretary request, approved by a site admin
--      WITHOUT a show (the UI's actual shape — RoleRequestsPage.tsx never
--      passes showId), still routes through grant_club_secretary and is
--      audited.
--   8. (round 2, R3) submit_role_request REJECTS a show-scoped secretary ask
--      (22023) — show-scoped secretary is not a permission any more.
--   9. (round 2, R3) An empty note on a club-scoped secretary ask is
--      rejected (22023).
--   10. (round 2, R4) approve_club_role_request/deny_club_role_request give
--      the SAME 42501 verdict for a request id that does not exist at all,
--      not just for one that exists but belongs to another club — proving
--      the shape check and the authorization check are one verdict, not two.
--   11. (round 2, R4) deny_club_role_request by a non-admin of the request's
--      club is rejected (42501), mirroring test 1's coverage of approve.
--   12. (round 3, lens A) list_club_role_requests(NULL) is 42501 even for a
--      site admin.
--   13. (round 3, lens A) A site admin listing a real club's requests still
--      gets zero rows for a NULL-club secretary request.
--
-- `role_requests.auth_user_id` is NOT NULL REFERENCES auth.users(id), so every
-- identity below needs a real auth.users row, not just a people row carrying an
-- unlinked uuid. People are inserted FIRST with an email and no auth_user_id;
-- auth.users rows are inserted second with matching emails, and
-- handle_new_user() (the trigger on auth.users) adopts each person by
-- LOWER(email) match, filling in auth_user_id. This is the same order
-- show_message_tenant_isolation_test.sql uses, and for the same reason:
-- setting people.auth_user_id directly would leave a uuid with no matching
-- auth.users row, which is exactly the bug this rewrite fixes.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000000b21', 'Routed Request Test Club'),
  ('00000000-0000-0000-0000-000000000b22', 'Routed Request Test Club Two');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-000000000b31',
  'Routed Request Test Show',
  'AKC',
  current_date,
  current_date,
  '00000000-0000-0000-0000-000000000b21',
  'draft'
);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  (
    '00000000-0000-0000-0000-000000000b11',
    'Club',
    'Administrator',
    'myk9-571-club-admin@example.test'
  ),
  (
    '00000000-0000-0000-0000-000000000b12',
    'Grace',
    'Hopper',
    'myk9-571-grace-hopper@example.test'
  ),
  (
    '00000000-0000-0000-0000-000000000b13',
    'Outside',
    'Person',
    'myk9-571-outside-person@example.test'
  ),
  (
    '00000000-0000-0000-0000-000000000b15',
    'Ada',
    'Lovelace',
    'myk9-571-ada-lovelace@example.test'
  ),
  (
    '00000000-0000-0000-0000-000000000b16',
    'Other',
    'ClubAdmin',
    'myk9-571-other-club-admin@example.test'
  ),
  (
    '00000000-0000-0000-0000-000000000b17',
    'Site',
    'Admin',
    'myk9-571-site-admin@example.test'
  ),
  (
    '00000000-0000-0000-0000-000000000b18',
    'Wanda',
    'ShowScoped',
    'myk9-571-wanda-showscoped@example.test'
  ),
  (
    '00000000-0000-0000-0000-000000000b19',
    'Nina',
    'EmptyNote',
    'myk9-571-nina-emptynote@example.test'
  );

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-571-club-admin@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-571-grace-hopper@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-571-outside-person@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-571-ada-lovelace@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000b06', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-571-other-club-admin@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000b07', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-571-site-admin@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000b08', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-571-wanda-showscoped@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000b09', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-571-nina-emptynote@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false);

-- Guard the assumption the rest of the file rests on: if handle_new_user ever
-- stops adopting by email, every identity below would silently be missing its
-- auth link, and submit_role_request's `people WHERE auth_user_id = ...` gate
-- would refuse every DO block below with "No person profile found" instead of
-- exercising anything this file is meant to cover.
DO $$
DECLARE
  v_unadopted int;
BEGIN
  SELECT count(*) INTO v_unadopted
  FROM public.people
  WHERE id = ANY(ARRAY[
    '00000000-0000-0000-0000-000000000b11',
    '00000000-0000-0000-0000-000000000b12',
    '00000000-0000-0000-0000-000000000b13',
    '00000000-0000-0000-0000-000000000b15',
    '00000000-0000-0000-0000-000000000b16',
    '00000000-0000-0000-0000-000000000b17',
    '00000000-0000-0000-0000-000000000b18',
    '00000000-0000-0000-0000-000000000b19'
  ]::uuid[])
    AND auth_user_id IS NULL;

  IF v_unadopted <> 0 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not adopt % seeded people by email', v_unadopted;
  END IF;
END;
$$;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000000b11',
  id,
  '00000000-0000-0000-0000-000000000b21',
  true,
  '00000000-0000-0000-0000-000000000b01'
FROM public.roles
WHERE name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000000b16',
  id,
  '00000000-0000-0000-0000-000000000b22',
  true,
  '00000000-0000-0000-0000-000000000b06'
FROM public.roles
WHERE name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000000b17',
  id,
  NULL,
  true,
  '00000000-0000-0000-0000-000000000b07'
FROM public.roles
WHERE name = 'site_admin';

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

-- Capture Grace's pending request id as the superuser test-runner role (which
-- bypasses RLS entirely), so the non-admin-approval check below exercises the
-- REAL id. Re-querying it under the outsider's own session would return NULL
-- (RLS filters the row away) and make the assertion pass for the wrong
-- reason: approve_club_role_request(NULL, ...) raises P0002, not 42501, and a
-- handler that only catches 42501 would let that escape uncaught.
SELECT set_config(
  'myk9_571.grace_request_id',
  (
    SELECT id::text
    FROM public.role_requests
    WHERE person_id = '00000000-0000-0000-0000-000000000b12'
      AND club_id = '00000000-0000-0000-0000-000000000b21'
      AND status = 'pending'
  ),
  true
);

DO $$
BEGIN
  IF current_setting('myk9_571.grace_request_id', true) IS NULL
     OR current_setting('myk9_571.grace_request_id', true) = '' THEN
    RAISE EXCEPTION 'FIXTURE could not resolve Grace''s pending request id';
  END IF;
END;
$$;

-- ============================================================================
-- 3. Someone who is not this club's admin (and not a site admin) cannot
--    approve the pending request. Uses the id captured above, not an
--    RLS-filtered re-select, so the exception really comes from the
--    authorization check.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b03', true);

DO $$
DECLARE
  v_request_id uuid := current_setting('myk9_571.grace_request_id')::uuid;
BEGIN
  BEGIN
    PERFORM public.approve_club_role_request(v_request_id, 'Approved');
    RAISE EXCEPTION 'FAIL non-admin approval succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS non-admin approval is rejected (42501)';
  END;
END;
$$;

RESET ROLE;

-- ============================================================================
-- 3b. Club-admin visibility of pending secretary requests is RPC-brokered
--     (round 2, R1): role_requests_select carries NO club-admin arm any
--     more (round 1's `is_club_admin(club_id)` arm was the P0 this
--     restructure removed — see the migration header), so a club admin
--     reads through public.list_club_role_requests(p_club_id) instead.
--     This club's own admin CAN read Grace's pending secretary request
--     through the RPC; another club's admin calling it WITH THIS CLUB'S id
--     gets 42501, not an empty result — the RPC checks
--     is_club_admin(p_club_id) against the id the CALLER passed, not
--     against the request's own club, so this proves the caller cannot
--     name someone else's club and get data back.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b01', true);

DO $$
DECLARE
  v_visible_count int;
BEGIN
  SELECT count(*) INTO v_visible_count
  FROM public.list_club_role_requests('00000000-0000-0000-0000-000000000b21')
  WHERE person_id = '00000000-0000-0000-0000-000000000b12';

  IF v_visible_count <> 1 THEN
    RAISE EXCEPTION
      'FAIL this club''s own admin could not read the pending secretary request via the RPC (% visible)',
      v_visible_count;
  END IF;

  RAISE NOTICE
    'PASS a club admin can read their own club''s pending secretary request via list_club_role_requests';
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b06', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.list_club_role_requests('00000000-0000-0000-0000-000000000b21');
    RAISE EXCEPTION
      'FAIL another club''s admin could call list_club_role_requests for a club they do not administer';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE
      'PASS another club''s admin gets 42501 calling list_club_role_requests for a club they do not administer';
  END;
END;
$$;

RESET ROLE;

-- ============================================================================
-- 3c. P0 regression: a NULL-club secretary request — the shape EVERY
--     signup-generated row has, since insert_signup_role_requests never
--     sets club_id — must be invisible to a club admin via a DIRECT SELECT.
--     Round 1's now-removed arm, `is_club_admin(club_id)` with club_id
--     NULL, answered "club admin anywhere?" and would have returned this
--     row to every club admin on the platform; a direct SELECT (not the
--     RPC, whose own `WHERE rr.club_id = p_club_id` already excludes NULL
--     for any real club id) is what proves the POLICY itself carries no
--     such arm any more. Inserted directly, matching how
--     insert_signup_role_requests actually writes the row: no club_id.
-- ============================================================================

INSERT INTO public.role_requests (
  auth_user_id, person_id, requested_role, requested_scope, requester_note, status
) VALUES (
  '00000000-0000-0000-0000-000000000b03',
  '00000000-0000-0000-0000-000000000b13',
  'secretary',
  'club',
  'Created from signup role intent.',
  'pending'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b01', true);

DO $$
DECLARE
  v_visible_count int;
BEGIN
  SELECT count(*) INTO v_visible_count
  FROM public.role_requests
  WHERE person_id = '00000000-0000-0000-0000-000000000b13';

  IF v_visible_count <> 0 THEN
    RAISE EXCEPTION
      'FAIL a club admin could read a NULL-club secretary request via a direct SELECT (% visible) — MYK9-571 round 1 P0',
      v_visible_count;
  END IF;

  RAISE NOTICE 'PASS a club admin cannot read a NULL-club secretary request via a direct SELECT';
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b06', true);

DO $$
DECLARE
  v_visible_count int;
BEGIN
  SELECT count(*) INTO v_visible_count
  FROM public.role_requests
  WHERE person_id = '00000000-0000-0000-0000-000000000b13';

  IF v_visible_count <> 0 THEN
    RAISE EXCEPTION
      'FAIL a DIFFERENT club''s admin could read a NULL-club secretary request via a direct SELECT (% visible) — MYK9-571 round 1 P0',
      v_visible_count;
  END IF;

  RAISE NOTICE 'PASS a different club''s admin cannot read a NULL-club secretary request via a direct SELECT either';
END;
$$;

RESET ROLE;

-- ============================================================================
-- 4. Grace cannot read Ada's role_requests row (RLS: own rows or club
--    admin/site admin only). Insert Ada's row first, as the admin, then
--    check visibility as Grace.
-- ============================================================================

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
  -- MYK9-571 round 2: the admin finds the pending request the same way the
  -- real approve flow does — through list_club_role_requests, not a direct
  -- SELECT (role_requests_select carries no club-admin arm any more).
  SELECT id INTO v_request_id
  FROM public.list_club_role_requests('00000000-0000-0000-0000-000000000b21')
  WHERE person_id = '00000000-0000-0000-0000-000000000b12';

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
  -- MYK9-571 round 2: same RPC-brokered read as section 5 above.
  SELECT id INTO v_request_id
  FROM public.list_club_role_requests('00000000-0000-0000-0000-000000000b21')
  WHERE person_id = '00000000-0000-0000-0000-000000000b15';

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
  EXCEPTION WHEN SQLSTATE 'MK571' THEN
    RAISE NOTICE 'PASS a standing denial blocks resubmission (MK571)';
  END;
END;
$$;

RESET ROLE;

-- ============================================================================
-- 7. LEGACY show-scoped secretary request (requested_scope='show'). Round 2
--    of MYK9-571 makes submit_role_request REJECT this shape for secretary
--    (see section 9 below) — show-scoped secretary is not a permission any
--    more. But a row in this shape could already exist from before that
--    reject shipped (or round 1, which still allowed it), so
--    approve_role_request, called by a site admin the way the UI actually
--    calls it (a club, but no show — RoleRequestsPage.tsx never passes
--    showId), must still route this legacy shape through
--    grant_club_secretary and be audited. Inserted directly as the
--    superuser test role (not via submit_role_request, which would now
--    refuse it) to simulate that pre-existing row.
-- ============================================================================

INSERT INTO public.role_requests (
  auth_user_id, person_id, requested_role, requested_scope, show_id, requester_note, status
) VALUES (
  '00000000-0000-0000-0000-000000000b08',
  '00000000-0000-0000-0000-000000000b18',
  'secretary',
  'show',
  '00000000-0000-0000-0000-000000000b31',
  'I can run this specific show.',
  'pending'
);

SELECT set_config(
  'myk9_571.wanda_request_id',
  (
    SELECT id::text
    FROM public.role_requests
    WHERE person_id = '00000000-0000-0000-0000-000000000b18'
      AND show_id = '00000000-0000-0000-0000-000000000b31'
      AND status = 'pending'
  ),
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b07', true);

DO $$
DECLARE
  v_request_id uuid := current_setting('myk9_571.wanda_request_id')::uuid;
BEGIN
  -- The UI's actual shape: a club, and no show, even though the original ask
  -- named a show. p_show_id is left at its default (NULL) on purpose.
  PERFORM public.approve_role_request(
    v_request_id,
    '00000000-0000-0000-0000-000000000b21',
    NULL,
    'Approved without a show scope, matching the UI.'
  );
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_role_active boolean;
  v_audit_count int;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = '00000000-0000-0000-0000-000000000b18'
      AND ur.club_id = '00000000-0000-0000-0000-000000000b21'
      AND ur.show_id IS NULL
      AND ur.is_active
      AND r.name = 'secretary'
  ) INTO v_role_active;

  IF NOT v_role_active THEN
    RAISE EXCEPTION
      'FAIL a show-scoped secretary request approved with a club did not grant club-scoped secretary';
  END IF;

  SELECT count(*) INTO v_audit_count
  FROM public.permission_audit_log
  WHERE action = 'club_secretary_granted'
    AND new_value->>'person_id' = '00000000-0000-0000-0000-000000000b18'
    AND new_value->>'club_id' = '00000000-0000-0000-0000-000000000b21';

  IF v_audit_count < 1 THEN
    RAISE EXCEPTION
      'FAIL show-scoped secretary approval via approve_role_request left no permission_audit_log row (MYK9-571 P2-4)';
  END IF;

  RAISE NOTICE
    'PASS a show-scoped secretary request approved with a club routes through grant_club_secretary and is audited';
END;
$$;
-- ============================================================================
-- 8. (round 2, R3) submit_role_request REJECTS a show-scoped secretary ask.
--    Show-scoped secretary is not a permission any more (20260830240000
--    retired it) — the discriminator this test protects is that the reject
--    fires BEFORE the club/show mutual-exclusion or note-required checks
--    below it, for both possible shapes of a would-be show-scoped ask.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b02', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_role_request(
      'secretary',
      'show',
      NULL,
      '00000000-0000-0000-0000-000000000b31',
      'I can run this specific show.'
    );
    RAISE EXCEPTION 'FAIL show-scoped secretary submit succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RAISE NOTICE 'PASS show-scoped secretary submit is rejected (22023)';
  END;
END;
$$;

RESET ROLE;

-- ============================================================================
-- 9. (round 2, R3) An empty note on a club-scoped secretary ask is rejected
--    (22023). A fresh identity (Nina) avoids the standing-denial guard
--    firing first and masking which check actually raised.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b09', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_role_request(
      'secretary',
      'club',
      '00000000-0000-0000-0000-000000000b21',
      NULL,
      ''
    );
    RAISE EXCEPTION 'FAIL empty-note club secretary submit succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RAISE NOTICE 'PASS an empty note on a club-scoped secretary ask is rejected (22023)';
  END;
END;
$$;

RESET ROLE;

-- ============================================================================
-- 10. (round 2, R4) approve_club_role_request/deny_club_role_request give
--     the SAME 42501 for a request id that does not exist at all as for one
--     that exists but belongs to another club (test 1 above) — the shape
--     check and the authorization check are one verdict, not a 22023 for
--     "wrong shape" followed by a 42501 for "not yours".
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b03', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.approve_club_role_request(gen_random_uuid(), 'Approved');
    RAISE EXCEPTION 'FAIL approve_club_role_request on a nonexistent id succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS approve_club_role_request on a nonexistent id is 42501, not P0002';
  END;

  BEGIN
    PERFORM public.deny_club_role_request(gen_random_uuid(), 'Denied');
    RAISE EXCEPTION 'FAIL deny_club_role_request on a nonexistent id succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS deny_club_role_request on a nonexistent id is 42501, not P0002';
  END;
END;
$$;

RESET ROLE;

-- ============================================================================
-- 11. (round 2, R4) deny_club_role_request by someone who is not this
--     club's admin (and not a site admin) is rejected (42501) — mirrors
--     test 1's coverage of approve_club_role_request. Submits a fresh
--     pending request from Nina to deny against.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b09', true);

DO $$
DECLARE
  v_request_id uuid;
BEGIN
  v_request_id := public.submit_role_request(
    'secretary',
    'club',
    '00000000-0000-0000-0000-000000000b21',
    NULL,
    'Nina would like to help too.'
  );

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'FIXTURE Nina''s submit_role_request returned NULL';
  END IF;
END;
$$;

RESET ROLE;

SELECT set_config(
  'myk9_571.nina_request_id',
  (
    SELECT id::text
    FROM public.role_requests
    WHERE person_id = '00000000-0000-0000-0000-000000000b19'
      AND club_id = '00000000-0000-0000-0000-000000000b21'
      AND status = 'pending'
  ),
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b03', true);

DO $$
DECLARE
  v_request_id uuid := current_setting('myk9_571.nina_request_id')::uuid;
BEGIN
  BEGIN
    PERFORM public.deny_club_role_request(v_request_id, 'Denied');
    RAISE EXCEPTION 'FAIL non-admin deny_club_role_request succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS non-admin deny_club_role_request is rejected (42501)';
  END;
END;
$$;

RESET ROLE;
-- ============================================================================
-- 12. (round 3 lens A) list_club_role_requests(NULL) is rejected (42501)
--     even for a site admin — the verdict checks p_club_id IS NULL first,
--     unconditionally, before is_site_admin() OR is_club_admin() ever runs.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000b07', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.list_club_role_requests(NULL);
    RAISE EXCEPTION 'FAIL list_club_role_requests(NULL) succeeded for a site admin';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS list_club_role_requests(NULL) is rejected (42501) even for a site admin';
  END;
END;
$$;

-- ============================================================================
-- 13. (round 3 lens A) A site admin listing a REAL club's requests still
--     gets zero rows for a NULL-club secretary request (the same row
--     section 3c proved invisible to a direct SELECT) — the RPC's own
--     `WHERE rr.club_id = p_club_id` excludes it for ANY real club id,
--     privileged caller or not, so a site admin cannot see it through this
--     RPC either (they still see it through role_requests_select's own
--     unconditional is_site_admin() arm, which this test does not touch).
-- ============================================================================

DO $$
DECLARE
  v_visible_count int;
BEGIN
  SELECT count(*) INTO v_visible_count
  FROM public.list_club_role_requests('00000000-0000-0000-0000-000000000b21')
  WHERE person_id = '00000000-0000-0000-0000-000000000b13';

  IF v_visible_count <> 0 THEN
    RAISE EXCEPTION
      'FAIL a site admin saw a NULL-club secretary request through list_club_role_requests for a real club (% visible)',
      v_visible_count;
  END IF;

  RAISE NOTICE 'PASS list_club_role_requests never returns a NULL-club request for any real club id';
END;
$$;

RESET ROLE;

ROLLBACK;
