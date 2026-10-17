-- Behavioral coverage for MYK9-1235 (club registry numbers).
-- All fixtures and role changes roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000001235001', 'MYK9-1235 Club A'),
  ('00000000-0000-0000-0000-000001235002', 'MYK9-1235 Club B'),
  ('00000000-0000-0000-0000-000001235003', 'MYK9-1235 Club Gone');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001235011', 'MYK9', 'ClubAdmin', 'myk9-1235-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000001235012', 'MYK9', 'Bystander', 'myk9-1235-bystander@example.test', NULL),
  ('00000000-0000-0000-0000-000001235013', 'MYK9', 'SiteAdmin', 'myk9-1235-site@example.test', NULL),
  ('00000000-0000-0000-0000-000001235014', 'MYK9', 'Requester', 'myk9-1235-requester@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001235101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1235-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001235102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1235-bystander@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001235103', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1235-site@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001235104', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1235-requester@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = CASE email
  WHEN 'myk9-1235-admin@example.test' THEN '00000000-0000-0000-0000-000001235101'::uuid
  WHEN 'myk9-1235-bystander@example.test' THEN '00000000-0000-0000-0000-000001235102'::uuid
  WHEN 'myk9-1235-site@example.test' THEN '00000000-0000-0000-0000-000001235103'::uuid
  WHEN 'myk9-1235-requester@example.test' THEN '00000000-0000-0000-0000-000001235104'::uuid
END
WHERE email LIKE 'myk9-1235-%@example.test';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, granted_by, auth_user_id)
SELECT '00000000-0000-0000-0000-000001235011', id, '00000000-0000-0000-0000-000001235001', true,
       '00000000-0000-0000-0000-000001235013', '00000000-0000-0000-0000-000001235101'
FROM public.roles WHERE name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, is_active, granted_by, auth_user_id)
SELECT '00000000-0000-0000-0000-000001235013', id, true,
       '00000000-0000-0000-0000-000001235013', '00000000-0000-0000-0000-000001235103'
FROM public.roles WHERE name = 'site_admin';

-- Club A is public (authorized); club B stays unauthorized. Superuser session,
-- so the authorization guard's API-roles-only carve-out lets this through.
UPDATE public.clubs SET authorized_at = now()
WHERE id = '00000000-0000-0000-0000-000001235001';

-- ---------------------------------------------------------------------------
-- 1. Two numbers for one club, and the uniqueness / shape rules (owner session).
-- ---------------------------------------------------------------------------
INSERT INTO public.club_registry_numbers (club_id, organization, number)
VALUES
  ('00000000-0000-0000-0000-000001235001', 'AKC', '1234'),
  ('00000000-0000-0000-0000-000001235001', 'UKC', 'U-77');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.club_registry_numbers
      WHERE club_id = '00000000-0000-0000-0000-000001235001') <> 2 THEN
    RAISE EXCEPTION 'FAIL 1235.1 a club could not hold an AKC and a UKC number at once';
  END IF;
  RAISE NOTICE 'PASS 1235.1 a club holds AKC and UKC numbers at once';

  BEGIN
    INSERT INTO public.club_registry_numbers (club_id, organization, number)
    VALUES ('00000000-0000-0000-0000-000001235001', 'AKC', '9999');
    RAISE EXCEPTION 'FAIL 1235.2 a second AKC number for the same club was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS 1235.2 one number per club per organization';
  END;

  BEGIN
    INSERT INTO public.club_registry_numbers (club_id, organization, number)
    VALUES ('00000000-0000-0000-0000-000001235002', 'FCI', '1');
    RAISE EXCEPTION 'FAIL 1235.3 an unknown organization was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 1235.3 only AKC, UKC and ASCA are accepted';
  END;

  BEGIN
    INSERT INTO public.club_registry_numbers (club_id, organization, number)
    VALUES ('00000000-0000-0000-0000-000001235002', 'ASCA', '  ');
    RAISE EXCEPTION 'FAIL 1235.4 a blank number was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 1235.4 a blank or untrimmed number is refused';
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The request-shape validator.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF public.normalize_club_numbers('{"AKC":"  55 ","UKC":"","ASCA":null}'::jsonb) <> '{"AKC":"55"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 1235.5 normalize_club_numbers did not trim and drop blanks';
  END IF;
  IF public.normalize_club_numbers(NULL) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 1235.5 NULL did not normalize to {}';
  END IF;
  BEGIN
    PERFORM public.normalize_club_numbers('{"FCI":"1"}'::jsonb);
    RAISE EXCEPTION 'FAIL 1235.5 an unknown organization was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  RAISE NOTICE 'PASS 1235.5 normalize_club_numbers trims, drops blanks and refuses unknown organizations';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS: club admin writes only their own club; strangers write nothing;
--    anon reads exactly what clubs_select lets it see.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001235101', true);

DO $$
BEGIN
  INSERT INTO public.club_registry_numbers (club_id, organization, number)
  VALUES ('00000000-0000-0000-0000-000001235001', 'ASCA', '31');
  UPDATE public.club_registry_numbers SET number = '1235'
  WHERE club_id = '00000000-0000-0000-0000-000001235001' AND organization = 'AKC';
  IF NOT EXISTS (
    SELECT 1 FROM public.club_registry_numbers
    WHERE club_id = '00000000-0000-0000-0000-000001235001' AND organization = 'AKC' AND number = '1235'
  ) THEN
    RAISE EXCEPTION 'FAIL 1235.6 the club admin could not edit their own club''s number';
  END IF;
  RAISE NOTICE 'PASS 1235.6 a club admin adds and edits their own club''s numbers';

  BEGIN
    INSERT INTO public.club_registry_numbers (club_id, organization, number)
    VALUES ('00000000-0000-0000-0000-000001235002', 'AKC', '5');
    RAISE EXCEPTION 'FAIL 1235.7 a club admin wrote another club''s number';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 1235.7 a club admin cannot write another club''s numbers';
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001235102', true);

DO $$
DECLARE
  v_rows integer;
BEGIN
  BEGIN
    INSERT INTO public.club_registry_numbers (club_id, organization, number)
    VALUES ('00000000-0000-0000-0000-000001235001', 'ASCA', '99');
    RAISE EXCEPTION 'FAIL 1235.8 a non-admin inserted a number';
  EXCEPTION WHEN insufficient_privilege OR unique_violation THEN
    NULL;
  END;
  UPDATE public.club_registry_numbers SET number = 'hacked'
  WHERE club_id = '00000000-0000-0000-0000-000001235001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL 1235.8 a non-admin updated % number row(s)', v_rows;
  END IF;
  DELETE FROM public.club_registry_numbers WHERE club_id = '00000000-0000-0000-0000-000001235001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL 1235.8 a non-admin deleted % number row(s)', v_rows;
  END IF;
  RAISE NOTICE 'PASS 1235.8 a non-admin cannot insert, update or delete numbers';
END;
$$;

RESET ROLE;
INSERT INTO public.club_registry_numbers (club_id, organization, number)
VALUES ('00000000-0000-0000-0000-000001235002', 'UKC', 'hidden-with-its-club');

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.club_registry_numbers
      WHERE club_id = '00000000-0000-0000-0000-000001235001') <> 3 THEN
    RAISE EXCEPTION 'FAIL 1235.9 anon cannot read an authorized club''s numbers';
  END IF;
  IF EXISTS (SELECT 1 FROM public.club_registry_numbers
             WHERE club_id = '00000000-0000-0000-0000-000001235002') THEN
    RAISE EXCEPTION 'FAIL 1235.9 anon read the numbers of a club it cannot see';
  END IF;
  RAISE NOTICE 'PASS 1235.9 anon reads numbers only where it can read the club';
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 4. Deleting a club takes its numbers with it.
-- ---------------------------------------------------------------------------
INSERT INTO public.club_registry_numbers (club_id, organization, number)
VALUES ('00000000-0000-0000-0000-000001235003', 'AKC', '404');
DELETE FROM public.clubs WHERE id = '00000000-0000-0000-0000-000001235003';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.club_registry_numbers
             WHERE club_id = '00000000-0000-0000-0000-000001235003') THEN
    RAISE EXCEPTION 'FAIL 1235.10 deleting a club left its numbers behind';
  END IF;
  RAISE NOTICE 'PASS 1235.10 deleting a club deletes its numbers';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Onboarding requests: at least one number on INSERT, none required later.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001235104', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.onboarding_requests (
      auth_user_id, club_name, organization, contact_name, contact_email
    ) VALUES (
      '00000000-0000-0000-0000-000001235104', 'MYK9-1235 No Number', 'AKC', 'Req', 'req@example.test'
    );
    RAISE EXCEPTION 'FAIL 1235.11 an onboarding request with no club number was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS 1235.11 an onboarding request with no club number is refused';
  END;

  BEGIN
    INSERT INTO public.onboarding_requests (
      auth_user_id, club_name, organization, contact_name, contact_email, club_numbers
    ) VALUES (
      '00000000-0000-0000-0000-000001235104', 'MYK9-1235 Blank', 'AKC', 'Req', 'req@example.test',
      '{"AKC":"   ","UKC":""}'::jsonb
    );
    RAISE EXCEPTION 'FAIL 1235.12 an onboarding request with only blank numbers was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  INSERT INTO public.onboarding_requests (
    auth_user_id, club_name, organization, contact_name, contact_email, club_numbers
  ) VALUES (
    '00000000-0000-0000-0000-000001235104', 'MYK9-1235 AKC Only', 'AKC', 'Req', 'req@example.test',
    '{"AKC":" 4321 "}'::jsonb
  );
  RAISE NOTICE 'PASS 1235.12 an AKC-only onboarding request is accepted';
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF (SELECT club_numbers FROM public.onboarding_requests WHERE club_name = 'MYK9-1235 AKC Only')
     <> '{"AKC":"4321"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 1235.13 the stored onboarding numbers were not trimmed';
  END IF;
  UPDATE public.onboarding_requests SET status = 'contacted' WHERE club_name = 'MYK9-1235 AKC Only';
  RAISE NOTICE 'PASS 1235.13 numbers are stored trimmed and the admin queue can still update the row';
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Club-access request RPC and approval.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001235104', true);

DO $$
DECLARE
  v_request_id uuid;
BEGIN
  BEGIN
    PERFORM public.submit_club_access_request('MYK9-1235 Empty Club', NULL, NULL, '{}'::jsonb);
    RAISE EXCEPTION 'FAIL 1235.14 a club request with no number was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS 1235.14 a club request with no club number is refused';
  END;
  BEGIN
    PERFORM public.submit_club_access_request('MYK9-1235 Empty Club', NULL, NULL, '{"UKC":" "}'::jsonb);
    RAISE EXCEPTION 'FAIL 1235.14 a club request with a blank number was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.submit_club_access_request('MYK9-1235 Legacy Caller');
    RAISE EXCEPTION 'FAIL 1235.14 the legacy 3-argument call was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS 1235.14 an old client calling without numbers gets the friendly refusal';
  END;

  v_request_id := public.submit_club_access_request(
    'MYK9-1235 New Club', NULL, NULL, '{"AKC":"777","UKC":"U-8"}'::jsonb
  );
  PERFORM set_config('myk9.test_1235_request', v_request_id::text, true);
  PERFORM set_config(
    'myk9.test_1235_request_owned',
    public.submit_club_access_request(
      'MYK9-1235 Owned Club Ask', NULL, NULL, '{"AKC":"999"}'::jsonb
    )::text,
    true
  );
  PERFORM set_config(
    'myk9.test_1235_request_existing',
    public.submit_club_access_request(
      'MYK9-1235 Existing Club Ask', NULL, NULL, '{"AKC":"888"}'::jsonb
    )::text,
    true
  );
  RAISE NOTICE 'PASS 1235.15 an AKC and UKC club request is accepted';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001235103', true);

DO $$
DECLARE
  v_club_id uuid;
BEGIN
  v_club_id := public.review_club_access_request(
    current_setting('myk9.test_1235_request')::uuid, 'approved', NULL, NULL, NULL
  );
  IF (SELECT jsonb_object_agg(organization, number)
      FROM public.club_registry_numbers WHERE club_id = v_club_id)
     <> '{"AKC":"777","UKC":"U-8"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 1235.16 approval did not copy the request''s numbers to the new club';
  END IF;
  -- Re-approval (idempotent retry) must leave them alone and not error.
  PERFORM public.review_club_access_request(
    current_setting('myk9.test_1235_request')::uuid, 'approved', NULL, NULL, NULL
  );
  IF (SELECT count(*) FROM public.club_registry_numbers WHERE club_id = v_club_id) <> 2 THEN
    RAISE EXCEPTION 'FAIL 1235.16 re-approval changed the new club''s numbers';
  END IF;
  RAISE NOTICE 'PASS 1235.16 approving a new-club request copies its numbers to the new club';

  -- Existing club B has a UKC number only: approval fills its blank AKC from the
  -- request (888) and leaves its own UKC alone.
  PERFORM public.review_club_access_request(
    current_setting('myk9.test_1235_request_existing')::uuid, 'approved',
    '00000000-0000-0000-0000-000001235002', NULL, NULL
  );
  IF (SELECT jsonb_object_agg(organization, number)
      FROM public.club_registry_numbers
      WHERE club_id = '00000000-0000-0000-0000-000001235002')
     <> '{"AKC":"888","UKC":"hidden-with-its-club"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 1235.17 approving onto a club with no AKC did not fill the blank only';
  END IF;
  RAISE NOTICE 'PASS 1235.17 an existing club has its blank organizations filled at approval';

  -- Existing club A already has AKC 1235: a request carrying AKC 999 is ignored.
  PERFORM public.review_club_access_request(
    current_setting('myk9.test_1235_request_owned')::uuid, 'approved',
    '00000000-0000-0000-0000-000001235001', NULL, NULL
  );
  IF (SELECT number FROM public.club_registry_numbers
      WHERE club_id = '00000000-0000-0000-0000-000001235001' AND organization = 'AKC') <> '1235' THEN
    RAISE EXCEPTION 'FAIL 1235.18 approval overwrote an existing club''s own AKC number';
  END IF;
  RAISE NOTICE 'PASS 1235.18 an existing club keeps its own number when the request carries another';
END;
$$;

RESET ROLE;

ROLLBACK;
