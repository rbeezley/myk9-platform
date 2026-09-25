-- MYK9-677 behavioral contract for 20260925181937_myk9_677_show_payments_ledger.sql.
--
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/myk9_677_show_payments_ledger_test.sql
--
-- Covers: grants (anon nothing, authenticated read-only), RESTRICT FKs, the
-- record predicate (club secretary allowed, another club's admin refused), the
-- split payment ($35 check three weeks early + $15 cash today = paid 50, two
-- rows), refunds (cash row negative, Stripe no row), the "Payment Due" reversal
-- netting every (method, day) group to zero, the constraints, and the desk-entry
-- trigger (one row per paid cash entry, however often it syncs; none for a
-- caller who may not record money). Every fixture rolls back.

BEGIN;

-- --- catalog ----------------------------------------------------------------
DO $$
DECLARE
  v_acl text;
BEGIN
  SELECT array_to_string(relacl, ',') INTO v_acl
    FROM pg_class WHERE oid = 'public.show_payments'::regclass;
  IF v_acl LIKE '%anon=%' THEN
    RAISE EXCEPTION 'FAIL anon holds privileges on show_payments: %', v_acl;
  END IF;
  IF v_acl NOT LIKE '%authenticated=r/%' THEN
    RAISE EXCEPTION 'FAIL authenticated should hold exactly SELECT on show_payments: %', v_acl;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = 'public.show_payments'::regclass AND a.attacl IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL show_payments carries column-level grants';
  END IF;
  RAISE NOTICE 'PASS show_payments grants: anon none, authenticated SELECT only';

  IF (SELECT count(*) FROM pg_constraint
       WHERE conrelid = 'public.show_payments'::regclass
         AND contype = 'f' AND confdeltype = 'r') <> 3 THEN
    RAISE EXCEPTION 'FAIL show_payments FKs (show, enrollment, entry) must all be ON DELETE RESTRICT';
  END IF;
  RAISE NOTICE 'PASS show_payments FKs are ON DELETE RESTRICT';

  IF has_function_privilege('anon',
       'public.record_enrollment_payment(uuid, text, numeric, text, date, text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute record_enrollment_payment';
  END IF;
  RAISE NOTICE 'PASS anon cannot execute record_enrollment_payment';
END;
$$;

-- --- fixtures ---------------------------------------------------------------
INSERT INTO public.roles (id, name, description, is_system)
VALUES
  ('00000000-0000-0000-0000-000000677801', 'secretary', 'MYK9-677 fixture', true),
  ('00000000-0000-0000-0000-000000677802', 'club_admin', 'MYK9-677 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000677001', 'MYK9-677 Club A'),
  ('00000000-0000-0000-0000-000000677002', 'MYK9-677 Club B');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES ('00000000-0000-0000-0000-000000677011', 'MYK9-677 Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000000677001');

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-000000677021', '00000000-0000-0000-0000-000000677011',
        'MYK9-677 Trial', current_date, 'AKC', 'Scent Work', 'America/Chicago');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000677051', 'Club A', 'Secretary',
   '00000000-0000-0000-0000-000000677151'),
  ('00000000-0000-0000-0000-000000677052', 'Club B', 'Admin',
   '00000000-0000-0000-0000-000000677152'),
  ('00000000-0000-0000-0000-000000677053', 'Pay', 'Exhibitor', NULL),
  ('00000000-0000-0000-0000-000000677054', 'Refund', 'Exhibitor', NULL),
  ('00000000-0000-0000-0000-000000677055', 'Shortfall', 'Exhibitor', NULL),
  ('00000000-0000-0000-0000-000000677056', 'Retry', 'Exhibitor', NULL),
  ('00000000-0000-0000-0000-000000677057', 'Parity', 'Exhibitor', NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000677051', id, '00000000-0000-0000-0000-000000677001',
       true, '00000000-0000-0000-0000-000000677151'
  FROM public.roles WHERE name = 'secretary';
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000677052', id, '00000000-0000-0000-0000-000000677002',
       true, '00000000-0000-0000-0000-000000677152'
  FROM public.roles WHERE name = 'club_admin';

-- A $50 enrollment (total_amount is cents) with one pending entry.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method, total_amount)
VALUES ('00000000-0000-0000-0000-000000677061', '00000000-0000-0000-0000-000000677011',
        '00000000-0000-0000-0000-000000677053', 'pending', 'check', 5000);

-- Two more $50 enrollments for the net-received cases (Codex round 3).
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method, total_amount)
VALUES
  ('00000000-0000-0000-0000-000000677063', '00000000-0000-0000-0000-000000677011',
   '00000000-0000-0000-0000-000000677054', 'pending', 'cash', 5000),
  ('00000000-0000-0000-0000-000000677064', '00000000-0000-0000-0000-000000677011',
   '00000000-0000-0000-0000-000000677055', 'pending', 'check', 5000),
  ('00000000-0000-0000-0000-000000677065', '00000000-0000-0000-0000-000000677011',
   '00000000-0000-0000-0000-000000677056', 'pending', 'cash', 3000),
  ('00000000-0000-0000-0000-000000677066', '00000000-0000-0000-0000-000000677011',
   '00000000-0000-0000-0000-000000677057', 'pending', 'cash', 5000);

-- Entry-status parity fixture: an ordinary entry, a waived one and one refunded
-- on its own, all on enrollment ...066.
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000000677081', '00000000-0000-0000-0000-000000677011',
   '00000000-0000-0000-0000-000000677021', '00000000-0000-0000-0000-000000677066',
   'submitted', 'pending', 'cash', 50),
  ('00000000-0000-0000-0000-000000677082', '00000000-0000-0000-0000-000000677011',
   '00000000-0000-0000-0000-000000677021', '00000000-0000-0000-0000-000000677066',
   'submitted', 'waived', 'waived', 0),
  ('00000000-0000-0000-0000-000000677083', '00000000-0000-0000-0000-000000677011',
   '00000000-0000-0000-0000-000000677021', '00000000-0000-0000-0000-000000677066',
   'submitted', 'refunded', 'cash', 50);

INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-000000677071', '00000000-0000-0000-0000-000000677011',
        '00000000-0000-0000-0000-000000677021', '00000000-0000-0000-0000-000000677061',
        'submitted', 'pending', 'check', 50);

-- --- another club's admin is refused ----------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000677152', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.record_enrollment_payment(
      '00000000-0000-0000-0000-000000677061', 'payment', 15, 'cash', NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL another club''s admin recorded a payment';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS another club''s admin is refused';
  END;
END;
$$;

-- --- the show's secretary: split payment ------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000677151', true);

SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677061', 'payment', 35, 'check', current_date - 21, '1042', NULL);

DO $$
DECLARE
  v_paid numeric; v_status text; v_entry text;
BEGIN
  SELECT paid_amount, payment_status INTO v_paid, v_status
    FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000677061';
  SELECT payment_status INTO v_entry
    FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677071';
  IF v_paid <> 35 OR v_status <> 'pending' OR v_entry <> 'pending' THEN
    RAISE EXCEPTION 'FAIL partial $35: paid %, status %, entry %', v_paid, v_status, v_entry;
  END IF;
  RAISE NOTICE 'PASS a $35 partial leaves the enrollment pending with $35 paid';
END;
$$;

SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677061', 'payment', 15, 'cash', NULL, NULL, NULL);

DO $$
DECLARE
  v_paid numeric; v_status text; v_entry text; v_rows text;
BEGIN
  SELECT paid_amount, payment_status INTO v_paid, v_status
    FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000677061';
  SELECT payment_status INTO v_entry
    FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677071';
  SELECT string_agg(kind || ':' || amount || ':' || method || ':' || (received_on - current_date),
                    ',' ORDER BY received_on)
    INTO v_rows
    FROM public.show_payments WHERE enrollment_id = '00000000-0000-0000-0000-000000677061';
  IF v_paid <> 50 OR v_status <> 'paid_by_cash' OR v_entry <> 'paid' THEN
    RAISE EXCEPTION 'FAIL $35 then $15: paid %, status %, entry %', v_paid, v_status, v_entry;
  END IF;
  -- received_on for the $15 is today on the show's calendar (Chicago), which is
  -- current_date or its neighbour depending on the runner's clock.
  IF v_rows NOT SIMILAR TO 'payment:35.00:check:-21,payment:15.00:cash:(-1|0|1)' THEN
    RAISE EXCEPTION 'FAIL split payment ledger rows: %', v_rows;
  END IF;
  RAISE NOTICE 'PASS $35 then $15: paid total 50, two rows, each on its own day and method';
END;
$$;

-- RLS: the show's secretary reads both rows, another club's admin reads none.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.show_payments) <> 2 THEN
    RAISE EXCEPTION 'FAIL the show''s secretary cannot read its ledger';
  END IF;
  RAISE NOTICE 'PASS the show''s secretary reads the ledger';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000677152', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.show_payments) THEN
    RAISE EXCEPTION 'FAIL another club''s admin can read the show''s ledger';
  END IF;
  RAISE NOTICE 'PASS another club''s admin reads no ledger rows';
END;
$$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000677151', true);

-- --- direct writes are refused ----------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.show_payments (show_id, enrollment_id, kind, amount, method, received_on)
    VALUES ('00000000-0000-0000-0000-000000677011', '00000000-0000-0000-0000-000000677061',
            'payment', 5, 'cash', current_date);
    RAISE EXCEPTION 'FAIL a secretary inserted a ledger row directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS a direct ledger INSERT is refused';
  END;
  BEGIN
    UPDATE public.show_payments SET amount = 1;
    RAISE EXCEPTION 'FAIL a secretary updated a ledger row directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS a direct ledger UPDATE is refused';
  END;
END;
$$;

-- --- validation --------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    PERFORM public.record_enrollment_payment(
      '00000000-0000-0000-0000-000000677061', 'payment', 5, 'online', NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL an online payment reached the desk ledger';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS a payment method other than cash/check is refused';
  END;
  BEGIN
    PERFORM public.record_enrollment_payment(
      '00000000-0000-0000-0000-000000677061', 'payment', 5, 'cash', current_date + 30, NULL, NULL);
    RAISE EXCEPTION 'FAIL a received date in the future was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS a future received date is refused';
  END;
  BEGIN
    PERFORM public.record_enrollment_payment(
      '00000000-0000-0000-0000-000000677061', 'refund', 60, 'cash', NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL a refund larger than the amount paid was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS a refund above the amount paid is refused';
  END;
END;
$$;

-- --- refunds -------------------------------------------------------------------
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677061', 'refund', 10, 'cash', NULL, NULL, 'returned at desk');
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677061', 'refund', 5, NULL, NULL, NULL, 'Stripe (manual)');

DO $$
DECLARE
  v_refunds integer; v_amount numeric; v_status text;
BEGIN
  SELECT count(*), sum(amount) INTO v_refunds, v_amount
    FROM public.show_payments
   WHERE enrollment_id = '00000000-0000-0000-0000-000000677061' AND kind = 'refund';
  SELECT payment_status INTO v_status
    FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000677061';
  IF v_refunds <> 1 OR v_amount <> -10 OR v_status <> 'partial_refund' THEN
    RAISE EXCEPTION 'FAIL refunds: % rows, net %, status %', v_refunds, v_amount, v_status;
  END IF;
  RAISE NOTICE 'PASS a cash refund is one negative row; a non-desk refund writes none';
END;
$$;

-- --- refunds are capped by what is still held, and accumulate -----------------
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677063', 'payment', NULL, 'cash', NULL, NULL, NULL);
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677063', 'refund', 30, 'cash', NULL, NULL, 'first');

DO $$
BEGIN
  BEGIN
    PERFORM public.record_enrollment_payment(
      '00000000-0000-0000-0000-000000677063', 'refund', 30, 'cash', NULL, NULL, 'second');
    RAISE EXCEPTION 'FAIL a second $30 refund of a $50 payment was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS a refund above the net still held is refused';
  END;
END;
$$;

SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677063', 'refund', 20, 'cash', NULL, NULL, 'rest');

DO $$
DECLARE
  v_refund numeric; v_status text; v_net numeric;
BEGIN
  SELECT refund_amount, payment_status INTO v_refund, v_status
    FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000677063';
  SELECT sum(amount) INTO v_net
    FROM public.show_payments WHERE enrollment_id = '00000000-0000-0000-0000-000000677063';
  IF v_refund <> 50 OR v_status <> 'refunded' OR v_net <> 0 THEN
    RAISE EXCEPTION 'FAIL $30 + $20 refunds: refund_amount %, status %, ledger net %',
      v_refund, v_status, v_net;
  END IF;
  RAISE NOTICE 'PASS $30 then $20 refunds: refund_amount 50, refunded, ledger net 0';
END;
$$;

-- A partial refund, then "Paid in Full", pays back the refunded shortfall.
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677064', 'payment', NULL, 'check', NULL, '2201', NULL);
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677064', 'refund', 20, 'cash', NULL, NULL, NULL);
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677064', 'payment', NULL, 'cash', NULL, NULL, NULL);

DO $$
DECLARE
  v_status text; v_net numeric; v_last numeric;
BEGIN
  SELECT payment_status INTO v_status
    FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000677064';
  SELECT sum(amount) INTO v_net
    FROM public.show_payments WHERE enrollment_id = '00000000-0000-0000-0000-000000677064';
  SELECT amount INTO v_last
    FROM public.show_payments
   WHERE enrollment_id = '00000000-0000-0000-0000-000000677064' AND kind = 'payment' AND method = 'cash';
  IF v_status <> 'paid_by_cash' OR v_net <> 50 OR v_last IS DISTINCT FROM 20 THEN
    RAISE EXCEPTION 'FAIL refund then Paid in Full: status %, ledger net %, new payment %',
      v_status, v_net, v_last;
  END IF;
  RAISE NOTICE 'PASS a partial refund then Paid in Full records the $20 shortfall; ledger net = fee';
END;
$$;

-- --- a retried payment (same client_payment_id) is recorded once -------------
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677065', 'payment', 30, 'cash', NULL, NULL, NULL,
  '00000000-0000-0000-0000-0000006770a1');
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677065', 'payment', 30, 'cash', NULL, NULL, NULL,
  '00000000-0000-0000-0000-0000006770a1');

DO $$
DECLARE
  v_rows integer; v_paid numeric; v_status text;
BEGIN
  SELECT count(*) INTO v_rows FROM public.show_payments
   WHERE enrollment_id = '00000000-0000-0000-0000-000000677065';
  SELECT paid_amount, payment_status INTO v_paid, v_status
    FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000677065';
  IF v_rows <> 1 OR v_paid <> 30 OR v_status <> 'paid_by_cash' THEN
    RAISE EXCEPTION 'FAIL a retried payment: % rows, paid %, status %', v_rows, v_paid, v_status;
  END IF;
  RAISE NOTICE 'PASS the same client_payment_id twice writes one row and adds paid_amount once';
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.record_enrollment_payment(
      '00000000-0000-0000-0000-000000677065', 'payment', 25, 'cash', NULL, NULL, NULL,
      '00000000-0000-0000-0000-0000006770a1');
    RAISE EXCEPTION 'FAIL a client_payment_id was reused for a different amount';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS a client_payment_id reused for a different payment is refused';
  END;
  BEGIN
    PERFORM public.record_enrollment_payment(
      '00000000-0000-0000-0000-000000677063', 'payment', 30, 'cash', NULL, NULL, NULL,
      '00000000-0000-0000-0000-0000006770a1');
    RAISE EXCEPTION 'FAIL a client_payment_id was reused on another enrollment';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS a client_payment_id reused on another enrollment is refused';
  END;
END;
$$;

-- --- entry statuses: EXACTLY the pre-ledger cascade ---------------------------
-- origin/main's updateEnrollmentPaymentStatus set every entry of the enrollment
-- except 'refunded' and 'waived' ones to the coarse status (paid_* -> paid,
-- pending -> pending, refunds -> refunded). Each action is checked against it.
CREATE TEMP TABLE myk9_677_parity (step text, ordinary text, waived text, refunded text);
GRANT ALL ON myk9_677_parity TO authenticated;

SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677066', 'payment', 20, 'cash', NULL, NULL, NULL);
INSERT INTO myk9_677_parity SELECT 'partial',
  (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677081'),
  (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677082'),
  (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677083');
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677066', 'payment', NULL, 'check', NULL, NULL, NULL);
INSERT INTO myk9_677_parity SELECT 'paid in full',
  (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677081'),
  (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677082'),
  (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677083');
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677066', 'refund', 10, NULL, NULL, NULL, 'Stripe (manual)');
INSERT INTO myk9_677_parity SELECT 'refund',
  (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677081'),
  (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677082'),
  (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677083');
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677066', 'reversal', NULL, NULL, NULL, NULL, NULL);
INSERT INTO myk9_677_parity SELECT 'payment due',
  (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677081'),
  (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677082'),
  (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677083');

DO $$
DECLARE
  v_got text;
BEGIN
  SELECT string_agg(step || ':' || ordinary || '/' || waived || '/' || refunded, ', ' ORDER BY ctid)
    INTO v_got FROM myk9_677_parity;
  -- The last line is the pre-ledger behaviour Codex round 7 flagged (a
  -- refunded entry stays refunded after a reset); it is kept, not changed.
  IF v_got IS DISTINCT FROM
     'partial:pending/waived/refunded, paid in full:paid/waived/refunded, '
     || 'refund:refunded/waived/refunded, payment due:refunded/waived/refunded' THEN
    RAISE EXCEPTION 'FAIL entry statuses differ from the pre-ledger cascade: %', v_got;
  END IF;
  RAISE NOTICE 'PASS entry statuses match the pre-ledger cascade for every action';
END;
$$;

-- --- "Payment Due" reversal ----------------------------------------------------
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-000000677061', 'reversal', NULL, NULL, NULL, NULL, NULL);

DO $$
DECLARE
  v_paid numeric; v_status text; v_open integer; v_reversals integer;
BEGIN
  SELECT paid_amount, payment_status INTO v_paid, v_status
    FROM public.enrollments WHERE id = '00000000-0000-0000-0000-000000677061';
  SELECT count(*) INTO v_open FROM (
    SELECT method, received_on FROM public.show_payments
     WHERE enrollment_id = '00000000-0000-0000-0000-000000677061'
     GROUP BY method, received_on HAVING sum(amount) <> 0) g;
  SELECT count(*) INTO v_reversals FROM public.show_payments
   WHERE enrollment_id = '00000000-0000-0000-0000-000000677061' AND kind = 'reversal';
  IF v_paid <> 0 OR v_status <> 'pending' OR v_open <> 0 OR v_reversals <> 2 THEN
    RAISE EXCEPTION 'FAIL reversal: paid %, status %, open groups %, reversal rows %',
      v_paid, v_status, v_open, v_reversals;
  END IF;
  RAISE NOTICE 'PASS Payment Due nets every (method, day) group to zero, on its own day';
END;
$$;

-- --- desk late entry: one row, however often it syncs ---------------------------
INSERT INTO public.entries (id, show_id, trial_id, entry_status, payment_status,
                            payment_method, entry_fee, payment_received_on)
VALUES ('00000000-0000-0000-0000-000000677072', '00000000-0000-0000-0000-000000677011',
        '00000000-0000-0000-0000-000000677021', 'confirmed', 'paid', 'cash', 20, current_date);

-- A replication retry replays the same INSERT (packages/replication
-- mutation-execute.ts treats its 23505 as success): the statement fails and
-- its trigger's ledger insert rolls back with it.
DO $$
BEGIN
  INSERT INTO public.entries (id, show_id, trial_id, entry_status, payment_status,
                              payment_method, entry_fee, payment_received_on)
  VALUES ('00000000-0000-0000-0000-000000677072', '00000000-0000-0000-0000-000000677011',
          '00000000-0000-0000-0000-000000677021', 'confirmed', 'paid', 'cash', 20, current_date);
  RAISE EXCEPTION 'FAIL a replayed desk entry INSERT succeeded';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'PASS a replayed desk entry INSERT is a duplicate';
END;
$$;

-- A later write to the entry's payment columns fires the UPDATE arm again.
RESET ROLE;
UPDATE public.entries
   SET payment_status = 'paid', payment_method = 'cash', entry_fee = 20
 WHERE id = '00000000-0000-0000-0000-000000677072';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_rows text;
BEGIN
  SELECT string_agg(kind || ':' || amount || ':' || method || ':' || received_on, ',')
    INTO v_rows
    FROM public.show_payments WHERE entry_id = '00000000-0000-0000-0000-000000677072';
  IF v_rows IS DISTINCT FROM ('payment:20.00:cash:' || current_date) THEN
    RAISE EXCEPTION 'FAIL desk entry ledger rows after two syncs: %', v_rows;
  END IF;
  RAISE NOTICE 'PASS a desk cash entry synced twice has exactly one ledger row';
END;
$$;

-- Another club's admin can insert nothing on this show (entries RLS), so the
-- no-row branch is exercised with a pending desk entry by the secretary.
INSERT INTO public.entries (id, show_id, trial_id, entry_status, payment_status,
                            payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-000000677073', '00000000-0000-0000-0000-000000677011',
        '00000000-0000-0000-0000-000000677021', 'confirmed', 'pending', 'cash', 20);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.show_payments
              WHERE entry_id = '00000000-0000-0000-0000-000000677073') THEN
    RAISE EXCEPTION 'FAIL a pending desk entry wrote a ledger row';
  END IF;
  RAISE NOTICE 'PASS a pending desk entry writes no ledger row';
END;
$$;

RESET ROLE;

-- A caller who may not record money (no auth.uid(): the seed session) gets the
-- entry and no ledger row.
SELECT set_config('request.jwt.claim.sub', '', true);
INSERT INTO public.entries (id, show_id, trial_id, entry_status, payment_status,
                            payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-000000677074', '00000000-0000-0000-0000-000000677011',
        '00000000-0000-0000-0000-000000677021', 'confirmed', 'paid', 'cash', 20);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.show_payments
              WHERE entry_id = '00000000-0000-0000-0000-000000677074') THEN
    RAISE EXCEPTION 'FAIL an unauthorized caller''s paid entry wrote a ledger row';
  END IF;
  RAISE NOTICE 'PASS an unauthorized caller''s paid entry writes no ledger row';
END;
$$;

-- --- constraints ------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.show_payments (show_id, enrollment_id, entry_id, kind, amount, method, received_on)
    VALUES ('00000000-0000-0000-0000-000000677011', '00000000-0000-0000-0000-000000677061',
            '00000000-0000-0000-0000-000000677071', 'payment', 5, 'cash', current_date);
    RAISE EXCEPTION 'FAIL a row with both an enrollment and an entry was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS a row names exactly one parent';
  END;
  BEGIN
    INSERT INTO public.show_payments (show_id, enrollment_id, kind, amount, method, received_on)
    VALUES ('00000000-0000-0000-0000-000000677011', '00000000-0000-0000-0000-000000677061',
            'payment', -5, 'cash', current_date);
    RAISE EXCEPTION 'FAIL a negative payment was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS a payment is positive';
  END;
  BEGIN
    INSERT INTO public.show_payments (show_id, enrollment_id, kind, amount, method, received_on)
    VALUES ('00000000-0000-0000-0000-000000677011', '00000000-0000-0000-0000-000000677061',
            'reversal', 0, 'cash', current_date);
    RAISE EXCEPTION 'FAIL a zero row was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS a zero amount is refused';
  END;
  BEGIN
    DELETE FROM public.entries WHERE id = '00000000-0000-0000-0000-000000677072';
    RAISE EXCEPTION 'FAIL an entry with a ledger row was hard-deleted';
  -- 23503 before PostgreSQL 18, 23001 from 18 on.
  EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
    RAISE NOTICE 'PASS an entry holding a ledger row cannot be hard-deleted';
  END;
END;
$$;

-- --- the reseed guard refuses to delete recorded money -------------------------
-- A reset (pending) enrollment on the demo show still holds its ledger history,
-- which no other arm of the guard sees.
RESET ROLE;
INSERT INTO public.shows (id, name, organization, start_date, end_date)
VALUES ('dededede-0000-0000-0000-000000000010', 'MYK9-677 demo show', 'AKC',
        current_date, current_date);
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES ('00000000-0000-0000-0000-000000677062', 'dededede-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000677053', 'pending');
INSERT INTO public.show_payments (show_id, enrollment_id, kind, amount, method, received_on)
VALUES ('dededede-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000677062',
        'payment', 25, 'check', current_date - 7),
       ('dededede-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000677062',
        'reversal', -25, 'check', current_date - 7);

DO $$
BEGIN
  BEGIN
    PERFORM public.seed_demo_assert_no_paid_strays();
    RAISE EXCEPTION 'FAIL the reseed guard let ledger rows on the demo show through';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%show_payments ledger row(s)%' THEN
      RAISE;
    END IF;
    RAISE NOTICE 'PASS the reseed guard refuses to delete show_payments rows';
  END;
END;
$$;

ROLLBACK;
