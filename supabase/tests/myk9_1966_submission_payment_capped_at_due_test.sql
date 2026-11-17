-- MYK9-1966: money received at submission never records more than the form still owes.
-- Behavioural contract for 20261117204700_myk9_1966_submission_payment_capped_at_due.sql.
--
-- A secretary adds a $30 class to a form and records money with it. Before this fix
-- submit_show_entries recorded the class's full server fee even when the money the form
-- already held had settled the add-on (MYK9-1961), so the form held more than it owed.
--
-- Asserts, with cash taken at submission (p_payment, the ledger path):
--   1. a form holding $40 beyond what it owes: nothing is recorded; the form holds $40 net
--      against $30 owed and the add-on is paid;
--   2. a form holding $10 beyond what it owes: only the $20 difference is recorded;
--   3. a form holding nothing extra: the full $30 is recorded, as before;
-- and the same three through 'group_payment' (money paid outside the desk ledger):
--   4. $40 held: paid_amount does not grow;
--   5. $10 held: paid_amount grows by $20;
--   6. nothing held: paid_amount grows by $30, as before;
--   7. 'secretary_paid' with no p_payment takes the same branch: $40 held, nothing added.
-- MYK9-2149, public.desk_addon_amount_to_collect, asked before each add-on:
--   8. it answers collect $0 / held $40, collect $20 / held $10, collect $30 / held $0, and
--      what it said to collect is exactly what the cap then recorded on every form;
--   9. a person with no form collects the whole add-on; an exhibitor (who may not take money
--      at the desk) is refused; anon cannot execute it.
--  11. the quote prices the add-on as the submission will, junior handler fee included: a $20
--      junior fee on a $30 class quotes and records the same amount (collect $10 on a form
--      holding $10; "covered" on a form holding $25, where the regular fee would not be);
--  12. a payment never records more than the expected_collect_cents the desk was quoted:
--      the rest stays owed.
--  10. the covered submit itself: no p_payment and no method (p_payment_method NULL). On a
--      form holding $40 the add-on settles to 'paid' with payment_method NULL (Entry
--      Management reads "Paid", never "Paid by cash"), nothing is recorded, and the form's
--      own method stays 'cash'. On a form whose held money is gone it stays owed: entry
--      'pending', form 'pending', and the form's recorded method is not blanked.
--
-- Money held beyond what a form owes is built the way it happens at the desk: classes paid
-- in cash at submission, then part of that money refunded (MYK9-1961: the refunded fees
-- leave what the form owes, the rest of the money stays held).
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated database; fixtures roll back.
-- Runs in CI (scripts/qa/run-behavioral-sql-tests.sh) or locally with `pnpm qa:sql-local`.

BEGIN;

-- Same reason as myk9_677_submit_entries_payment_test.sql: the fixture show takes online
-- entries. Transaction-local; the ROLLBACK restores the column default.
ALTER TABLE public.shows ALTER COLUMN online_entries_enabled SET DEFAULT true;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001966a10', 'MYK9-1966 Club');

-- Entries open, show a month out: every entry is a 30.00 pre-entry.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments,
                          pre_entry_fee, day_of_show_fee)
SELECT '00000000-0000-0000-0000-000001966a11', 'MYK9-1966 Show', 'UKC',
       (today + 30)::timestamp AT TIME ZONE 'UTC', (today + 30)::timestamp AT TIME ZONE 'UTC',
       '00000000-0000-0000-0000-000001966a10', 'published',
       (today - 30)::timestamp AT TIME ZONE 'UTC', (today + 10)::timestamp AT TIME ZONE 'UTC',
       true, true, 30, 35
FROM (SELECT (now() AT TIME ZONE 'UTC')::date AS today) AS anchor;

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-000001966a21', '00000000-0000-0000-0000-000001966a11',
        'MYK9-1966 Trial', (now() AT TIME ZONE 'UTC')::date + 30, 'UKC', 'Nosework', 'UTC');

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000001966a31', '00000000-0000-0000-0000-000001966a21',
   'Interior Novice A', 'Interior', 'Novice', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000001966a32', '00000000-0000-0000-0000-000001966a21',
   'Container Novice A', 'Container', 'Novice', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000001966a33', '00000000-0000-0000-0000-000001966a21',
   'Exterior Novice A', 'Exterior', 'Novice', 'upcoming', 'manual', 30);

-- The secretary (...a02) and one exhibitor, dog and form per case (...e<n>, ...d<n>, ...f<n>).
INSERT INTO public.people (id, first_name, last_name, email)
SELECT ('00000000-0000-0000-0000-000001966e0' || n)::uuid, 'MYK9-1966', 'Exhibitor ' || n,
       'myk9-1966-exhibitor-' || n || '@example.test'
  FROM generate_series(1, 7) AS n;
INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000001966a02', 'MYK9-1966', 'Secretary',
        'myk9-1966-secretary@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001966b02', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1966-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000001966b02'
 WHERE id = '00000000-0000-0000-0000-000001966a02';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001966a02', roles.id,
       '00000000-0000-0000-0000-000001966a10', true,
       '00000000-0000-0000-0000-000001966b02'
FROM public.roles WHERE roles.name = 'secretary';

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
SELECT ('00000000-0000-0000-0000-000001966d0' || n)::uuid, 'MYK9-1966 Dog ' || n, 'Cap',
       'Beagle', 'active', ('00000000-0000-0000-0000-000001966e0' || n)::uuid
  FROM generate_series(1, 7) AS n;

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT ('00000000-0000-0000-0000-000001966d0' || n)::uuid, 'UKC', 'UKC196600' || n, true
  FROM generate_series(1, 7) AS n;

INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
SELECT ('00000000-0000-0000-0000-000001966f0' || n)::uuid,
       '00000000-0000-0000-0000-000001966a11',
       ('00000000-0000-0000-0000-000001966e0' || n)::uuid, 'pending'
  FROM generate_series(1, 7) AS n;

-- One form's money and its desk ledger payments, as one comparable line.
CREATE FUNCTION pg_temp.form1966(p_n int) RETURNS text
LANGUAGE sql AS $$
  SELECT format('total=%s paid=%s refund=%s status=%s', en.total_amount,
                COALESCE(en.paid_amount, 0)::numeric(10, 2),
                COALESCE(en.refund_amount, 0)::numeric(10, 2), en.payment_status)
         || ' payments=' || COALESCE(
              (SELECT string_agg(sp.amount::numeric(10, 2)::text, ',' ORDER BY sp.amount)
                 FROM public.show_payments sp
                WHERE sp.enrollment_id = en.id AND sp.kind = 'payment'), 'none')
    FROM public.enrollments en
   WHERE en.id = ('00000000-0000-0000-0000-000001966f0' || p_n)::uuid $$;

-- The add-on's own entry status (class ...a33, or ...a32 for the $10-held forms).
CREATE FUNCTION pg_temp.addon1966(p_n int, p_class text) RETURNS text
LANGUAGE sql AS $$
  SELECT e.payment_status FROM public.entries e
   WHERE e.registration_id = ('00000000-0000-0000-0000-000001966f0' || p_n)::uuid
     AND e.class_id = ('00000000-0000-0000-0000-000001966a' || p_class)::uuid
     AND e.deleted_at IS NULL $$;

SET LOCAL ROLE authenticated;

-- Setup, as the secretary. Forms 1, 4, 7 hold $40 extra: two $30 classes paid in cash
-- ($60), $20 refunded. Forms 2, 5 hold $10 extra: one $30 class paid in cash, $20
-- refunded. Forms 3, 6 hold nothing.
DO $$
DECLARE
  n int;
  v_entry jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001966b02', true);

  FOREACH n IN ARRAY ARRAY[1, 4, 7] LOOP
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000001966a11', ('00000000-0000-0000-0000-000001966f0' || n)::uuid,
      jsonb_build_array(
        jsonb_build_object('dog_id', '00000000-0000-0000-0000-000001966d0' || n,
                           'class_id', '00000000-0000-0000-0000-000001966a31',
                           'handler_name', 'MYK9-1966 Exhibitor', 'client_fee_cents', 3000),
        jsonb_build_object('dog_id', '00000000-0000-0000-0000-000001966d0' || n,
                           'class_id', '00000000-0000-0000-0000-000001966a32',
                           'handler_name', 'MYK9-1966 Exhibitor', 'client_fee_cents', 3000)),
      ('00000000-0000-0000-0000-000001966c1' || n)::uuid, 'cash',
      jsonb_build_object('method', 'cash'));
    PERFORM public.record_enrollment_payment(
      ('00000000-0000-0000-0000-000001966f0' || n)::uuid, 'refund', 20, 'cash', NULL, NULL,
      'Cash Returned');
  END LOOP;

  FOREACH n IN ARRAY ARRAY[2, 5] LOOP
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000001966a11', ('00000000-0000-0000-0000-000001966f0' || n)::uuid,
      jsonb_build_array(
        jsonb_build_object('dog_id', '00000000-0000-0000-0000-000001966d0' || n,
                           'class_id', '00000000-0000-0000-0000-000001966a31',
                           'handler_name', 'MYK9-1966 Exhibitor', 'client_fee_cents', 3000)),
      ('00000000-0000-0000-0000-000001966c1' || n)::uuid, 'cash',
      jsonb_build_object('method', 'cash'));
    PERFORM public.record_enrollment_payment(
      ('00000000-0000-0000-0000-000001966f0' || n)::uuid, 'refund', 20, 'cash', NULL, NULL,
      'Cash Returned');
  END LOOP;
END;
$$;

RESET ROLE;
-- The setup is what the cases assume: owes nothing, holds $40 / $10 / nothing.
DO $$
DECLARE
  v_got text;
BEGIN
  FOR v_got IN
    SELECT format('%s:%s', n, pg_temp.form1966(n)) FROM generate_series(1, 7) AS n
  LOOP
    RAISE NOTICE 'setup %', v_got;
  END LOOP;
  IF (SELECT count(*) FROM public.enrollments en
       WHERE en.id IN (SELECT ('00000000-0000-0000-0000-000001966f0' || n)::uuid
                         FROM generate_series(1, 7) AS n)
         AND COALESCE(en.total_amount, 0) <> 0) <> 0 THEN
    RAISE EXCEPTION 'FAIL setup: a form still owes before its add-on';
  END IF;
  IF pg_temp.form1966(1) <> pg_temp.form1966(4) OR pg_temp.form1966(1) <> pg_temp.form1966(7)
     OR pg_temp.form1966(1) NOT LIKE 'total=0 paid=60.00 refund=20.00 %'
     OR pg_temp.form1966(2) <> pg_temp.form1966(5)
     OR pg_temp.form1966(2) NOT LIKE 'total=0 paid=30.00 refund=20.00 %'
     OR pg_temp.form1966(3) <> 'total=0 paid=0.00 refund=0.00 status=pending payments=none' THEN
    RAISE EXCEPTION 'FAIL setup: [%] [%] [%]',
      pg_temp.form1966(1), pg_temp.form1966(2), pg_temp.form1966(3);
  END IF;
  RAISE NOTICE 'PASS setup: forms hold $40, $10 and nothing beyond what they owe';
END;
$$;

-- 8. Before the add-ons: what the desk is told to collect, and what each form holds now.
CREATE TEMP TABLE t1966_quote (n int, collect_cents int, held_cents int, paid_before numeric)
  ON COMMIT DROP;
GRANT ALL ON t1966_quote TO authenticated;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001966b02', true);
  FOR n IN 1..7 LOOP
    INSERT INTO t1966_quote (n, collect_cents, held_cents)
    SELECT n, q.collect_cents, q.held_cents
      FROM public.desk_addon_amount_to_collect(
        '00000000-0000-0000-0000-000001966a11',
        ('00000000-0000-0000-0000-000001966e0' || n)::uuid,
        ARRAY[('00000000-0000-0000-0000-000001966a'
               || CASE WHEN n IN (2, 5) THEN '32' ELSE '33' END)::uuid],
        false) AS q;
  END LOOP;
END;
$$;

RESET ROLE;
UPDATE t1966_quote q SET paid_before = COALESCE(en.paid_amount, 0)
  FROM public.enrollments en
 WHERE en.id = ('00000000-0000-0000-0000-000001966f0' || q.n)::uuid;

DO $$
DECLARE
  v_got text;
  v_want text := '1:0/4000 2:2000/1000 3:3000/0 4:0/4000 5:2000/1000 6:3000/0 7:0/4000';
BEGIN
  SELECT string_agg(format('%s:%s/%s', n, collect_cents, held_cents), ' ' ORDER BY n)
    INTO v_got FROM t1966_quote;
  IF v_got IS DISTINCT FROM v_want THEN
    RAISE EXCEPTION 'FAIL desk_addon_amount_to_collect quotes: got [%], want [%]', v_got, v_want;
  END IF;
  RAISE NOTICE 'PASS desk_addon_amount_to_collect quotes collect/held: %', v_got;
END;
$$;

-- The add-ons: a $30 class on each form.
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  n int;
  v_method text;
  v_class text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001966b02', true);
  FOR n IN 1..7 LOOP
    v_method := CASE WHEN n <= 3 THEN 'cash' WHEN n = 7 THEN 'secretary_paid'
                     ELSE 'group_payment' END;
    v_class := CASE WHEN n IN (2, 5) THEN '32' ELSE '33' END;
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000001966a11', ('00000000-0000-0000-0000-000001966f0' || n)::uuid,
      jsonb_build_array(jsonb_build_object(
        'dog_id', '00000000-0000-0000-0000-000001966d0' || n,
        'class_id', '00000000-0000-0000-0000-000001966a' || v_class,
        'handler_name', 'MYK9-1966 Exhibitor', 'client_fee_cents', 3000)),
      ('00000000-0000-0000-0000-000001966c2' || n)::uuid, v_method,
      CASE WHEN v_method = 'cash' THEN jsonb_build_object('method', 'cash') END);
  END LOOP;
END;
$$;

RESET ROLE;
DO $$
DECLARE
  v_case record;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      (1, '33', 'cash: $40 held covers the $30 add-on, nothing recorded',
       'total=3000 paid=60.00 refund=20.00 status=paid payments=60.00'),
      (2, '32', 'cash: $10 held, only the $20 difference recorded',
       'total=3000 paid=50.00 refund=20.00 status=paid_by_cash payments=20.00,30.00'),
      (3, '33', 'cash: nothing held, the full $30 recorded',
       'total=3000 paid=30.00 refund=0.00 status=paid_by_cash payments=30.00'),
      (4, '33', 'group_payment: $40 held covers the $30 add-on, paid_amount unchanged',
       'total=3000 paid=60.00 refund=20.00 status=paid payments=60.00'),
      (5, '32', 'group_payment: $10 held, paid_amount grows by the $20 difference',
       'total=3000 paid=50.00 refund=20.00 status=paid payments=30.00'),
      (6, '33', 'group_payment: nothing held, paid_amount grows by the full $30',
       'total=3000 paid=30.00 refund=0.00 status=paid payments=none'),
      (7, '33', 'secretary_paid: $40 held covers the $30 add-on, paid_amount unchanged',
       'total=3000 paid=60.00 refund=20.00 status=paid payments=60.00')
    ) AS t(n, class_suffix, label, want)
  LOOP
    IF pg_temp.form1966(v_case.n) IS DISTINCT FROM v_case.want THEN
      RAISE EXCEPTION 'FAIL % (form %): got [%], want [%]',
        v_case.label, v_case.n, pg_temp.form1966(v_case.n), v_case.want;
    END IF;
    IF pg_temp.addon1966(v_case.n, v_case.class_suffix) IS DISTINCT FROM 'paid' THEN
      RAISE EXCEPTION 'FAIL % (form %): the add-on is %, not paid',
        v_case.label, v_case.n, pg_temp.addon1966(v_case.n, v_case.class_suffix);
    END IF;
    RAISE NOTICE 'PASS %: %', v_case.label, v_case.want;
  END LOOP;
END;
$$;

-- 8 (agreement). What the desk was told to collect is exactly what the cap recorded.
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT q.n, q.collect_cents,
           round((COALESCE(en.paid_amount, 0) - q.paid_before) * 100)::int AS recorded_cents
      FROM t1966_quote q
      JOIN public.enrollments en
        ON en.id = ('00000000-0000-0000-0000-000001966f0' || q.n)::uuid
     ORDER BY q.n
  LOOP
    IF v_row.recorded_cents IS DISTINCT FROM v_row.collect_cents THEN
      RAISE EXCEPTION 'FAIL form %: the desk was told to collect % cents, the cap recorded %',
        v_row.n, v_row.collect_cents, v_row.recorded_cents;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS on every form the quoted amount to collect equals what the cap recorded';
END;
$$;

-- 9. No form yet: the whole add-on. An exhibitor is refused.
INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000001966e09', 'MYK9-1966', 'No Form',
        'myk9-1966-no-form@example.test');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001966b09', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1966-no-form@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000001966b09'
 WHERE id = '00000000-0000-0000-0000-000001966e09';

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_collect int;
  v_held int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001966b02', true);
  SELECT q.collect_cents, q.held_cents INTO v_collect, v_held
    FROM public.desk_addon_amount_to_collect(
      '00000000-0000-0000-0000-000001966a11', '00000000-0000-0000-0000-000001966e09',
      ARRAY['00000000-0000-0000-0000-000001966a31', '00000000-0000-0000-0000-000001966a32']::uuid[],
      false) AS q;
  IF v_collect IS DISTINCT FROM 6000 OR v_held IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FAIL no form: collect %, held %', v_collect, v_held;
  END IF;
  RAISE NOTICE 'PASS a person with no form collects the whole add-on';

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001966b09', true);
  BEGIN
    PERFORM public.desk_addon_amount_to_collect(
      '00000000-0000-0000-0000-000001966a11', '00000000-0000-0000-0000-000001966e01',
      ARRAY['00000000-0000-0000-0000-000001966a33']::uuid[], false);
    RAISE EXCEPTION 'FAIL an exhibitor was told what another form holds';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS an exhibitor cannot ask what a form holds';
  END;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.desk_addon_amount_to_collect(uuid, uuid, uuid[], boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.desk_addon_amount_to_collect(uuid, uuid, uuid[], boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.enrollment_due_cents(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'private.enrollment_due_cents(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL desk_addon_amount_to_collect / enrollment_due_cents grants';
  END IF;
  RAISE NOTICE 'PASS desk_addon_amount_to_collect is authenticated-only; enrollment_due_cents is not callable by clients';
END;
$$;

-- 10. The covered submit: no payment, no method.
INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000001966e0a', 'MYK9-1966', 'Covered', 'myk9-1966-covered@example.test'),
  ('00000000-0000-0000-0000-000001966e0b', 'MYK9-1966', 'Moved', 'myk9-1966-moved@example.test');
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES
  ('00000000-0000-0000-0000-000001966d0a', 'MYK9-1966 Dog A', 'Cap', 'Beagle', 'active',
   '00000000-0000-0000-0000-000001966e0a'),
  ('00000000-0000-0000-0000-000001966d0b', 'MYK9-1966 Dog B', 'Cap', 'Beagle', 'active',
   '00000000-0000-0000-0000-000001966e0b');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES ('00000000-0000-0000-0000-000001966d0a', 'UKC', 'UKC19660A', true),
       ('00000000-0000-0000-0000-000001966d0b', 'UKC', 'UKC19660B', true);
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method)
VALUES
  ('00000000-0000-0000-0000-000001966f0a', '00000000-0000-0000-0000-000001966a11',
   '00000000-0000-0000-0000-000001966e0a', 'pending', NULL),
  ('00000000-0000-0000-0000-000001966f0b', '00000000-0000-0000-0000-000001966a11',
   '00000000-0000-0000-0000-000001966e0b', 'pending', 'check');

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_form text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001966b02', true);
  -- Form A holds $40: two $30 classes paid in cash, $20 refunded.
  PERFORM public.submit_show_entries(
    '00000000-0000-0000-0000-000001966a11', '00000000-0000-0000-0000-000001966f0a',
    jsonb_build_array(
      jsonb_build_object('dog_id', '00000000-0000-0000-0000-000001966d0a',
                         'class_id', '00000000-0000-0000-0000-000001966a31',
                         'handler_name', 'MYK9-1966 Exhibitor', 'client_fee_cents', 3000),
      jsonb_build_object('dog_id', '00000000-0000-0000-0000-000001966d0a',
                         'class_id', '00000000-0000-0000-0000-000001966a32',
                         'handler_name', 'MYK9-1966 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000001966c1a', 'cash', jsonb_build_object('method', 'cash'));
  PERFORM public.record_enrollment_payment(
    '00000000-0000-0000-0000-000001966f0a', 'refund', 20, 'cash', NULL, NULL, 'Cash Returned');

  -- The add-on on both forms, as the desk sends a covered one: no payment, no method.
  FOREACH v_form IN ARRAY ARRAY['a', 'b'] LOOP
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000001966a11', ('00000000-0000-0000-0000-000001966f0' || v_form)::uuid,
      jsonb_build_array(jsonb_build_object(
        'dog_id', '00000000-0000-0000-0000-000001966d0' || v_form,
        'class_id', '00000000-0000-0000-0000-000001966a33',
        'handler_name', 'MYK9-1966 Exhibitor', 'client_fee_cents', 3000)),
      ('00000000-0000-0000-0000-000001966c2' || v_form)::uuid, NULL);
  END LOOP;
END;
$$;

RESET ROLE;
CREATE FUNCTION pg_temp.covered1966(p_form text) RETURNS text
LANGUAGE sql AS $$
  SELECT format('total=%s paid=%s status=%s method=%s addon=%s/%s payments=%s',
                en.total_amount, COALESCE(en.paid_amount, 0)::numeric(10, 2), en.payment_status,
                COALESCE(en.payment_method, 'null'), e.payment_status,
                COALESCE(e.payment_method, 'null'),
                COALESCE((SELECT string_agg(sp.amount::numeric(10, 2)::text, ',' ORDER BY sp.amount)
                            FROM public.show_payments sp
                           WHERE sp.enrollment_id = en.id AND sp.kind = 'payment'), 'none'))
    FROM public.enrollments en
    JOIN public.entries e ON e.registration_id = en.id
     AND e.class_id = '00000000-0000-0000-0000-000001966a33' AND e.deleted_at IS NULL
   WHERE en.id = ('00000000-0000-0000-0000-000001966f0' || p_form)::uuid $$;

DO $$
DECLARE
  v_a text := pg_temp.covered1966('a');
  v_b text := pg_temp.covered1966('b');
  v_want_a text := 'total=3000 paid=60.00 status=paid method=cash addon=paid/null payments=60.00';
  v_want_b text := 'total=3000 paid=0.00 status=pending method=check addon=pending/null payments=none';
BEGIN
  IF v_a IS DISTINCT FROM v_want_a THEN
    RAISE EXCEPTION 'FAIL covered submit, $40 held: got [%], want [%]', v_a, v_want_a;
  END IF;
  RAISE NOTICE 'PASS covered submit settles from the money held, names no channel: %', v_a;
  IF v_b IS DISTINCT FROM v_want_b THEN
    RAISE EXCEPTION 'FAIL covered submit, money gone: got [%], want [%]', v_b, v_want_b;
  END IF;
  RAISE NOTICE 'PASS with the held money gone the add-on stays owed, form method kept: %', v_b;
END;
$$;

-- 11 and 12. Junior pricing and the quoted ceiling. The show gets a $20 junior fee.
UPDATE public.shows SET junior_handler_fee = 20 WHERE id = '00000000-0000-0000-0000-000001966a11';
INSERT INTO public.people (id, first_name, last_name, email)
SELECT ('00000000-0000-0000-0000-000001966e' || x)::uuid, 'MYK9-1966', 'Junior ' || x,
       'myk9-1966-junior-' || x || '@example.test'
  FROM unnest(ARRAY['0c', '0d', '0e']) AS x;
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
SELECT ('00000000-0000-0000-0000-000001966d' || x)::uuid, 'MYK9-1966 Dog ' || x, 'Cap', 'Beagle',
       'active', ('00000000-0000-0000-0000-000001966e' || x)::uuid
  FROM unnest(ARRAY['0c', '0d', '0e']) AS x;
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT ('00000000-0000-0000-0000-000001966d' || x)::uuid, 'UKC', 'UKC1966' || x, true
  FROM unnest(ARRAY['0c', '0d', '0e']) AS x;
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
SELECT ('00000000-0000-0000-0000-000001966f' || x)::uuid, '00000000-0000-0000-0000-000001966a11',
       ('00000000-0000-0000-0000-000001966e' || x)::uuid, 'pending'
  FROM unnest(ARRAY['0c', '0d', '0e']) AS x;

CREATE TEMP TABLE t1966_junior (form text, collect_cents int, held_cents int, addon_cents int,
                                plain_collect int) ON COMMIT DROP;
GRANT ALL ON t1966_junior TO authenticated;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_form text;
  v_refund numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001966b02', true);
  -- Each form: one $30 class paid in cash, then a refund leaves $10 (c, e) or $25 (d) held.
  FOREACH v_form IN ARRAY ARRAY['0c', '0d', '0e'] LOOP
    PERFORM public.submit_show_entries(
      '00000000-0000-0000-0000-000001966a11', ('00000000-0000-0000-0000-000001966f' || v_form)::uuid,
      jsonb_build_array(jsonb_build_object(
        'dog_id', '00000000-0000-0000-0000-000001966d' || v_form,
        'class_id', '00000000-0000-0000-0000-000001966a31',
        'handler_name', 'MYK9-1966 Exhibitor', 'client_fee_cents', 3000)),
      ('00000000-0000-0000-0000-000001966c3' || right(v_form, 1))::uuid, 'cash',
      jsonb_build_object('method', 'cash'));
    v_refund := CASE v_form WHEN '0d' THEN 5 ELSE 20 END;
    PERFORM public.record_enrollment_payment(
      ('00000000-0000-0000-0000-000001966f' || v_form)::uuid, 'refund', v_refund, 'cash', NULL,
      NULL, 'Cash Returned');
    -- The quote for a $30 class (a32), with the junior fee and without it.
    INSERT INTO t1966_junior (form, collect_cents, held_cents, addon_cents, plain_collect)
    SELECT v_form, j.collect_cents, j.held_cents, j.addon_cents, p.collect_cents
      FROM public.desk_addon_amount_to_collect(
             '00000000-0000-0000-0000-000001966a11',
             ('00000000-0000-0000-0000-000001966e' || v_form)::uuid,
             ARRAY['00000000-0000-0000-0000-000001966a32']::uuid[], true) AS j,
           public.desk_addon_amount_to_collect(
             '00000000-0000-0000-0000-000001966a11',
             ('00000000-0000-0000-0000-000001966e' || v_form)::uuid,
             ARRAY['00000000-0000-0000-0000-000001966a32']::uuid[], false) AS p;
  END LOOP;

  -- c: junior add-on, cash for exactly what was quoted.
  PERFORM public.submit_show_entries(
    '00000000-0000-0000-0000-000001966a11', '00000000-0000-0000-0000-000001966f0c',
    jsonb_build_array(jsonb_build_object(
      'dog_id', '00000000-0000-0000-0000-000001966d0c',
      'class_id', '00000000-0000-0000-0000-000001966a32',
      'handler_name', 'MYK9-1966 Exhibitor', 'client_fee_cents', 2000,
      'junior_fee_override', true)),
    '00000000-0000-0000-0000-000001966c4c', 'cash',
    jsonb_build_object('method', 'cash', 'expected_collect_cents',
                       (SELECT collect_cents FROM t1966_junior WHERE form = '0c')));
  -- d: junior add-on the held money covers: no payment, no method.
  PERFORM public.submit_show_entries(
    '00000000-0000-0000-0000-000001966a11', '00000000-0000-0000-0000-000001966f0d',
    jsonb_build_array(jsonb_build_object(
      'dog_id', '00000000-0000-0000-0000-000001966d0d',
      'class_id', '00000000-0000-0000-0000-000001966a32',
      'handler_name', 'MYK9-1966 Exhibitor', 'client_fee_cents', 2000,
      'junior_fee_override', true)),
    '00000000-0000-0000-0000-000001966c4d', NULL);
  -- e: a regular $30 add-on on $10 held; the cap is $20, but the desk was quoted $15.
  PERFORM public.submit_show_entries(
    '00000000-0000-0000-0000-000001966a11', '00000000-0000-0000-0000-000001966f0e',
    jsonb_build_array(jsonb_build_object(
      'dog_id', '00000000-0000-0000-0000-000001966d0e',
      'class_id', '00000000-0000-0000-0000-000001966a32',
      'handler_name', 'MYK9-1966 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000001966c4e', 'cash',
    jsonb_build_object('method', 'cash', 'expected_collect_cents', 1500));
END;
$$;

RESET ROLE;
DO $$
DECLARE
  v_quotes text;
  v_want_quotes text := '0c:1000/1000/2000/2000 0d:0/2500/2000/500 0e:1000/1000/2000/2000';
  v_recorded int;
  v_got text;
BEGIN
  SELECT string_agg(format('%s:%s/%s/%s/%s', form, collect_cents, held_cents, addon_cents,
                           plain_collect), ' ' ORDER BY form)
    INTO v_quotes FROM t1966_junior;
  IF v_quotes IS DISTINCT FROM v_want_quotes THEN
    RAISE EXCEPTION 'FAIL junior quotes (collect/held/addon/plain collect): got [%], want [%]',
      v_quotes, v_want_quotes;
  END IF;
  RAISE NOTICE 'PASS the quote prices the junior fee as the submission does: %', v_quotes;

  -- c: what was recorded at submission equals the junior quote.
  SELECT round((en.paid_amount - 30) * 100)::int INTO v_recorded
    FROM public.enrollments en WHERE en.id = '00000000-0000-0000-0000-000001966f0c';
  IF v_recorded IS DISTINCT FROM (SELECT collect_cents FROM t1966_junior WHERE form = '0c') THEN
    RAISE EXCEPTION 'FAIL junior partial: quoted %, recorded %',
      (SELECT collect_cents FROM t1966_junior WHERE form = '0c'), v_recorded;
  END IF;
  RAISE NOTICE 'PASS a junior add-on records exactly the quoted % cents', v_recorded;

  -- d: covered by the junior price, settled, nothing recorded, nothing owed.
  SELECT format('total=%s paid=%s status=%s addon=%s/%s due=%s', en.total_amount,
                en.paid_amount::numeric(10, 2), en.payment_status, e.payment_status,
                COALESCE(e.payment_method, 'null'), private.enrollment_due_cents(en.id))
    INTO v_got
    FROM public.enrollments en
    JOIN public.entries e ON e.registration_id = en.id
     AND e.class_id = '00000000-0000-0000-0000-000001966a32'
   WHERE en.id = '00000000-0000-0000-0000-000001966f0d';
  IF v_got IS DISTINCT FROM 'total=2000 paid=30.00 status=paid addon=paid/null due=-500' THEN
    RAISE EXCEPTION 'FAIL junior covered: got [%]', v_got;
  END IF;
  RAISE NOTICE 'PASS a junior add-on the held money covers settles with nothing owed: %', v_got;

  -- e: the quoted ceiling wins over the larger cap; the rest stays owed.
  SELECT format('paid=%s status=%s due=%s', en.paid_amount::numeric(10, 2), en.payment_status,
                private.enrollment_due_cents(en.id))
    INTO v_got
    FROM public.enrollments en WHERE en.id = '00000000-0000-0000-0000-000001966f0e';
  IF v_got IS DISTINCT FROM 'paid=45.00 status=pending due=500' THEN
    RAISE EXCEPTION 'FAIL quoted ceiling: got [%], want [paid=45.00 status=pending due=500]', v_got;
  END IF;
  RAISE NOTICE 'PASS money recorded never exceeds the quote; the rest stays owed: %', v_got;
END;
$$;

-- The function keeps its grants: no anon execute, authenticated and service_role do.
DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL submit_show_entries grants changed';
  END IF;
  RAISE NOTICE 'PASS submit_show_entries keeps its grants';
END;
$$;

ROLLBACK;
