-- Behavioral test for 20260914184500_block_entries_into_started_classes.sql (MYK9-516).
--
-- `submit_show_entries` must refuse an exhibitor's entry into a class the judge
-- has already started or finished, and must NOT refuse a show official's.
--
-- Why each case earns its place:
--   1. An exhibitor entering an 'in_progress' class is rejected with SQLSTATE
--      42501 and the exhibitor-facing message the wizard toasts verbatim. The
--      message is asserted, not just the code: `submitPaymentStep` shows
--      `getErrorMessage(error)`, so the RAISE text IS the user-visible copy and
--      a reworded RAISE is a user-visible change.
--   2. A 'completed' class is rejected too, with its own message. Blocking only
--      'in_progress' would pass a naive test and still sell an entry into a
--      class that finished an hour ago.
--   3. An 'upcoming' class in the SAME show still commits. Without this the
--      guard could be refusing everything and every rejection case would still
--      be green.
--   4. A show secretary IS allowed into the 'in_progress' class. This is the
--      assumed product rule (late entry at the desk); if Richard decides
--      otherwise, this is the case that changes.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/submit_entries_started_class_test.sql
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000516010', 'MYK9-516 Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments, pre_entry_fee)
VALUES (
  '00000000-0000-0000-0000-000000516100', 'MYK9-516 Started Class Show', 'AKC',
  current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000516010', 'published',
  (current_date - 10)::timestamptz, (current_date + 4)::timestamptz,
  true, true, 30
);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES (
  '00000000-0000-0000-0000-000000516200', '00000000-0000-0000-0000-000000516100',
  'MYK9-516 Saturday Trial', current_date + 5, 'AKC', 'Scent Work'
);

-- status_source = 'manual' so the auto-derivation trigger cannot recompute these
-- back to 'upcoming' when the fixtures below insert entries.
INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000000516301', '00000000-0000-0000-0000-000000516200',
   'Interior Novice A', 'Interior', 'Novice', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000516302', '00000000-0000-0000-0000-000000516200',
   'Interior Advanced', 'Interior', 'Advanced', 'in_progress', 'manual', 30),
  ('00000000-0000-0000-0000-000000516303', '00000000-0000-0000-0000-000000516200',
   'Interior Excellent', 'Interior', 'Excellent', 'completed', 'manual', 30),
  ('00000000-0000-0000-0000-000000516304', '00000000-0000-0000-0000-000000516200',
   'Container Novice A', 'Container', 'Novice', 'in_progress', 'manual', 30);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000516001', 'MYK9-516', 'Exhibitor', 'myk9-516-exhibitor@example.test'),
  ('00000000-0000-0000-0000-000000516002', 'MYK9-516', 'Secretary', 'myk9-516-secretary@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000516101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-516-exhibitor@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000516102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-516-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000516001'::uuid, '00000000-0000-0000-0000-000000516101'::uuid),
  ('00000000-0000-0000-0000-000000516002'::uuid, '00000000-0000-0000-0000-000000516102'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000516002', roles.id,
       '00000000-0000-0000-0000-000000516010', true,
       '00000000-0000-0000-0000-000000516102'
FROM public.roles WHERE roles.name = 'secretary';

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
VALUES ('00000000-0000-0000-0000-000000516001', '00000000-0000-0000-0000-000000516101');

-- `breed` and `call_name` are NOT NULL without defaults on public.dogs.
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES
  ('00000000-0000-0000-0000-000000516401', 'MYK9-516 Dog One', 'Uno', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000516001'),
  ('00000000-0000-0000-0000-000000516402', 'MYK9-516 Dog Two', 'Dos', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000516001');

-- An entry needs a registration with the TRIAL'S registry (20260828210000), or
-- every case below would fail for a reason that has nothing to do with status.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000000516401', 'AKC', 'SR51600001', true),
  ('00000000-0000-0000-0000-000000516402', 'AKC', 'SR51600002', true);

INSERT INTO public.enrollments (id, show_id, handler_id)
VALUES ('00000000-0000-0000-0000-000000516500',
        '00000000-0000-0000-0000-000000516100',
        '00000000-0000-0000-0000-000000516001');

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  exhibitor_auth CONSTANT uuid := '00000000-0000-0000-0000-000000516101';
  secretary_auth CONSTANT uuid := '00000000-0000-0000-0000-000000516102';
  show_id        CONSTANT uuid := '00000000-0000-0000-0000-000000516100';
  enrollment_id  CONSTANT uuid := '00000000-0000-0000-0000-000000516500';
  dog_one        CONSTANT uuid := '00000000-0000-0000-0000-000000516401';
  dog_two        CONSTANT uuid := '00000000-0000-0000-0000-000000516402';
  upcoming_cls   CONSTANT uuid := '00000000-0000-0000-0000-000000516301';
  running_cls    CONSTANT uuid := '00000000-0000-0000-0000-000000516302';
  finished_cls   CONSTANT uuid := '00000000-0000-0000-0000-000000516303';
  staff_cls      CONSTANT uuid := '00000000-0000-0000-0000-000000516304';
  caught_state   text;
  caught_message text;
  result         jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', exhibitor_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', exhibitor_auth, 'role', 'authenticated')::text, true);

  ----------------------------------------------------------------------------
  -- 1. Exhibitor into a class the judge has started -> rejected, 42501, with
  --    the exhibitor-facing message the wizard toasts verbatim.
  ----------------------------------------------------------------------------
  caught_state := NULL;
  caught_message := NULL;
  BEGIN
    PERFORM public.submit_show_entries(
      show_id, enrollment_id,
      jsonb_build_array(jsonb_build_object(
        'dog_id', dog_one, 'class_id', running_cls,
        'handler_name', 'MYK9-516 Exhibitor', 'client_fee_cents', 3000)),
      '00000000-0000-0000-0000-000000516901'::uuid, 'check');
  EXCEPTION WHEN OTHERS THEN
    caught_state := SQLSTATE;
    caught_message := SQLERRM;
  END;

  IF caught_state IS NULL THEN
    RAISE EXCEPTION 'FAIL exhibitor entry into an in_progress class was accepted';
  END IF;
  IF caught_state <> '42501' THEN
    RAISE EXCEPTION 'FAIL in_progress rejection used SQLSTATE % (expected 42501): %',
      caught_state, caught_message;
  END IF;
  IF caught_message <> 'This class has already started, so it can no longer be entered online. Contact the show secretary about a late entry.' THEN
    RAISE EXCEPTION 'FAIL in_progress message is not the exhibitor-facing copy: %', caught_message;
  END IF;

  ----------------------------------------------------------------------------
  -- 2. Exhibitor into a finished class -> rejected, with its own message.
  ----------------------------------------------------------------------------
  caught_state := NULL;
  caught_message := NULL;
  BEGIN
    PERFORM public.submit_show_entries(
      show_id, enrollment_id,
      jsonb_build_array(jsonb_build_object(
        'dog_id', dog_one, 'class_id', finished_cls,
        'handler_name', 'MYK9-516 Exhibitor', 'client_fee_cents', 3000)),
      '00000000-0000-0000-0000-000000516902'::uuid, 'check');
  EXCEPTION WHEN OTHERS THEN
    caught_state := SQLSTATE;
    caught_message := SQLERRM;
  END;

  IF caught_state IS NULL THEN
    RAISE EXCEPTION 'FAIL exhibitor entry into a completed class was accepted';
  END IF;
  IF caught_state <> '42501' THEN
    RAISE EXCEPTION 'FAIL completed rejection used SQLSTATE % (expected 42501): %',
      caught_state, caught_message;
  END IF;
  IF caught_message <> 'This class has finished, so it can no longer be entered.' THEN
    RAISE EXCEPTION 'FAIL completed message is not the exhibitor-facing copy: %', caught_message;
  END IF;

  ----------------------------------------------------------------------------
  -- 3. Positive control: an upcoming class in the same show still commits.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    show_id, enrollment_id,
    jsonb_build_array(jsonb_build_object(
      'dog_id', dog_one, 'class_id', upcoming_cls,
      'handler_name', 'MYK9-516 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000516903'::uuid, 'check');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL upcoming class did not commit an entry: %', result;
  END IF;

  ----------------------------------------------------------------------------
  -- 4. A show secretary may still take a late entry into a running class.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', secretary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_auth, 'role', 'authenticated')::text, true);

  result := public.submit_show_entries(
    show_id, enrollment_id,
    jsonb_build_array(jsonb_build_object(
      'dog_id', dog_two, 'class_id', staff_cls,
      'handler_name', 'MYK9-516 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000516904'::uuid, 'secretary_paid');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL secretary late entry into an in_progress class was blocked: %', result;
  END IF;

  RAISE NOTICE 'PASS submit_entries_started_class_test';
END;
$$;

ROLLBACK;
