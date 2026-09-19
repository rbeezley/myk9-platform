-- Behavioral coverage for MYK9-682.
-- All fixtures and role changes roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000682001', 'MYK9-682 Scope Club');

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

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000682102', true);

DO $$
DECLARE
  v_club_id uuid;
  v_club_admin_count integer;
  v_secretary_count integer;
  v_member_count integer;
  v_secretary_audit_count integer;
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

INSERT INTO public.club_access_requests (
  id,
  requester_person_id,
  requester_auth_user_id,
  requested_club_name
)
VALUES (
  '00000000-0000-0000-0000-000000682022',
  '00000000-0000-0000-0000-000000682011',
  '00000000-0000-0000-0000-000000682101',
  'MYK9-682 Rollback Club'
);

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
      '00000000-0000-0000-0000-000000682022',
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
  WHERE id = '00000000-0000-0000-0000-000000682022';

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

ROLLBACK;
