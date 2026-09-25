-- MYK9-677 behavioral contract for 20260925181939_myk9_677_submit_entries_records_payment.sql.
--
-- A secretary-received payment is recorded INSIDE submit_show_entries, in the
-- same transaction as the entries:
--   1. entries + exactly one ledger row, keyed on the submission id; the
--      enrollment total grows by the server fee and paid_amount is added once;
--   2. a replayed submission id records nothing again;
--   3. a ledger failure after the entries are written rolls the entries back;
--   4. with no p_payment the function behaves as before (no ledger row, the
--      entry stays pending, the enrollment total is the client's to write);
--   5. an exhibitor cannot pass a payment.
--
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/myk9_677_submit_entries_payment_test.sql
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000677a10', 'MYK9-677 Submit Club');

-- Entries open, show a month out: every entry is a 30.00 pre-entry.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments,
                          pre_entry_fee, day_of_show_fee)
SELECT '00000000-0000-0000-0000-000000677a11', 'MYK9-677 Submit Show', 'UKC',
       (today + 30)::timestamp AT TIME ZONE 'UTC', (today + 30)::timestamp AT TIME ZONE 'UTC',
       '00000000-0000-0000-0000-000000677a10', 'published',
       (today - 30)::timestamp AT TIME ZONE 'UTC', (today + 10)::timestamp AT TIME ZONE 'UTC',
       true, true, 30, 35
FROM (SELECT (now() AT TIME ZONE 'UTC')::date AS today) AS anchor;

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-000000677a21', '00000000-0000-0000-0000-000000677a11',
        'MYK9-677 Trial', (now() AT TIME ZONE 'UTC')::date + 30, 'UKC', 'Nosework', 'UTC');

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000000677a31', '00000000-0000-0000-0000-000000677a21',
   'Interior Novice A', 'Interior', 'Novice', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000677a32', '00000000-0000-0000-0000-000000677a21',
   'Container Novice A', 'Container', 'Novice', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000677a33', '00000000-0000-0000-0000-000000677a21',
   'Exterior Novice A', 'Exterior', 'Novice', 'upcoming', 'manual', 30);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000677a01', 'MYK9-677', 'Exhibitor', 'myk9-677-exhibitor@example.test'),
  ('00000000-0000-0000-0000-000000677a02', 'MYK9-677', 'Secretary', 'myk9-677-secretary@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000677b01', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-677-exhibitor@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000677b02', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-677-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000677a01'::uuid, '00000000-0000-0000-0000-000000677b01'::uuid),
  ('00000000-0000-0000-0000-000000677a02'::uuid, '00000000-0000-0000-0000-000000677b02'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000677a02', roles.id,
       '00000000-0000-0000-0000-000000677a10', true,
       '00000000-0000-0000-0000-000000677b02'
FROM public.roles WHERE roles.name = 'secretary';

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES ('00000000-0000-0000-0000-000000677a41', 'MYK9-677 Dog', 'Ledger', 'Beagle', 'active',
        '00000000-0000-0000-0000-000000677a01');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES ('00000000-0000-0000-0000-000000677a41', 'UKC', 'UKC67700001', true);

INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES ('00000000-0000-0000-0000-000000677a51', '00000000-0000-0000-0000-000000677a11',
        '00000000-0000-0000-0000-000000677a01', 'pending');

-- Show B, another club's, with an enrollment the show-A secretary may not touch.
INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000677c10', 'MYK9-677 Other Club');
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES ('00000000-0000-0000-0000-000000677c11', 'MYK9-677 Other Show', 'UKC',
        current_date + 30, current_date + 30, '00000000-0000-0000-0000-000000677c10');
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES ('00000000-0000-0000-0000-000000677c51', '00000000-0000-0000-0000-000000677c11',
        '00000000-0000-0000-0000-000000677a01', 'pending');

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  result jsonb;
  replay jsonb;
  v_rows integer;
  v_amount numeric;
  v_key uuid;
  v_total integer;
  v_paid numeric;
  v_status text;
  v_entry_status text;
  v_entries integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000677b02', true);

  -- 1. entries + one ledger row, atomically.
  result := public.submit_show_entries(
    '00000000-0000-0000-0000-000000677a11', '00000000-0000-0000-0000-000000677a51',
    jsonb_build_array(jsonb_build_object(
      'dog_id', '00000000-0000-0000-0000-000000677a41',
      'class_id', '00000000-0000-0000-0000-000000677a31',
      'handler_name', 'MYK9-677 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000677a61', 'check',
    jsonb_build_object('method', 'check',
                       'received_on', ((now() AT TIME ZONE 'UTC')::date - 3)::text,
                       'reference', '1042'));

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL case 1 committed no entry: %', result;
  END IF;
  SELECT count(*), sum(amount), max(client_payment_id::text)::uuid
    INTO v_rows, v_amount, v_key
    FROM public.show_payments WHERE enrollment_id = '00000000-0000-0000-0000-000000677a51';
  SELECT total_amount, paid_amount, payment_status INTO v_total, v_paid, v_status
    FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000677a51';
  SELECT payment_status INTO v_entry_status
    FROM public.entries WHERE id = (result->'entries'->0->>'entry_id')::uuid;
  IF v_rows <> 1 OR v_amount <> 30 OR v_key <> '00000000-0000-0000-0000-000000677a61'
     OR v_total <> 3000 OR v_paid <> 30 OR v_status <> 'paid_by_check' OR v_entry_status <> 'paid' THEN
    RAISE EXCEPTION 'FAIL case 1: rows %, amount %, key %, total %, paid %, status %, entry %',
      v_rows, v_amount, v_key, v_total, v_paid, v_status, v_entry_status;
  END IF;
  RAISE NOTICE 'PASS a submission with a received check writes the entry and one ledger row; paid_amount added once';

  -- 2. replay: same submission id, nothing recorded again.
  replay := public.submit_show_entries(
    '00000000-0000-0000-0000-000000677a11', '00000000-0000-0000-0000-000000677a51',
    jsonb_build_array(jsonb_build_object(
      'dog_id', '00000000-0000-0000-0000-000000677a41',
      'class_id', '00000000-0000-0000-0000-000000677a31',
      'handler_name', 'MYK9-677 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000677a61', 'check',
    jsonb_build_object('method', 'check', 'reference', '1042'));
  SELECT count(*) INTO v_rows FROM public.show_payments
   WHERE enrollment_id = '00000000-0000-0000-0000-000000677a51';
  SELECT count(*) INTO v_entries FROM public.entries
   WHERE registration_id = '00000000-0000-0000-0000-000000677a51';
  SELECT total_amount, paid_amount INTO v_total, v_paid
    FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000677a51';
  IF replay IS DISTINCT FROM result OR v_rows <> 1 OR v_entries <> 1 OR v_total <> 3000 OR v_paid <> 30 THEN
    RAISE EXCEPTION 'FAIL replay: rows %, entries %, total %, paid %', v_rows, v_entries, v_total, v_paid;
  END IF;
  RAISE NOTICE 'PASS a replayed submission records nothing again';

  -- 3. a ledger failure after the entries are written rolls them back.
  BEGIN
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000000677a11', '00000000-0000-0000-0000-000000677a51',
      jsonb_build_array(jsonb_build_object(
        'dog_id', '00000000-0000-0000-0000-000000677a41',
        'class_id', '00000000-0000-0000-0000-000000677a32',
        'handler_name', 'MYK9-677 Exhibitor', 'client_fee_cents', 3000)),
      '00000000-0000-0000-0000-000000677a62', 'cash',
      -- A received date in the future: the ledger core refuses it after the
      -- entry INSERT has already run.
      jsonb_build_object('method', 'cash',
                         'received_on', ((now() AT TIME ZONE 'UTC')::date + 5)::text));
    RAISE EXCEPTION 'FAIL case 3: a future received date was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  SELECT count(*) INTO v_entries FROM public.entries
   WHERE class_id = '00000000-0000-0000-0000-000000677a32';
  SELECT count(*) INTO v_rows FROM public.entry_submissions
   WHERE id = '00000000-0000-0000-0000-000000677a62';
  IF v_entries <> 0 OR v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL case 3: the entry (%) or submission (%) survived a failed payment',
      v_entries, v_rows;
  END IF;
  RAISE NOTICE 'PASS a failed ledger write rolls the entries back with it';

  -- 4. no p_payment: exactly the old behaviour.
  result := public.submit_show_entries(
    '00000000-0000-0000-0000-000000677a11', '00000000-0000-0000-0000-000000677a51',
    jsonb_build_array(jsonb_build_object(
      'dog_id', '00000000-0000-0000-0000-000000677a41',
      'class_id', '00000000-0000-0000-0000-000000677a33',
      'handler_name', 'MYK9-677 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000677a63', 'check');
  SELECT payment_status INTO v_entry_status
    FROM public.entries WHERE id = (result->'entries'->0->>'entry_id')::uuid;
  SELECT count(*) INTO v_rows FROM public.show_payments
   WHERE enrollment_id = '00000000-0000-0000-0000-000000677a51';
  SELECT total_amount, paid_amount INTO v_total, v_paid
    FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000677a51';
  IF v_entry_status <> 'pending' OR v_rows <> 1 OR v_total <> 3000 OR v_paid <> 30 THEN
    RAISE EXCEPTION 'FAIL case 4: entry %, ledger rows %, total %, paid %',
      v_entry_status, v_rows, v_total, v_paid;
  END IF;
  RAISE NOTICE 'PASS with no payment the function records nothing and leaves the entry pending';
END;
$$;

-- 6. an official of show A cannot write onto show B's enrollment (Codex round 10).
DO $$
DECLARE
  v_total integer; v_paid numeric; v_status text; v_entries integer; v_rows integer; v_subs integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000677b02', true);

  BEGIN
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000000677a11', '00000000-0000-0000-0000-000000677c51',
      jsonb_build_array(jsonb_build_object(
        'dog_id', '00000000-0000-0000-0000-000000677a41',
        'class_id', '00000000-0000-0000-0000-000000677a32',
        'handler_name', 'MYK9-677 Exhibitor', 'client_fee_cents', 3000)),
      '00000000-0000-0000-0000-000000677a65', 'cash',
      jsonb_build_object('method', 'cash'));
    RAISE EXCEPTION 'FAIL a show-A secretary paid onto show B''s enrollment';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'registration % is not an enrollment on show %' THEN RAISE; END IF;
  END;

  -- The same hole without a payment: entries of show A on show B's enrollment.
  BEGIN
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000000677a11', '00000000-0000-0000-0000-000000677c51',
      jsonb_build_array(jsonb_build_object(
        'dog_id', '00000000-0000-0000-0000-000000677a41',
        'class_id', '00000000-0000-0000-0000-000000677a32',
        'handler_name', 'MYK9-677 Exhibitor', 'client_fee_cents', 3000)),
      '00000000-0000-0000-0000-000000677a66', 'check');
    RAISE EXCEPTION 'FAIL a show-A secretary attached entries to show B''s enrollment';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'registration % is not an enrollment on show %' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.record_enrollment_payment(
      '00000000-0000-0000-0000-000000677c51', 'payment', 10, 'cash', NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL a show-A secretary recorded a payment on show B''s enrollment';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- Nothing was written anywhere.
  SELECT total_amount, paid_amount, payment_status INTO v_total, v_paid, v_status
    FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000677c51';
  SELECT count(*) INTO v_entries FROM public.entries
   WHERE registration_id = '00000000-0000-0000-0000-000000677c51';
  SELECT count(*) INTO v_rows FROM public.show_payments
   WHERE enrollment_id = '00000000-0000-0000-0000-000000677c51';
  SELECT count(*) INTO v_subs FROM public.entry_submissions
   WHERE id IN ('00000000-0000-0000-0000-000000677a65', '00000000-0000-0000-0000-000000677a66');
  IF v_total IS NOT NULL OR v_paid <> 0 OR v_status <> 'pending'
     OR v_entries <> 0 OR v_rows <> 0 OR v_subs <> 0 THEN
    RAISE EXCEPTION 'FAIL show B''s enrollment changed: total %, paid %, status %, entries %, ledger %, submissions %',
      v_total, v_paid, v_status, v_entries, v_rows, v_subs;
  END IF;
  RAISE NOTICE 'PASS a show-A secretary cannot touch show B''s enrollment: refused, nothing written';
END;
$$;

-- 5. an exhibitor cannot pass a payment.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000677b01', true);
  BEGIN
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000000677a11', '00000000-0000-0000-0000-000000677a51',
      jsonb_build_array(jsonb_build_object(
        'dog_id', '00000000-0000-0000-0000-000000677a41',
        'class_id', '00000000-0000-0000-0000-000000677a32',
        'handler_name', 'MYK9-677 Exhibitor', 'client_fee_cents', 3000)),
      '00000000-0000-0000-0000-000000677a64', 'cash',
      jsonb_build_object('method', 'cash'));
    RAISE EXCEPTION 'FAIL an exhibitor recorded a received payment';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'not authorized to record payments%' THEN
      RAISE;
    END IF;
    RAISE NOTICE 'PASS an exhibitor cannot pass a payment';
  END;
END;
$$;

ROLLBACK;
