-- MYK9-1634: submit_show_entries owns a form's submission status, and waived entries never
-- count toward what a form owes.
--
-- Asserts:
--   S1 group payment on a fresh form: total 3000, paid 30, status 'paid';
--   S2 a waived-only fresh form owes $0 and reads 'waived' (the entry keeps its $30 fee);
--   S3 a waived add-on onto a paid form is money-neutral (total, paid, status, method);
--   S4 a check add-on onto a paid form grows the total and reopens it as 'pending';
--   S5 an exhibitor's own add-on onto a form paid by check succeeds and reopens it;
--   S6 "Paid in full" charges only what is owed, never the waived entry;
--   G1 an unprivileged caller still cannot set a status;
--   G2 nor reopen a form that owes nothing more.
--
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/myk9_1634_submission_status_test.sql
-- All fixtures roll back.

BEGIN;

-- Online entries ON for this file's show (MYK9-979), so the exhibitor case can submit.
ALTER TABLE public.shows ALTER COLUMN online_entries_enabled SET DEFAULT true;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001634a10', 'MYK9-1634 Status Club');

-- Entries open, show a month out: every entry is a 30.00 pre-entry.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments,
                          pre_entry_fee, day_of_show_fee)
SELECT '00000000-0000-0000-0000-000001634a11', 'MYK9-1634 Status Show', 'UKC',
       (today + 30)::timestamp AT TIME ZONE 'UTC', (today + 30)::timestamp AT TIME ZONE 'UTC',
       '00000000-0000-0000-0000-000001634a10', 'published',
       (today - 30)::timestamp AT TIME ZONE 'UTC', (today + 10)::timestamp AT TIME ZONE 'UTC',
       true, true, 30, 35
FROM (SELECT (now() AT TIME ZONE 'UTC')::date AS today) AS anchor;

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-000001634a21', '00000000-0000-0000-0000-000001634a11',
        'MYK9-1634 Trial', (now() AT TIME ZONE 'UTC')::date + 30, 'UKC', 'Nosework', 'UTC');

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000001634a31', '00000000-0000-0000-0000-000001634a21',
   'Interior Novice A', 'Interior', 'Novice', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000001634a32', '00000000-0000-0000-0000-000001634a21',
   'Container Novice A', 'Container', 'Novice', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000001634a33', '00000000-0000-0000-0000-000001634a21',
   'Exterior Novice A', 'Exterior', 'Novice', 'upcoming', 'manual', 30);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000001634a01', 'Group', 'Exhibitor', 'myk9-1634-group@example.test'),
  ('00000000-0000-0000-0000-000001634a02', 'Waived', 'Exhibitor', 'myk9-1634-waived@example.test'),
  ('00000000-0000-0000-0000-000001634a03', 'Self', 'Exhibitor', 'myk9-1634-self@example.test'),
  ('00000000-0000-0000-0000-000001634a09', 'MYK9-1634', 'Secretary', 'myk9-1634-secretary@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001634b03', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1634-self@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001634b09', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1634-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000001634a03'::uuid, '00000000-0000-0000-0000-000001634b03'::uuid),
  ('00000000-0000-0000-0000-000001634a09'::uuid, '00000000-0000-0000-0000-000001634b09'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001634a09', roles.id,
       '00000000-0000-0000-0000-000001634a10', true,
       '00000000-0000-0000-0000-000001634b09'
FROM public.roles WHERE roles.name = 'secretary';

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES
  ('00000000-0000-0000-0000-000001634a41', 'MYK9-1634 Group Dog', 'Group', 'Beagle', 'active',
   '00000000-0000-0000-0000-000001634a01'),
  ('00000000-0000-0000-0000-000001634a42', 'MYK9-1634 Waived Dog', 'Waived', 'Beagle', 'active',
   '00000000-0000-0000-0000-000001634a02'),
  ('00000000-0000-0000-0000-000001634a43', 'MYK9-1634 Self Dog', 'Self', 'Beagle', 'active',
   '00000000-0000-0000-0000-000001634a03');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000001634a41', 'UKC', 'UKC16340001', true),
  ('00000000-0000-0000-0000-000001634a42', 'UKC', 'UKC16340002', true),
  ('00000000-0000-0000-0000-000001634a43', 'UKC', 'UKC16340003', true);

INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES
  ('00000000-0000-0000-0000-000001634a51', '00000000-0000-0000-0000-000001634a11',
   '00000000-0000-0000-0000-000001634a01', 'pending'),
  ('00000000-0000-0000-0000-000001634a52', '00000000-0000-0000-0000-000001634a11',
   '00000000-0000-0000-0000-000001634a02', 'pending'),
  ('00000000-0000-0000-0000-000001634a53', '00000000-0000-0000-0000-000001634a11',
   '00000000-0000-0000-0000-000001634a03', 'pending');

CREATE OR REPLACE FUNCTION pg_temp.form1634(p_id uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(' ', total_amount, paid_amount, payment_status, payment_method)
    FROM public.enrollments WHERE id = p_id
$$;

CREATE TEMP TABLE t1634s_expect (label text, got text, want text) ON COMMIT DROP;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001634b09', true);

-- S1. Group payment on a fresh form.
SELECT public.submit_show_entries(
  '00000000-0000-0000-0000-000001634a11', '00000000-0000-0000-0000-000001634a51',
  jsonb_build_array(jsonb_build_object('dog_id', '00000000-0000-0000-0000-000001634a41', 'class_id', '00000000-0000-0000-0000-000001634a31',
    'handler_name', 'Group Exhibitor', 'client_fee_cents', 3000)),
  '00000000-0000-0000-0000-000001634c01', 'group_payment');
RESET ROLE;
INSERT INTO t1634s_expect
SELECT 'S1 group payment on a fresh form is paid',
       pg_temp.form1634('00000000-0000-0000-0000-000001634a51'), '3000 30.00 paid group_payment';

-- S2. A waived-only fresh form.
SET LOCAL ROLE authenticated;
SELECT public.submit_show_entries(
  '00000000-0000-0000-0000-000001634a11', '00000000-0000-0000-0000-000001634a52',
  jsonb_build_array(jsonb_build_object('dog_id', '00000000-0000-0000-0000-000001634a42', 'class_id', '00000000-0000-0000-0000-000001634a31',
    'handler_name', 'Waived Exhibitor', 'client_fee_cents', 3000)),
  '00000000-0000-0000-0000-000001634c02', 'waived');
RESET ROLE;
INSERT INTO t1634s_expect
SELECT 'S2 a waived-only form owes $0 and reads waived',
       pg_temp.form1634('00000000-0000-0000-0000-000001634a52'), '0 0.00 waived waived';
INSERT INTO t1634s_expect
SELECT 'S2b the waived entry keeps its normal fee for the record',
       (SELECT concat_ws(' ', entry_fee, payment_status) FROM public.entries
         WHERE registration_id = '00000000-0000-0000-0000-000001634a52'), '30.00 waived';

-- S3. A waived add-on onto the paid group form changes nothing about the form.
SET LOCAL ROLE authenticated;
SELECT public.submit_show_entries(
  '00000000-0000-0000-0000-000001634a11', '00000000-0000-0000-0000-000001634a51',
  jsonb_build_array(jsonb_build_object('dog_id', '00000000-0000-0000-0000-000001634a41', 'class_id', '00000000-0000-0000-0000-000001634a32',
    'handler_name', 'Group Exhibitor', 'client_fee_cents', 3000)),
  '00000000-0000-0000-0000-000001634c03', 'waived');
RESET ROLE;
INSERT INTO t1634s_expect
SELECT 'S3 a waived add-on onto a paid form is money-neutral',
       pg_temp.form1634('00000000-0000-0000-0000-000001634a51'), '3000 30.00 paid group_payment';

-- S4. A check add-on onto the paid form grows the total and reopens it.
SET LOCAL ROLE authenticated;
SELECT public.submit_show_entries(
  '00000000-0000-0000-0000-000001634a11', '00000000-0000-0000-0000-000001634a51',
  jsonb_build_array(jsonb_build_object('dog_id', '00000000-0000-0000-0000-000001634a41', 'class_id', '00000000-0000-0000-0000-000001634a33',
    'handler_name', 'Group Exhibitor', 'client_fee_cents', 3000)),
  '00000000-0000-0000-0000-000001634c04', 'check');
RESET ROLE;
INSERT INTO t1634s_expect
SELECT 'S4 a check add-on onto a paid form reopens it as pending',
       pg_temp.form1634('00000000-0000-0000-0000-000001634a51'), '6000 30.00 pending check';

-- S5. The exhibitor's form is paid by check at the desk, then the exhibitor adds an entry.
SET LOCAL ROLE authenticated;
SELECT public.submit_show_entries(
  '00000000-0000-0000-0000-000001634a11', '00000000-0000-0000-0000-000001634a53',
  jsonb_build_array(jsonb_build_object('dog_id', '00000000-0000-0000-0000-000001634a43', 'class_id', '00000000-0000-0000-0000-000001634a31',
    'handler_name', 'Self Exhibitor', 'client_fee_cents', 3000)),
  '00000000-0000-0000-0000-000001634c05', 'check',
  jsonb_build_object('method', 'check', 'reference', '1634'));
RESET ROLE;
INSERT INTO t1634s_expect
SELECT 'S5a fixture: the desk payment settles the form',
       pg_temp.form1634('00000000-0000-0000-0000-000001634a53'), '3000 30.00 paid_by_check check';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001634b03', true);
SELECT public.submit_show_entries(
  '00000000-0000-0000-0000-000001634a11', '00000000-0000-0000-0000-000001634a53',
  jsonb_build_array(jsonb_build_object('dog_id', '00000000-0000-0000-0000-000001634a43', 'class_id', '00000000-0000-0000-0000-000001634a32',
    'handler_name', 'Self Exhibitor', 'client_fee_cents', 3000)),
  '00000000-0000-0000-0000-000001634c06', 'check');
RESET ROLE;
INSERT INTO t1634s_expect
SELECT 'S5 an exhibitor add-on onto a paid form succeeds and reopens it',
       pg_temp.form1634('00000000-0000-0000-0000-000001634a53'), '6000 30.00 pending check';

-- G1 / G2. The guard, as an unprivileged caller (the exhibitor's claims, RLS out of the way
-- so only the trigger can refuse).
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001634b03', true);
DO $$
BEGIN
  BEGIN
    UPDATE public.enrollments SET payment_status = 'paid_by_check'
     WHERE id = '00000000-0000-0000-0000-000001634a53';
    INSERT INTO t1634s_expect VALUES ('G1 an exhibitor cannot set a status', 'allowed', 'refused');
  EXCEPTION WHEN raise_exception THEN
    INSERT INTO t1634s_expect VALUES ('G1 an exhibitor cannot set a status', 'refused', 'refused');
  END;
  -- The waived form owes nothing, so reopening it is not the derived change.
  BEGIN
    UPDATE public.enrollments SET payment_status = 'pending'
     WHERE id = '00000000-0000-0000-0000-000001634a52';
    INSERT INTO t1634s_expect
    VALUES ('G2 nor reopen a form that owes nothing more', 'allowed', 'refused');
  EXCEPTION WHEN raise_exception THEN
    INSERT INTO t1634s_expect
    VALUES ('G2 nor reopen a form that owes nothing more', 'refused', 'refused');
  END;
END;
$$;

-- S6. "Paid in full" on the group form: $90 of entries, $30 waived, $30 received, so $30.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001634b09', true);
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000001634a51', 'payment', NULL, 'check', NULL, '1634', NULL);
RESET ROLE;
INSERT INTO t1634s_expect
SELECT 'S6 Paid in full charges only what is owed, never the waived entry',
       pg_temp.form1634('00000000-0000-0000-0000-000001634a51'), '6000 60.00 paid_by_check check';

DO $$
DECLARE r record; v_fail int := 0;
BEGIN
  FOR r IN SELECT * FROM t1634s_expect LOOP
    IF r.got IS DISTINCT FROM r.want THEN
      RAISE WARNING 'FAIL %: got %, want %', r.label, r.got, r.want;
      v_fail := v_fail + 1;
    ELSE
      RAISE NOTICE 'PASS %', r.label;
    END IF;
  END LOOP;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'FAIL MYK9-1634: % submission-status case(s) wrong', v_fail;
  END IF;
END;
$$;

ROLLBACK;
