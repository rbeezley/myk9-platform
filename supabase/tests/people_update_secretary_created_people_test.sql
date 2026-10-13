-- Behavioral contract for 20261013143900_people_update_secretary_created_people.sql.
--
-- A secretary may edit a mail-in person (no sign-in account) she created while she still
-- holds a staff role, or one created from a show she manages, on top of the existing
-- self / entered-in-her-show / site-admin arms. A person with a sign-in account stays
-- theirs even when a secretary created the row. The people_update policy, the two RPCs
-- (update_person_details, update_person_details_versioned) and can_edit_person() must
-- agree cell for cell, and the MYK9-710 / MYK9-712 identity and status guards still hold
-- on a person she may edit.
--
-- Every denial is paired with a positive control on the same caller, and the untied
-- person's denial is paired with proof she can READ it, so a rule that denied everything
-- (or a fixture she could not see) fails this test rather than passing it.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('secretary', 'people_update fixture', true), ('exhibitor', 'people_update fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name) VALUES
  ('00000000-0000-0000-0000-0000e0e0c001', 'Person Edit Club One'),
  ('00000000-0000-0000-0000-0000e0e0c002', 'Person Edit Club Two');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-0000e0e0a001', 'Person Edit Show One', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-0000e0e0c001', 'published'),
  ('00000000-0000-0000-0000-0000e0e0a002', 'Person Edit Show Two', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-0000e0e0c002', 'published');

-- Inserted as the migration owner (no auth.uid()), so guard_creation_attribution keeps the
-- supplied created_by / created_from_show_id, as it does for seed and service writes.
--   b01 the secretary of club one, b02 a person WITH an account whose row the secretary
--   created from her show, b03 a deactivated secretary of club one; m01..m05 mail-in
--   people with no account.
INSERT INTO public.people (id, first_name, last_name, email, created_by, created_from_show_id) VALUES
  ('00000000-0000-0000-0000-0000e0e0b001', 'PersonEdit', 'Secretary', 'personedit-sec@example.test', NULL, NULL),
  ('00000000-0000-0000-0000-0000e0e0b002', 'PersonEdit', 'Account', 'personedit-account@example.test',
   '00000000-0000-0000-0000-0000e0e00101', '00000000-0000-0000-0000-0000e0e0a001'),
  ('00000000-0000-0000-0000-0000e0e0b003', 'PersonEdit', 'ExSecretary', 'personedit-exsec@example.test', NULL, NULL),
  ('00000000-0000-0000-0000-0000e0e0d001', 'PersonEdit', 'CreatedBySec', 'pe-m1@example.test',
   '00000000-0000-0000-0000-0000e0e00101', NULL),
  ('00000000-0000-0000-0000-0000e0e0d002', 'PersonEdit', 'FromShowOne', 'pe-m2@example.test',
   '00000000-0000-0000-0000-0000e0e00102', '00000000-0000-0000-0000-0000e0e0a001'),
  ('00000000-0000-0000-0000-0000e0e0d003', 'PersonEdit', 'Untied', 'pe-m3@example.test',
   '00000000-0000-0000-0000-0000e0e00102', NULL),
  ('00000000-0000-0000-0000-0000e0e0d004', 'PersonEdit', 'FromShowTwo', 'pe-m4@example.test',
   '00000000-0000-0000-0000-0000e0e00102', '00000000-0000-0000-0000-0000e0e0a002'),
  ('00000000-0000-0000-0000-0000e0e0d005', 'PersonEdit', 'ByExSec', 'pe-m5@example.test',
   '00000000-0000-0000-0000-0000e0e00103', NULL);

-- After the people rows, so signup adoption (matched on email) does not create its own.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-0000e0e00101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'personedit-sec@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-0000e0e00102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'personedit-account@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-0000e0e00103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'personedit-exsec@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people AS person
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-0000e0e0b001'::uuid, '00000000-0000-0000-0000-0000e0e00101'::uuid),
  ('00000000-0000-0000-0000-0000e0e0b002'::uuid, '00000000-0000-0000-0000-0000e0e00102'::uuid),
  ('00000000-0000-0000-0000-0000e0e0b003'::uuid, '00000000-0000-0000-0000-0000e0e00103'::uuid)
) AS fixture(person_id, auth_id)
WHERE person.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, roles.id, fixture.club_id, fixture.is_active, fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-0000e0e0b001'::uuid, 'secretary', '00000000-0000-0000-0000-0000e0e0c001'::uuid, true,  '00000000-0000-0000-0000-0000e0e00101'::uuid),
  ('00000000-0000-0000-0000-0000e0e0b002'::uuid, 'exhibitor', NULL::uuid,                                     true,  '00000000-0000-0000-0000-0000e0e00102'::uuid),
  ('00000000-0000-0000-0000-0000e0e0b003'::uuid, 'secretary', '00000000-0000-0000-0000-0000e0e0c001'::uuid, false, '00000000-0000-0000-0000-0000e0e00103'::uuid)
) AS fixture(person_id, role_name, club_id, is_active, auth_id)
JOIN public.roles ON roles.name = fixture.role_name;

DO $$
DECLARE
  secretary    uuid := '00000000-0000-0000-0000-0000e0e00101';
  account_user uuid := '00000000-0000-0000-0000-0000e0e00102';
  ex_sec       uuid := '00000000-0000-0000-0000-0000e0e00103';
  account_person uuid := '00000000-0000-0000-0000-0000e0e0b002';
  created_by_sec uuid := '00000000-0000-0000-0000-0000e0e0d001';
  from_show_one  uuid := '00000000-0000-0000-0000-0000e0e0d002';
  untied         uuid := '00000000-0000-0000-0000-0000e0e0d003';
  from_show_two  uuid := '00000000-0000-0000-0000-0000e0e0d004';
  by_ex_sec      uuid := '00000000-0000-0000-0000-0000e0e0d005';
  expectation record;
  n integer;
  rpc_ok boolean;
  versioned_ok boolean;
  v_version integer;
BEGIN
  SET LOCAL ROLE authenticated;

  ------------------------------------------------------------------
  -- The secretary: policy UPDATE, both RPCs and can_edit_person() must all match.
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', secretary, 'role', 'authenticated')::text, true);

  -- She can READ the untied person and the account holder, so their denials below are the
  -- rule's, not fixtures she cannot see.
  SELECT count(*) INTO n FROM public.people WHERE id IN (untied, account_person);
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL secretary could read % of the 2 denied people; their denials would prove nothing', n;
  END IF;

  FOR expectation IN
    SELECT * FROM (VALUES
      (created_by_sec, true,  'a mail-in person she created, while she is still a secretary'),
      (from_show_one,  true,  'a mail-in person created from a show of her club'),
      (untied,         false, 'a mail-in person with no tie to her shows'),
      (from_show_two,  false, 'a mail-in person created from another club''s show'),
      (by_ex_sec,      false, 'a mail-in person another (now deactivated) secretary created'),
      (account_person, false, 'a person with a sign-in account, even one she created from her show')
    ) AS v(person_id, allowed, label)
  LOOP
    UPDATE public.people SET phone = '555-0100' WHERE id = expectation.person_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF (n = 1) IS DISTINCT FROM expectation.allowed THEN
      RAISE EXCEPTION 'FAIL secretary policy UPDATE on % changed % row(s), expected %',
        expectation.label, n, CASE WHEN expectation.allowed THEN 1 ELSE 0 END;
    END IF;

    BEGIN
      PERFORM public.update_person_details(expectation.person_id, jsonb_build_object('city', 'Edited'));
      rpc_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN
      rpc_ok := false;
    END;
    IF rpc_ok IS DISTINCT FROM expectation.allowed THEN
      RAISE EXCEPTION 'FAIL update_person_details() disagrees with people_update for the secretary on %', expectation.label;
    END IF;

    BEGIN
      SELECT p.version INTO v_version FROM public.people p WHERE p.id = expectation.person_id;
      PERFORM public.update_person_details_versioned(
        expectation.person_id, v_version, jsonb_build_object('state', 'TX')
      );
      versioned_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN
      versioned_ok := false;
    END;
    IF versioned_ok IS DISTINCT FROM expectation.allowed THEN
      RAISE EXCEPTION 'FAIL update_person_details_versioned() disagrees with people_update for the secretary on %', expectation.label;
    END IF;

    IF public.can_edit_person(expectation.person_id) IS DISTINCT FROM expectation.allowed THEN
      RAISE EXCEPTION 'FAIL can_edit_person() disagrees with people_update for the secretary on %', expectation.label;
    END IF;

    -- The edit panel's email-lock read answers only for a person she may update.
    IF (public.person_email_lock_facts(expectation.person_id) IS NOT NULL) IS DISTINCT FROM expectation.allowed THEN
      RAISE EXCEPTION 'FAIL person_email_lock_facts() disagrees with people_update for the secretary on %', expectation.label;
    END IF;
  END LOOP;

  -- A role-less mail-in person with no entries keeps an editable email (MYK9-710 allows it).
  UPDATE public.people SET email = 'pe-m1-fixed@example.test' WHERE id = created_by_sec;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL secretary could not fix the email of the mail-in person she created (% row)', n;
  END IF;

  -- The RPC write really landed on the same row (positive control for the RPC arm).
  SELECT count(*) INTO n FROM public.people
  WHERE id = created_by_sec AND city = 'Edited' AND state = 'TX' AND phone = '555-0100';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL the secretary''s allowed edits did not land on the person she created';
  END IF;

  -- created_from_show_id is frozen on UPDATE (guard_creation_attribution), and USING reads
  -- the stored row, so stamping one of her shows onto the untied person does not open it.
  UPDATE public.people SET created_from_show_id = '00000000-0000-0000-0000-0000e0e0a001' WHERE id = untied;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL secretary claimed the untied person by writing created_from_show_id (% row)', n;
  END IF;

  -- MYK9-710: on a person she MAY edit, linking a sign-in account stays site-admin only.
  BEGIN
    UPDATE public.people SET auth_user_id = secretary WHERE id = created_by_sec;
    RAISE EXCEPTION 'FAIL secretary linked a sign-in account to a mail-in person';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- MYK9-712: on a person she MAY edit, account suspension stays site-admin only.
  BEGIN
    UPDATE public.people SET status = 'suspended' WHERE id = created_by_sec;
    RAISE EXCEPTION 'FAIL secretary changed a person''s account status';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Once the mail-in person she created signs up (adoption links auth_user_id), the record is
  -- theirs: every path refuses her. The signup is real: an auth.users row whose email matches
  -- the person, adopted by the signup trigger, exactly as in production.
  RESET ROLE;
  UPDATE public.people SET email = 'pe-adopted@example.test' WHERE id = created_by_sec;
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-0000e0e00104', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'pe-adopted@example.test', '', now(), now(), now(),
    '{}', '{}', false, false, false
  );
  SELECT count(*) INTO n FROM public.people
  WHERE id = created_by_sec AND auth_user_id = '00000000-0000-0000-0000-0000e0e00104';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL fixture: signup did not adopt the mail-in person; the refusal below would prove nothing';
  END IF;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', secretary, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.update_person_details(created_by_sec, jsonb_build_object('city', 'After adoption'));
    RAISE EXCEPTION 'FAIL secretary edited a person after they signed up and were adopted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF public.can_edit_person(created_by_sec) THEN
    RAISE EXCEPTION 'FAIL can_edit_person() still offers an adopted person to the secretary';
  END IF;

  -- Not on the server (e.g. created on a device, not uploaded yet) is unanswered, not "no".
  IF public.can_edit_person('00000000-0000-0000-0000-0000e0e0dfff') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL can_edit_person() of an unknown person id is not NULL';
  END IF;

  ------------------------------------------------------------------
  -- The deactivated secretary loses even the person she created: access follows the role.
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ex_sec, 'role', 'authenticated')::text, true);
  UPDATE public.people SET phone = '555-0101' WHERE id = by_ex_sec;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 OR public.can_edit_person(by_ex_sec) THEN
    RAISE EXCEPTION 'FAIL a deactivated secretary could still edit the person she created (% row)', n;
  END IF;

  ------------------------------------------------------------------
  -- The account holder keeps her own record (positive control for the self arm).
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', account_user, 'role', 'authenticated')::text, true);
  UPDATE public.people SET phone = '555-0102' WHERE id = account_person;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 OR NOT public.can_edit_person(account_person) THEN
    RAISE EXCEPTION 'FAIL the account holder could not edit her own record (% row)', n;
  END IF;
  -- ...and only her own: she created m02..m04 but holds no staff role.
  UPDATE public.people SET phone = '555-0103' WHERE id = untied;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL a non-staff creator edited a mail-in person (% row)', n;
  END IF;

  RESET ROLE;

  ------------------------------------------------------------------
  -- anon may call neither new function.
  ------------------------------------------------------------------
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.can_edit_person(untied);
    RAISE EXCEPTION 'FAIL anon executed can_edit_person()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.person_edit_allowed(untied, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL anon executed person_edit_allowed()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.update_person_details(untied, '{}'::jsonb);
    RAISE EXCEPTION 'FAIL anon executed update_person_details()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.update_person_details_versioned(untied, NULL, '{}'::jsonb);
    RAISE EXCEPTION 'FAIL anon executed update_person_details_versioned()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.person_email_lock_facts(untied);
    RAISE EXCEPTION 'FAIL anon executed person_email_lock_facts()';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'PASS people_update: a secretary edits the mail-in people she created or that '
    'came from her shows, not an untied person, another club''s, or anyone with a sign-in '
    'account; the policy, both RPCs, can_edit_person() and person_email_lock_facts() agree; '
    'account linking and suspension stay site-admin only; a deactivated secretary loses '
    'hers; the account holder keeps her own; anon is refused every function';
END;
$$;

ROLLBACK;
