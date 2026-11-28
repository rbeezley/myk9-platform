-- Behavioral coverage for MYK9-682.
-- All fixtures and role changes roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000682001', 'MYK9-682 Scope Club'),
  ('00000000-0000-0000-0000-000000682002', 'MYK9-682 Existing Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000682011', 'MYK9', 'Requester', 'myk9-682-requester@example.test', NULL),
  ('00000000-0000-0000-0000-000000682012', 'MYK9', 'Site Admin', 'myk9-682-admin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000682101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-682-requester@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000682102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-682-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = CASE email
  WHEN 'myk9-682-requester@example.test' THEN '00000000-0000-0000-0000-000000682101'::uuid
  WHEN 'myk9-682-admin@example.test' THEN '00000000-0000-0000-0000-000000682102'::uuid
END
WHERE email IN ('myk9-682-requester@example.test', 'myk9-682-admin@example.test');

INSERT INTO public.user_roles (user_id, role_id, is_active, granted_by, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000682012',
  id,
  true,
  '00000000-0000-0000-0000-000000682012',
  '00000000-0000-0000-0000-000000682102'
FROM public.roles
WHERE name = 'site_admin';

INSERT INTO public.club_access_requests (
  id,
  requester_person_id,
  requester_auth_user_id,
  requested_club_name,
  request_note
)
VALUES (
  '00000000-0000-0000-0000-000000682021',
  '00000000-0000-0000-0000-000000682011',
  '00000000-0000-0000-0000-000000682101',
  'MYK9-682 New Club',
  'Founding club request'
);

INSERT INTO public.club_access_requests (
  id,
  requester_person_id,
  requester_auth_user_id,
  requested_club_name,
  request_note
)
VALUES (
  '00000000-0000-0000-0000-000000682022',
  '00000000-0000-0000-0000-000000682011',
  '00000000-0000-0000-0000-000000682101',
  'MYK9-682 Existing Club Request',
  'Existing club approval request'
);

INSERT INTO public.club_access_requests (
  id,
  requester_person_id,
  requester_auth_user_id,
  requested_club_name
)
VALUES (
  '00000000-0000-0000-0000-000000682023',
  '00000000-0000-0000-0000-000000682011',
  '00000000-0000-0000-0000-000000682101',
  'MYK9-682 Rollback Club'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000682102', true);

DO $$
DECLARE
  v_club_id uuid;
  v_club_admin_count integer;
  v_secretary_count integer;
  v_member_count integer;
  v_secretary_audit_count integer;
  v_admin_reactivation_audit_count integer;
  v_approval_audit jsonb;
BEGIN
  SELECT public.review_club_access_request(
    '00000000-0000-0000-0000-000000682021',
    'approved',
    NULL,
    NULL,
    NULL
  ) INTO v_club_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_access_requests
    WHERE id = '00000000-0000-0000-0000-000000682021'
      AND status = 'approved'
      AND approved_club_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'FAIL approval did not mark the request approved';
  END IF;

  SELECT count(*) INTO v_club_admin_count
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = '00000000-0000-0000-0000-000000682011'
    AND ur.club_id = v_club_id
    AND ur.show_id IS NULL
    AND r.name = 'club_admin'
    AND ur.is_active;

  SELECT count(*) INTO v_secretary_count
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = '00000000-0000-0000-0000-000000682011'
    AND ur.club_id = v_club_id
    AND ur.show_id IS NULL
    AND r.name = 'secretary'
    AND ur.is_active;

  SELECT count(*) INTO v_member_count
  FROM public.club_members
  WHERE person_id = '00000000-0000-0000-0000-000000682011'
    AND club_id = v_club_id
    AND membership_status = 'active';

  IF v_club_admin_count <> 1 OR v_secretary_count <> 1 OR v_member_count <> 1 THEN
    RAISE EXCEPTION 'FAIL founding requester grants: club_admin=%, secretary=%, member=%',
      v_club_admin_count, v_secretary_count, v_member_count;
  END IF;

  SELECT count(*) INTO v_secretary_audit_count
  FROM public.permission_audit_log
  WHERE action = 'club_secretary_granted'
    AND target_type = 'user_role'
    AND new_value->>'person_id' = '00000000-0000-0000-0000-000000682011';

  SELECT new_value INTO v_approval_audit
  FROM public.permission_audit_log
  WHERE action = 'club_access_request_approved'
    AND target_id = '00000000-0000-0000-0000-000000682021';

  IF v_secretary_audit_count <> 1
     OR v_approval_audit->'roles'->>'club_admin_assignment_id' IS NULL
     OR v_approval_audit->'roles'->>'secretary_assignment_id' IS NULL
     OR v_approval_audit->>'membership_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL approval audit does not record both role assignments and membership';
  END IF;

  UPDATE public.user_roles
  SET is_active = false,
      expires_at = now() - interval '1 day'
  WHERE user_id = '00000000-0000-0000-0000-000000682011'
    AND club_id = v_club_id
    AND show_id IS NULL;

  PERFORM public.review_club_access_request(
    '00000000-0000-0000-0000-000000682021',
    'approved',
    NULL,
    NULL,
    NULL
  );

  SELECT count(*) INTO v_club_admin_count
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = '00000000-0000-0000-0000-000000682011'
    AND ur.club_id = v_club_id
    AND ur.show_id IS NULL
    AND r.name IN ('club_admin', 'secretary')
    AND ur.is_active
    AND (ur.expires_at IS NULL OR ur.expires_at > now());

  SELECT count(*) INTO v_member_count
  FROM public.club_members
  WHERE person_id = '00000000-0000-0000-0000-000000682011'
    AND club_id = v_club_id;

  IF v_club_admin_count <> 2 OR v_member_count <> 1 THEN
    RAISE EXCEPTION 'FAIL re-approval created duplicate assignments or membership rows';
  END IF;

  SELECT count(*) INTO v_admin_reactivation_audit_count
  FROM public.permission_audit_log
  WHERE action = 'club_admin_reactivated'
    AND target_type = 'user_role'
    AND new_value->>'person_id' = '00000000-0000-0000-0000-000000682011';

  IF v_admin_reactivation_audit_count <> 1 THEN
    RAISE EXCEPTION 'FAIL re-approval did not audit club-admin reactivation';
  END IF;

  SELECT count(*) INTO v_secretary_audit_count
  FROM public.permission_audit_log
  WHERE action = 'club_secretary_granted'
    AND target_type = 'user_role'
    AND new_value->>'person_id' = '00000000-0000-0000-0000-000000682011';

  PERFORM public.review_club_access_request(
    '00000000-0000-0000-0000-000000682021',
    'approved',
    NULL,
    NULL,
    NULL
  );

  IF (
    SELECT count(*)
    FROM public.permission_audit_log
    WHERE action = 'club_secretary_granted'
      AND target_type = 'user_role'
      AND new_value->>'person_id' = '00000000-0000-0000-0000-000000682011'
  ) <> v_secretary_audit_count THEN
    RAISE EXCEPTION 'FAIL idempotent retry created a duplicate secretary audit event';
  END IF;

  RAISE NOTICE 'PASS new-club approval grants scoped roles, membership, audit data, and is idempotent';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000682102', true);

DO $$
DECLARE
  v_club_id uuid;
BEGIN
  SELECT public.review_club_access_request(
    '00000000-0000-0000-0000-000000682022',
    'approved',
    '00000000-0000-0000-0000-000000682002',
    NULL,
    NULL
  ) INTO v_club_id;

  IF v_club_id <> '00000000-0000-0000-0000-000000682002'
     OR EXISTS (
       SELECT 1 FROM public.clubs WHERE name = 'MYK9-682 Existing Club Request'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.club_access_requests
       WHERE id = '00000000-0000-0000-0000-000000682022'
         AND approved_club_id = '00000000-0000-0000-0000-000000682002'
     ) THEN
    RAISE EXCEPTION 'FAIL existing-club approval did not honor the selected club';
  END IF;

  RAISE NOTICE 'PASS existing-club approval honors the selected club';
END;
$$;

DO $$
DECLARE
  v_approved_club_id uuid;
  v_other_club_secretary boolean;
  v_other_club_admin boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000682101', true);

  SELECT approved_club_id INTO v_approved_club_id
  FROM public.club_access_requests
  WHERE id = '00000000-0000-0000-0000-000000682021';

  SELECT public.is_trial_secretary('00000000-0000-0000-0000-000000682001') INTO v_other_club_secretary;
  SELECT public.is_club_admin('00000000-0000-0000-0000-000000682001') INTO v_other_club_admin;

  IF v_other_club_secretary IS DISTINCT FROM false
     OR v_other_club_admin IS DISTINCT FROM false
     OR v_approved_club_id = '00000000-0000-0000-0000-000000682001' THEN
    RAISE EXCEPTION 'FAIL founding requester access crossed the approved-club boundary';
  END IF;

  RAISE NOTICE 'PASS founding requester access is limited to the approved club';
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.review_club_access_request(
      '00000000-0000-0000-0000-000000682021',
      'approved',
      NULL,
      NULL,
      NULL
    );
    RAISE EXCEPTION 'FAIL non-site-admin approved a club access request';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'PASS non-site-admin cannot approve a club access request';
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000682102', true);

DO $$
DECLARE
  v_request_status text;
  v_role_count integer;
  v_membership_count integer;
  v_created_club_count integer;
BEGIN
  UPDATE public.roles
  SET name = 'secretary_missing_for_myk9_682'
  WHERE name = 'secretary';

  BEGIN
    PERFORM public.review_club_access_request(
      '00000000-0000-0000-0000-000000682023',
      'approved',
      NULL,
      NULL,
      NULL
    );
    RAISE EXCEPTION 'FAIL approval succeeded without the secretary role';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL;
  END;

  UPDATE public.roles
  SET name = 'secretary'
  WHERE name = 'secretary_missing_for_myk9_682';

  SELECT status INTO v_request_status
  FROM public.club_access_requests
  WHERE id = '00000000-0000-0000-0000-000000682023';

  SELECT count(*) INTO v_role_count
  FROM public.user_roles
  WHERE user_id = '00000000-0000-0000-0000-000000682011'
    AND club_id IN (SELECT id FROM public.clubs WHERE name = 'MYK9-682 Rollback Club');

  SELECT count(*) INTO v_membership_count
  FROM public.club_members
  WHERE person_id = '00000000-0000-0000-0000-000000682011'
    AND club_id IN (SELECT id FROM public.clubs WHERE name = 'MYK9-682 Rollback Club');

  SELECT count(*) INTO v_created_club_count
  FROM public.clubs
  WHERE name = 'MYK9-682 Rollback Club';

  IF v_request_status <> 'pending'
     OR v_role_count <> 0
     OR v_membership_count <> 0
     OR v_created_club_count <> 0 THEN
    RAISE EXCEPTION 'FAIL approval rollback left partial state: status=%, roles=%, membership=%, clubs=%',
      v_request_status, v_role_count, v_membership_count, v_created_club_count;
  END IF;

  RAISE NOTICE 'PASS failed approval rolls back all founder grants';
END;
$$;

-- ---------------------------------------------------------------------------
-- MYK9-2513: one approval, whichever door. The club page's set_club_authorization
-- runs the same approval as review_club_access_request, asks for the password on
-- both, and a decline may delete the club in the same step. Every case below sets
-- request.jwt.claims (an amr), because require_recent_reauth() passes silently when
-- there is no JWT at all.
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- age_seconds NULL = no amr at all (a session with no proof of a sign-in).
CREATE FUNCTION public.zz_claims_2513(p_sub uuid, p_age_seconds integer)
RETURNS text
LANGUAGE sql
AS $fn$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated',
    'amr', CASE WHEN p_age_seconds IS NULL THEN NULL ELSE jsonb_build_array(jsonb_build_object(
      'method', 'password',
      'timestamp', extract(epoch FROM now())::bigint - p_age_seconds)) END
  ))::text;
$fn$;
GRANT EXECUTE ON FUNCTION public.zz_claims_2513(uuid, integer) TO authenticated;

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000002513011', 'MYK9', 'Founder 2513', 'myk9-2513-founder@example.test', NULL),
  ('00000000-0000-0000-0000-000002513012', 'MYK9', 'Founder2 2513', 'myk9-2513-founder2@example.test', NULL);
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000002513101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2513-founder@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002513102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2513-founder2@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);
UPDATE public.people SET auth_user_id = CASE email
  WHEN 'myk9-2513-founder@example.test' THEN '00000000-0000-0000-0000-000002513101'::uuid
  WHEN 'myk9-2513-founder2@example.test' THEN '00000000-0000-0000-0000-000002513102'::uuid
END
WHERE email IN ('myk9-2513-founder@example.test', 'myk9-2513-founder2@example.test');

-- Five waiting clubs filed through request_new_club (three pending per founder at most).
CREATE TEMP TABLE zz_2513 (label text PRIMARY KEY, club_id uuid, request_id uuid);
GRANT ALL ON zz_2513 TO PUBLIC;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002513101', true);
INSERT INTO zz_2513
SELECT l, (r->>'club_id')::uuid, (r->>'request_id')::uuid
FROM (VALUES ('door'), ('stale'), ('decline')) AS v(l),
  LATERAL (SELECT public.request_new_club('MYK9-2513 Club ' || v.l, '{"AKC":"2513"}'::jsonb) AS r) x;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002513102', true);
INSERT INTO zz_2513
SELECT l, (r->>'club_id')::uuid, (r->>'request_id')::uuid
FROM (VALUES ('delete'), ('shows')) AS v(l),
  LATERAL (SELECT public.request_new_club('MYK9-2513 Club ' || v.l, '{"AKC":"2513"}'::jsonb) AS r) x;
RESET ROLE;

-- 2513.1 The club page's door closes the waiting request, tells the founder once.
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  public.zz_claims_2513('00000000-0000-0000-0000-000000682102', 30), true);
SELECT public.set_club_authorization((SELECT club_id FROM zz_2513 WHERE label = 'door'), true);
-- Pressing it twice (a double click, a second admin) must not tell the founder twice.
SELECT public.set_club_authorization((SELECT club_id FROM zz_2513 WHERE label = 'door'), true);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

DO $$
DECLARE
  v_club uuid := (SELECT club_id FROM zz_2513 WHERE label = 'door');
  v_request uuid := (SELECT request_id FROM zz_2513 WHERE label = 'door');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.club_access_requests
    WHERE id = v_request AND status = 'approved' AND approved_club_id = v_club
      AND reviewed_by = '00000000-0000-0000-0000-000000682012'
  ) THEN
    RAISE EXCEPTION 'FAIL 2513.1 authorizing from the club page left the request pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = v_club AND authorized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 2513.1 the club was not authorized';
  END IF;
  IF (SELECT count(*) FROM public.notifications
      WHERE user_id = '00000000-0000-0000-0000-000002513101'
        AND type = 'club_access_approved' AND deep_link_url = '/clubs/' || v_club) <> 1 THEN
    RAISE EXCEPTION 'FAIL 2513.1 the founder did not get exactly one approved notice';
  END IF;
  IF (SELECT count(*) FROM public.access_request_email_jobs
      WHERE request_kind = 'new_club' AND request_id = v_request AND event = 'approved') <> 1 THEN
    RAISE EXCEPTION 'FAIL 2513.1 expected exactly one approved email job';
  END IF;
  IF (SELECT count(*) FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = '00000000-0000-0000-0000-000002513011' AND ur.club_id = v_club
        AND ur.show_id IS NULL AND ur.is_active AND r.name IN ('club_admin', 'secretary')) <> 2 THEN
    RAISE EXCEPTION 'FAIL 2513.1 the founder is not club admin and secretary';
  END IF;
  IF (SELECT count(*) FROM public.permission_audit_log
      WHERE action = 'club_authorized' AND target_id = v_club) <> 1 THEN
    RAISE EXCEPTION 'FAIL 2513.1 expected exactly one club_authorized audit row';
  END IF;
  RAISE NOTICE 'PASS 2513.1 the club page approves the waiting request, once';
END;
$$;

-- 2513.2 A stale or missing sign-in is refused on the club page door and on the
-- Onboarding door alike, and nothing moves.
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_club uuid := (SELECT club_id FROM zz_2513 WHERE label = 'stale');
  v_request uuid := (SELECT request_id FROM zz_2513 WHERE label = 'stale');
  v_age integer;
  v_door text;
  v_refused boolean;
BEGIN
  FOREACH v_door IN ARRAY ARRAY['club page', 'onboarding'] LOOP
    FOREACH v_age IN ARRAY ARRAY[86400, NULL] LOOP
      PERFORM set_config('request.jwt.claims',
        public.zz_claims_2513('00000000-0000-0000-0000-000000682102', v_age), true);
      v_refused := false;
      BEGIN
        IF v_door = 'club page' THEN
          PERFORM public.set_club_authorization(v_club, true);
        ELSE
          PERFORM public.review_club_access_request(v_request, 'approved', NULL, NULL, NULL);
        END IF;
      EXCEPTION WHEN SQLSTATE 'MKAUT' THEN
        v_refused := true;
      END;
      IF NOT v_refused THEN
        RAISE EXCEPTION 'FAIL 2513.2 % approved a waiting club on a sign-in of age %', v_door, v_age;
      END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.club_access_requests r
    JOIN public.clubs c ON c.id = r.created_club_id
    WHERE r.id = (SELECT request_id FROM zz_2513 WHERE label = 'stale')
      AND r.status = 'pending' AND c.authorized_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL 2513.2 a refused approval still changed the request or the club';
  END IF;
  RAISE NOTICE 'PASS 2513.2 both doors ask for the password and refuse without it';
END;
$$;

-- 2513.3 A waiting club with no pending request (WALK TEST: its request was
-- approved before approval authorized clubs) can still be authorized, and the old
-- request is left exactly as it was. Revoking never asks for the password, and
-- re-authorizing after a revoke tells no one.
INSERT INTO public.clubs (id, name) VALUES ('00000000-0000-0000-0000-000002513201', 'MYK9-2513 Walk Test Club');
INSERT INTO public.club_access_requests (
  id, requester_person_id, requester_auth_user_id, requested_club_name, status,
  approved_club_id, reviewed_by, reviewed_at
)
VALUES ('00000000-0000-0000-0000-000002513301', '00000000-0000-0000-0000-000002513011',
  '00000000-0000-0000-0000-000002513101', 'MYK9-2513 Walk Test Club', 'approved',
  '00000000-0000-0000-0000-000002513201', '00000000-0000-0000-0000-000000682012', now() - interval '60 days');

CREATE TEMP TABLE zz_2513_counts AS
SELECT (SELECT count(*) FROM public.notifications) AS notices,
       (SELECT count(*) FROM public.access_request_email_jobs) AS jobs;
GRANT ALL ON zz_2513_counts TO PUBLIC;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_club uuid := '00000000-0000-0000-0000-000002513201';
  v_refused boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims',
    public.zz_claims_2513('00000000-0000-0000-0000-000000682102', 86400), true);
  BEGIN
    PERFORM public.set_club_authorization(v_club, true);
  EXCEPTION WHEN SQLSTATE 'MKAUT' THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'FAIL 2513.3 a waiting club with no request was authorized on a stale sign-in';
  END IF;

  PERFORM set_config('request.jwt.claims',
    public.zz_claims_2513('00000000-0000-0000-0000-000000682102', 30), true);
  PERFORM public.set_club_authorization(v_club, true);
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = v_club AND authorized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 2513.3 the club with no pending request was not authorized';
  END IF;

  -- Revoke on a stale session: a revoke removes access, it never needs the password.
  PERFORM set_config('request.jwt.claims',
    public.zz_claims_2513('00000000-0000-0000-0000-000000682102', 86400), true);
  PERFORM public.set_club_authorization(v_club, false);
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = v_club AND authorized_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL 2513.3 revoke did not clear the authorization';
  END IF;

  PERFORM set_config('request.jwt.claims',
    public.zz_claims_2513('00000000-0000-0000-0000-000000682102', 30), true);
  PERFORM public.set_club_authorization(v_club, true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clubs
      WHERE id = '00000000-0000-0000-0000-000002513201' AND authorized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 2513.3 re-authorizing after a revoke did not authorize';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.club_access_requests
      WHERE id = '00000000-0000-0000-0000-000002513301' AND status = 'approved'
        AND reviewed_at < now() - interval '59 days') THEN
    RAISE EXCEPTION 'FAIL 2513.3 the old approved request was rewritten';
  END IF;
  IF (SELECT notices FROM zz_2513_counts) <> (SELECT count(*) FROM public.notifications)
     OR (SELECT jobs FROM zz_2513_counts) <> (SELECT count(*) FROM public.access_request_email_jobs) THEN
    RAISE EXCEPTION 'FAIL 2513.3 authorizing or re-authorizing with no pending request told someone';
  END IF;
  RAISE NOTICE 'PASS 2513.3 no pending request: authorizes, revokes and re-authorizes, sends nothing';
END;
$$;

-- 2513.4 A site admin creating a club: authorized at once, no password, and a waiting
-- request for another club is left alone (the AFTER INSERT trigger is not an approval).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  public.zz_claims_2513('00000000-0000-0000-0000-000000682102', NULL), true);
INSERT INTO public.clubs (id, name) VALUES ('00000000-0000-0000-0000-000002513202', 'MYK9-2513 Admin Made');
SELECT set_config('request.jwt.claims', '', true);
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clubs
      WHERE id = '00000000-0000-0000-0000-000002513202' AND authorized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 2513.4 a site admin''s new club did not start authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.club_access_requests
      WHERE id = (SELECT request_id FROM zz_2513 WHERE label = 'decline') AND status = 'pending') THEN
    RAISE EXCEPTION 'FAIL 2513.4 creating a club touched a waiting request';
  END IF;
  RAISE NOTICE 'PASS 2513.4 a site admin''s own new club needs no password and touches no request';
END;
$$;

-- 2513.5 Decline without the option removes nothing; with it, the request is denied
-- and the club is deleted and its grants deactivated in one transaction; a club with
-- a live show refuses (MK011) and the request stays pending.
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES ('00000000-0000-0000-0000-000002513401', 'MYK9-2513 Live Show', 'AKC',
  current_date, current_date, 'draft', (SELECT club_id FROM zz_2513 WHERE label = 'shows'));

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  public.zz_claims_2513('00000000-0000-0000-0000-000000682102', 86400), true);
SELECT public.review_club_access_request(
  (SELECT request_id FROM zz_2513 WHERE label = 'decline'), 'denied', NULL, NULL, 'Not a real club');
SELECT public.review_club_access_request(
  (SELECT request_id FROM zz_2513 WHERE label = 'delete'), 'denied', NULL, NULL, 'Duplicate', true);

DO $$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    PERFORM public.review_club_access_request(
      (SELECT request_id FROM zz_2513 WHERE label = 'shows'), 'denied', NULL, NULL, 'Has shows', true);
  EXCEPTION WHEN SQLSTATE 'MK011' THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'FAIL 2513.5 declined and deleted a club that has a live show';
  END IF;

  BEGIN
    PERFORM public.review_club_access_request(
      (SELECT request_id FROM zz_2513 WHERE label = 'shows'), 'approved', NULL, NULL, NULL, true);
    RAISE EXCEPTION 'FAIL 2513.5 the delete flag was accepted on an approval';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.club_access_requests r JOIN public.clubs c ON c.id = r.created_club_id
    WHERE r.id = (SELECT request_id FROM zz_2513 WHERE label = 'decline')
      AND r.status = 'denied' AND r.review_note = 'Not a real club' AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL 2513.5 a plain decline must deny the request and remove nothing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.club_access_requests r JOIN public.clubs c ON c.id = r.created_club_id
    WHERE r.id = (SELECT request_id FROM zz_2513 WHERE label = 'delete')
      AND r.status = 'denied' AND r.review_note = 'Duplicate' AND c.deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL 2513.5 decline with delete did not deny the request and delete the club';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE club_id = (SELECT club_id FROM zz_2513 WHERE label = 'delete') AND is_active
  ) THEN
    RAISE EXCEPTION 'FAIL 2513.5 the deleted club still has active role grants';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.club_access_requests r JOIN public.clubs c ON c.id = r.created_club_id
    WHERE r.id = (SELECT request_id FROM zz_2513 WHERE label = 'shows')
      AND r.status = 'pending' AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL 2513.5 a refused delete left the request half-denied';
  END IF;
  RAISE NOTICE 'PASS 2513.5 decline removes nothing unless asked; delete is one transaction and honors MK011';
END;
$$;

-- 2513.6 The grant contract: signed-in only on the public doors, and no client
-- role can call the private core.
DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('set_club_authorization', 'review_club_access_request')
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL 2513.6 % must be callable by signed-in users only', v_fn;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'review_club_access_request') <> 1 THEN
    RAISE EXCEPTION 'FAIL 2513.6 review_club_access_request must have exactly one overload';
  END IF;
  IF has_function_privilege('anon', 'private.authorize_club_core(uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.authorize_club_core(uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 2513.6 the private core is callable by a client role';
  END IF;
  RAISE NOTICE 'PASS 2513.6 grants: signed-in only, one review overload, core closed to clients';
END;
$$;

-- 2513.7 A NULL decision or NULL authorized flag is refused (22023) and changes nothing.
-- The stale-doors club still has its pending request and is unauthorized.
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_club uuid := (SELECT club_id FROM zz_2513 WHERE label = 'stale');
  v_request uuid := (SELECT request_id FROM zz_2513 WHERE label = 'stale');
  v_refused boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    public.zz_claims_2513('00000000-0000-0000-0000-000000682102', 30), true);

  v_refused := false;
  BEGIN
    PERFORM public.set_club_authorization(v_club, NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'FAIL 2513.7 set_club_authorization accepted a NULL flag';
  END IF;

  v_refused := false;
  BEGIN
    PERFORM public.review_club_access_request(v_request, NULL);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'FAIL 2513.7 review_club_access_request accepted a NULL decision';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.club_access_requests r JOIN public.clubs c ON c.id = r.created_club_id
    WHERE r.id = (SELECT request_id FROM zz_2513 WHERE label = 'stale')
      AND r.status = 'pending' AND c.authorized_at IS NULL AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL 2513.7 a NULL argument changed the club or the request';
  END IF;
  RAISE NOTICE 'PASS 2513.7 NULL flag or decision is refused and changes nothing';
END;
$$;

ROLLBACK;
