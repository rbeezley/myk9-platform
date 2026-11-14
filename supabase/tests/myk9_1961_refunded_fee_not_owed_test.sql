-- MYK9-1961: a refunded or comped fee is never owed by its entry form.
-- Behavioural contract for 20261114013900_myk9_1961_refunded_fee_not_owed.sql.
--
-- What a form owes (private.enrollment_owed_cents) leaves out Free (waived, comped) and
-- refunded (desk or Stripe) entries; money received is desk net plus card money. The form's
-- due is owed less received.
--
-- Asserts:
--   1. a full desk cash refund leaves nothing owed and nothing due (it read $25 due before);
--   2. a partial desk refund leaves nothing due and the rest of the money held;
--   3. a Stripe-refunded entry is not owed; its sibling still is;
--   4. a comped entry is not owed, and owed again when the comp is undone;
--   5. "Paid in Full" after a full refund reopens the entry and charges its fee again;
--   6. "Payment Due" after a refund reopens the entries and owes their fees;
--   7. an entry added after a refund owes its own fee;
--   8. the helper and the changed function keep their grants (no client role executes them).
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated database; fixtures roll back.

BEGIN;

INSERT INTO public.roles (id, name, description, is_system)
VALUES ('00000000-0000-0000-0000-000001961801', 'secretary', 'MYK9-1961 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001961001', 'MYK9-1961 Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES ('00000000-0000-0000-0000-000001961011', 'MYK9-1961 Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000001961001');

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-000001961021', '00000000-0000-0000-0000-000001961011',
        'MYK9-1961 Trial', current_date, 'AKC', 'Scent Work', 'America/Chicago');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001961051', 'Club', 'Secretary', '00000000-0000-0000-0000-000001961151'),
  ('00000000-0000-0000-0000-000001961052', 'Full', 'Refund', NULL),
  ('00000000-0000-0000-0000-000001961053', 'Partial', 'Refund', NULL),
  ('00000000-0000-0000-0000-000001961054', 'Stripe', 'Refund', NULL),
  ('00000000-0000-0000-0000-000001961055', 'Comped', 'Entry', NULL),
  ('00000000-0000-0000-0000-000001961056', 'Payment', 'Due', NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001961051', id, '00000000-0000-0000-0000-000001961001',
       true, '00000000-0000-0000-0000-000001961151'
  FROM public.roles WHERE name = 'secretary';

-- One form per exhibitor: A full refund, B partial refund, C Stripe refund, D comp,
-- E Payment Due.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method)
VALUES
  ('00000000-0000-0000-0000-00000196100a', '00000000-0000-0000-0000-000001961011',
   '00000000-0000-0000-0000-000001961052', 'pending', 'cash'),
  ('00000000-0000-0000-0000-00000196100b', '00000000-0000-0000-0000-000001961011',
   '00000000-0000-0000-0000-000001961053', 'pending', 'cash'),
  ('00000000-0000-0000-0000-00000196100c', '00000000-0000-0000-0000-000001961011',
   '00000000-0000-0000-0000-000001961054', 'pending', 'cash'),
  ('00000000-0000-0000-0000-00000196100d', '00000000-0000-0000-0000-000001961011',
   '00000000-0000-0000-0000-000001961055', 'pending', 'cash'),
  ('00000000-0000-0000-0000-00000196100e', '00000000-0000-0000-0000-000001961011',
   '00000000-0000-0000-0000-000001961056', 'pending', 'cash');

INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
SELECT ('00000000-0000-0000-0000-0000019611' || x.suffix)::uuid,
       '00000000-0000-0000-0000-000001961011', '00000000-0000-0000-0000-000001961021',
       ('00000000-0000-0000-0000-00000196100' || left(x.suffix, 1))::uuid,
       'submitted', 'pending', 'cash', 25
  FROM (VALUES ('a1'), ('b1'), ('b2'), ('c1'), ('c2'), ('d1'), ('d2'), ('e1'), ('e2')) AS x(suffix);

CREATE TEMP TABLE t1961_expect (label text, got text, want text) ON COMMIT DROP;
GRANT ALL ON t1961_expect TO authenticated;

-- owed (cents), received (desk net + card, dollars) and due (dollars) of one form.
CREATE OR REPLACE FUNCTION pg_temp.money1961(p_id uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT format('total=%s paid=%s refund=%s status=%s due=%s', total_amount,
                COALESCE(paid_amount, 0)::numeric(10, 2),
                COALESCE(refund_amount, 0)::numeric(10, 2), payment_status,
                (total_amount / 100.0 - (COALESCE(paid_amount, 0) - COALESCE(refund_amount, 0))
                 - card_covered_cents / 100.0)::numeric(10, 2))
    FROM public.enrollments WHERE id = p_id $$;
GRANT EXECUTE ON FUNCTION pg_temp.money1961(uuid) TO authenticated;

-- Every desk action below is the secretary's, through the public RPC.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001961151', true);

-- 1. Full desk cash refund.
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-00000196100a', 'payment', NULL, 'cash', NULL, NULL, NULL);
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-00000196100a', 'refund', 25, 'cash', NULL, NULL, 'Cash Returned');
INSERT INTO t1961_expect
SELECT '1 a full desk cash refund leaves nothing owed and nothing due',
       pg_temp.money1961('00000000-0000-0000-0000-00000196100a'),
       'total=0 paid=25.00 refund=25.00 status=refunded due=0.00';

-- 2. Partial desk refund of a paid two-entry form.
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-00000196100b', 'payment', NULL, 'check', NULL, '1961', NULL);
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-00000196100b', 'refund', 10, 'cash', NULL, NULL, 'Cash Returned');
INSERT INTO t1961_expect
SELECT '2 a partial desk refund leaves nothing due and the rest held',
       pg_temp.money1961('00000000-0000-0000-0000-00000196100b'),
       'total=0 paid=50.00 refund=10.00 status=partial_refund due=-40.00';

-- 3. A Stripe refund stamp on one of two unpaid entries, as stripe-refund-entry writes it.
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.entries
   SET refund_amount = 25, refunded_at = now(), refund_notes = 'Stripe (fixture)',
       payment_status = 'refunded'
 WHERE id = '00000000-0000-0000-0000-0000019611c1';
RESET ROLE;
INSERT INTO t1961_expect
SELECT '3 a Stripe-refunded entry is not owed; its sibling is',
       pg_temp.money1961('00000000-0000-0000-0000-00000196100c'),
       'total=2500 paid=0.00 refund=0.00 status=pending due=25.00';

-- 4. A comp on one of two unpaid entries, then undone.
UPDATE public.entries SET comped = true, comped_reason = 'MYK9-1961 fixture'
 WHERE id = '00000000-0000-0000-0000-0000019611d1';
INSERT INTO t1961_expect
SELECT '4a a comped entry is not owed',
       pg_temp.money1961('00000000-0000-0000-0000-00000196100d'),
       'total=2500 paid=0.00 refund=0.00 status=pending due=25.00';
UPDATE public.entries SET comped = false
 WHERE id = '00000000-0000-0000-0000-0000019611d1';
INSERT INTO t1961_expect
SELECT '4b undoing the comp owes the fee again',
       pg_temp.money1961('00000000-0000-0000-0000-00000196100d'),
       'total=5000 paid=0.00 refund=0.00 status=pending due=50.00';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001961151', true);

-- 5. "Paid in Full" on form A after its full refund: the entry follows (MYK9-773) and its
-- fee is charged again.
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-00000196100a', 'payment', NULL, 'cash', NULL, NULL, NULL);
INSERT INTO t1961_expect
SELECT '5 Paid in Full after a full refund charges the reopened fee',
       pg_temp.money1961('00000000-0000-0000-0000-00000196100a')
       || ' entry=' || (SELECT payment_status FROM public.entries
                         WHERE id = '00000000-0000-0000-0000-0000019611a1'),
       'total=2500 paid=50.00 refund=25.00 status=paid_by_cash due=0.00 entry=paid';

-- 6. "Payment Due" on a refunded form reopens its entries, which are owed again.
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-00000196100e', 'payment', NULL, 'cash', NULL, NULL, NULL);
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-00000196100e', 'refund', 50, 'cash', NULL, NULL, NULL);
SELECT public.record_enrollment_payment(
  '00000000-0000-0000-0000-00000196100e', 'reversal', NULL, NULL, NULL, NULL, NULL);
INSERT INTO t1961_expect
SELECT '6 Payment Due after a refund owes the reopened fees',
       pg_temp.money1961('00000000-0000-0000-0000-00000196100e'),
       'total=5000 paid=0.00 refund=0.00 status=pending due=50.00';

RESET ROLE;

-- 7. An entry added to form B after its refund owes its own fee; the $40 the desk still
-- holds is the form's, so it covers it.
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-0000019611b3', '00000000-0000-0000-0000-000001961011',
        '00000000-0000-0000-0000-000001961021', '00000000-0000-0000-0000-00000196100b',
        'submitted', 'pending', 'cash', 30);
INSERT INTO t1961_expect
SELECT '7 an entry added after a refund is owed',
       (SELECT total_amount::text FROM public.enrollments
         WHERE id = '00000000-0000-0000-0000-00000196100b'),
       '3000';

-- 8. Grants: no client role may execute the owed rule or the reopen helper.
INSERT INTO t1961_expect
SELECT '8 neither function is executable by a client role',
       concat_ws(',',
         has_function_privilege('anon', 'private.enrollment_owed_cents(uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'private.enrollment_owed_cents(uuid)', 'EXECUTE'),
         has_function_privilege('anon', 'private.enrollment_reopen_cents(uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'private.enrollment_reopen_cents(uuid)', 'EXECUTE')),
       'f,f,f,f';

DO $$
DECLARE r record; v_fail int := 0;
BEGIN
  FOR r IN SELECT * FROM t1961_expect LOOP
    IF r.got IS DISTINCT FROM r.want THEN
      RAISE WARNING 'FAIL %: got %, want %', r.label, r.got, r.want;
      v_fail := v_fail + 1;
    ELSE
      RAISE NOTICE 'PASS %', r.label;
    END IF;
  END LOOP;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'FAIL MYK9-1961: % owed case(s) wrong', v_fail;
  END IF;
END;
$$;

ROLLBACK;
