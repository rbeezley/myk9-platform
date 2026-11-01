-- MYK9-1637: card money counts as received on an entry form.
--
-- Card money stays in stripe_orders and is attributed per entry: an entry a succeeded order
-- lists, with no Stripe refund stamp, is card-paid, and enrollments.card_covered_cents sums
-- their fees. Money received = desk net (paid_amount - refund_amount) + card_covered_cents.
--
-- Asserts:
--   1. checkout: a card form owes its entries' fees, holds them as card money, and is 'paid';
--   2. a desk add-on onto a card form reopens it, and "Paid in full" charges exactly the add-on;
--   3. "Paid in full" on a form card money fully covers charges nothing;
--   4. "Payment Due" clears desk money only: card money and card-paid entries are untouched;
--   5. a desk refund is capped at desk money (owner, 2026-11-01), and leaves the form
--      'partial_refund' while card money is still held;
--   6. a Stripe refund of one card entry leaves both what is owed and what is held, so the
--      balance and status do not move;
--   7. a payment link covering entries on two desk forms settles each with its own entries;
--   8. an entry two succeeded orders list counts once;
--   9. a failed order covers nothing;
--  10. a direct write of card_covered_cents is replaced by the derived figure;
--  11. "Payment Due" on a card-covered form that also held desk money leaves it 'paid'.
--  12. a checkout onto a form that still owes desk money leaves it 'pending' (the sync no
--      longer marks an existing form paid), also when the card entry was already on it;
--  13. an order Stripe refunds whole reopens a form it no longer covers.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated database; fixtures roll back.

BEGIN;

INSERT INTO public.roles (id, name, description, is_system)
VALUES ('00000000-0000-0000-0000-000001637801', 'secretary', 'MYK9-1637 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001637001', 'MYK9-1637 Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES ('00000000-0000-0000-0000-000001637011', 'MYK9-1637 Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000001637001');

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-000001637021', '00000000-0000-0000-0000-000001637011',
        'MYK9-1637 Trial', current_date, 'AKC', 'Scent Work', 'America/Chicago');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001637051', 'Club', 'Secretary', '00000000-0000-0000-0000-000001637151'),
  ('00000000-0000-0000-0000-000001637052', 'Card', 'Exhibitor', NULL),
  ('00000000-0000-0000-0000-000001637053', 'Covered', 'Exhibitor', NULL),
  ('00000000-0000-0000-0000-000001637054', 'Link One', 'Exhibitor', NULL),
  ('00000000-0000-0000-0000-000001637055', 'Link Two', 'Exhibitor', NULL),
  ('00000000-0000-0000-0000-000001637056', 'Twice', 'Exhibitor', NULL),
  ('00000000-0000-0000-0000-000001637057', 'Returning', 'Exhibitor', NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001637051', id, '00000000-0000-0000-0000-000001637001',
       true, '00000000-0000-0000-0000-000001637151'
  FROM public.roles WHERE name = 'secretary';

INSERT INTO public.stripe_customers (id, person_id, stripe_customer_id)
VALUES
  ('00000000-0000-0000-0000-000001637061', '00000000-0000-0000-0000-000001637052', 'cus_1637_card'),
  ('00000000-0000-0000-0000-000001637063', '00000000-0000-0000-0000-000001637053', 'cus_1637_covered'),
  ('00000000-0000-0000-0000-000001637067', '00000000-0000-0000-0000-000001637057', 'cus_1637_returning');

CREATE TEMP TABLE t1637_expect (label text, got text, want text) ON COMMIT DROP;
GRANT ALL ON t1637_expect TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.form1637(p_handler uuid) RETURNS uuid
LANGUAGE sql AS $$
  SELECT id FROM public.enrollments
   WHERE show_id = '00000000-0000-0000-0000-000001637011' AND handler_id = p_handler $$;

CREATE OR REPLACE FUNCTION pg_temp.money1637(p_id uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT format('total=%s card=%s paid=%s refund=%s status=%s', total_amount,
                card_covered_cents, COALESCE(paid_amount, 0)::numeric(10, 2),
                COALESCE(refund_amount, 0)::numeric(10, 2), payment_status)
    FROM public.enrollments WHERE id = p_id $$;

GRANT EXECUTE ON FUNCTION pg_temp.form1637(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.money1637(uuid) TO authenticated;

-- 1. Checkout, the webhook's write shape: card entries ($30 + $20), then the order inserted
-- as succeeded (a $53.10 charge, fees included). The sync creates and links the form.
-- Both written as the payment service, as the webhook does.
SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, show_id, trial_id, handler_id, entry_status, payment_status,
                            payment_method, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000001637101', '00000000-0000-0000-0000-000001637011',
   '00000000-0000-0000-0000-000001637021', '00000000-0000-0000-0000-000001637052',
   'confirmed', 'paid', 'online', 30),
  ('00000000-0000-0000-0000-000001637102', '00000000-0000-0000-0000-000001637011',
   '00000000-0000-0000-0000-000001637021', '00000000-0000-0000-0000-000001637052',
   'confirmed', 'paid', 'online', 20),
  ('00000000-0000-0000-0000-000001637111', '00000000-0000-0000-0000-000001637011',
   '00000000-0000-0000-0000-000001637021', '00000000-0000-0000-0000-000001637053',
   'confirmed', 'paid', 'online', 35);

INSERT INTO public.stripe_orders (id, customer_id, stripe_payment_intent_id, amount_cents,
                                  status, order_type, show_id, entry_ids)
VALUES
  ('00000000-0000-0000-0000-000001637201', '00000000-0000-0000-0000-000001637061',
   'pi_1637_card', 5310, 'succeeded', 'entry', '00000000-0000-0000-0000-000001637011',
   ARRAY['00000000-0000-0000-0000-000001637101', '00000000-0000-0000-0000-000001637102']::uuid[]),
  ('00000000-0000-0000-0000-000001637203', '00000000-0000-0000-0000-000001637063',
   'pi_1637_covered', 3720, 'succeeded', 'entry', '00000000-0000-0000-0000-000001637011',
   ARRAY['00000000-0000-0000-0000-000001637111']::uuid[]);
RESET ROLE;

INSERT INTO t1637_expect
SELECT '1 a card form owes its fees, holds them as card money, and is paid',
       pg_temp.money1637(pg_temp.form1637('00000000-0000-0000-0000-000001637052')),
       'total=5000 card=5000 paid=0.00 refund=0.00 status=paid';

-- 2. A desk $25 add-on onto the card form reopens it.
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-000001637103', '00000000-0000-0000-0000-000001637011',
        '00000000-0000-0000-0000-000001637021',
        pg_temp.form1637('00000000-0000-0000-0000-000001637052'),
        'confirmed', 'pending', 'check', 25);
INSERT INTO t1637_expect
SELECT '2a a desk add-on onto a card form is owed and reopens it',
       pg_temp.money1637(pg_temp.form1637('00000000-0000-0000-0000-000001637052')),
       'total=7500 card=5000 paid=0.00 refund=0.00 status=pending';

-- 10. A direct write of card_covered_cents is replaced by the derived figure.
UPDATE public.enrollments SET card_covered_cents = 99999
 WHERE id = pg_temp.form1637('00000000-0000-0000-0000-000001637052');
INSERT INTO t1637_expect
SELECT '10 a direct card_covered_cents write is replaced by the derived figure',
       (SELECT card_covered_cents::text FROM public.enrollments
         WHERE id = pg_temp.form1637('00000000-0000-0000-0000-000001637052')),
       '5000';

-- 9. A failed order covers nothing.
INSERT INTO public.entries (id, show_id, trial_id, handler_id, entry_status, payment_status,
                            payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-000001637131', '00000000-0000-0000-0000-000001637011',
        '00000000-0000-0000-0000-000001637021', '00000000-0000-0000-0000-000001637056',
        'confirmed', 'pending', 'online', 40);
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method)
VALUES ('00000000-0000-0000-0000-000001637306', '00000000-0000-0000-0000-000001637011',
        '00000000-0000-0000-0000-000001637056', 'pending', 'online');
UPDATE public.entries SET registration_id = '00000000-0000-0000-0000-000001637306'
 WHERE id = '00000000-0000-0000-0000-000001637131';
INSERT INTO public.stripe_orders (id, stripe_payment_intent_id, amount_cents, status,
                                  order_type, show_id, entry_ids)
VALUES ('00000000-0000-0000-0000-000001637206', 'pi_1637_failed', 4000, 'failed', 'entry',
        '00000000-0000-0000-0000-000001637011',
        ARRAY['00000000-0000-0000-0000-000001637131']::uuid[]);
INSERT INTO t1637_expect
SELECT '9 a failed order covers nothing',
       pg_temp.money1637('00000000-0000-0000-0000-000001637306'),
       'total=4000 card=0 paid=0.00 refund=0.00 status=pending';

-- 8. Two succeeded orders listing one entry count it once (customer_id NULL keeps the
-- checkout sync out; the second order re-runs the capture).
INSERT INTO public.stripe_orders (id, stripe_payment_intent_id, amount_cents, status,
                                  order_type, show_id, entry_ids)
VALUES
  ('00000000-0000-0000-0000-000001637207', 'pi_1637_twice_a', 4000, 'succeeded', 'entry',
   '00000000-0000-0000-0000-000001637011', ARRAY['00000000-0000-0000-0000-000001637131']::uuid[]),
  ('00000000-0000-0000-0000-000001637208', 'pi_1637_twice_b', 4000, 'succeeded', 'entry',
   '00000000-0000-0000-0000-000001637011', ARRAY['00000000-0000-0000-0000-000001637131']::uuid[]);
INSERT INTO t1637_expect
SELECT '8 an entry two succeeded orders list counts once, and the capture settles the form',
       pg_temp.money1637('00000000-0000-0000-0000-000001637306'),
       'total=4000 card=4000 paid=0.00 refund=0.00 status=paid';

-- 7. A payment link covering one entry on each of two desk forms. The order starts pending
-- and is captured by an UPDATE, as the webhook does.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method)
VALUES
  ('00000000-0000-0000-0000-000001637304', '00000000-0000-0000-0000-000001637011',
   '00000000-0000-0000-0000-000001637054', 'pending', 'check'),
  ('00000000-0000-0000-0000-000001637305', '00000000-0000-0000-0000-000001637011',
   '00000000-0000-0000-0000-000001637055', 'pending', 'check');
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000001637121', '00000000-0000-0000-0000-000001637011',
   '00000000-0000-0000-0000-000001637021', '00000000-0000-0000-0000-000001637304',
   'confirmed', 'pending', 'check', 40),
  ('00000000-0000-0000-0000-000001637122', '00000000-0000-0000-0000-000001637011',
   '00000000-0000-0000-0000-000001637021', '00000000-0000-0000-0000-000001637305',
   'confirmed', 'pending', 'check', 45),
  ('00000000-0000-0000-0000-000001637123', '00000000-0000-0000-0000-000001637011',
   '00000000-0000-0000-0000-000001637021', '00000000-0000-0000-0000-000001637305',
   'confirmed', 'pending', 'check', 10);
INSERT INTO public.stripe_orders (id, stripe_payment_intent_id, amount_cents, status,
                                  order_type, show_id, entry_ids)
VALUES ('00000000-0000-0000-0000-000001637205', 'pi_1637_link', 8900, 'pending', 'entry',
        '00000000-0000-0000-0000-000001637011',
        ARRAY['00000000-0000-0000-0000-000001637121', '00000000-0000-0000-0000-000001637122']::uuid[]);
INSERT INTO t1637_expect
SELECT '7a a pending link order covers nothing',
       pg_temp.money1637('00000000-0000-0000-0000-000001637304'),
       'total=4000 card=0 paid=0.00 refund=0.00 status=pending';
UPDATE public.stripe_orders SET status = 'succeeded'
 WHERE id = '00000000-0000-0000-0000-000001637205';
INSERT INTO t1637_expect
SELECT '7b a captured link settles the form it fully covers',
       pg_temp.money1637('00000000-0000-0000-0000-000001637304'),
       'total=4000 card=4000 paid=0.00 refund=0.00 status=paid';
INSERT INTO t1637_expect
SELECT '7c and credits the other form only its own entry, leaving the rest owed',
       pg_temp.money1637('00000000-0000-0000-0000-000001637305'),
       'total=5500 card=4500 paid=0.00 refund=0.00 status=pending';

-- 12. A returning exhibitor: a desk form owing $15, then a $20 card checkout onto it.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method)
VALUES ('00000000-0000-0000-0000-000001637307', '00000000-0000-0000-0000-000001637011',
        '00000000-0000-0000-0000-000001637057', 'pending', 'check');
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-000001637141', '00000000-0000-0000-0000-000001637011',
        '00000000-0000-0000-0000-000001637021', '00000000-0000-0000-0000-000001637307',
        'confirmed', 'pending', 'check', 15);
SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, show_id, trial_id, handler_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-000001637142', '00000000-0000-0000-0000-000001637011',
        '00000000-0000-0000-0000-000001637021', '00000000-0000-0000-0000-000001637057',
        '00000000-0000-0000-0000-000001637307', 'confirmed', 'paid', 'online', 20);
INSERT INTO public.stripe_orders (id, customer_id, stripe_payment_intent_id, amount_cents,
                                  status, order_type, show_id, entry_ids)
VALUES ('00000000-0000-0000-0000-000001637209', '00000000-0000-0000-0000-000001637067',
        'pi_1637_returning', 2130, 'succeeded', 'entry', '00000000-0000-0000-0000-000001637011',
        ARRAY['00000000-0000-0000-0000-000001637142']::uuid[]);
RESET ROLE;
INSERT INTO t1637_expect
SELECT '12 a checkout onto a form that still owes desk money leaves it pending',
       pg_temp.money1637('00000000-0000-0000-0000-000001637307'),
       'total=3500 card=2000 paid=0.00 refund=0.00 status=pending';

-- The desk, as a secretary.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001637151', true);

DO $$
DECLARE
  v_card uuid := pg_temp.form1637('00000000-0000-0000-0000-000001637052');
  v_covered uuid := pg_temp.form1637('00000000-0000-0000-0000-000001637053');
  v_refused boolean := false;
BEGIN
  -- 2b. "Paid in full" charges exactly the $25 add-on.
  PERFORM public.record_enrollment_payment(v_card, 'payment', NULL, 'check', NULL, '1637', NULL);
  INSERT INTO t1637_expect SELECT '2b Paid in full charges exactly the desk add-on',
    pg_temp.money1637(v_card), 'total=7500 card=5000 paid=25.00 refund=0.00 status=paid_by_check';

  -- 3. "Paid in full" on a form card money fully covers charges nothing.
  PERFORM public.record_enrollment_payment(v_covered, 'payment', NULL, 'cash', NULL, NULL, NULL);
  INSERT INTO t1637_expect SELECT '3 Paid in full on a fully card-covered form charges nothing',
    pg_temp.money1637(v_covered), 'total=3500 card=3500 paid=0.00 refund=0.00 status=paid_by_cash';

  -- 4. "Payment Due" clears desk money only.
  PERFORM public.record_enrollment_payment(v_card, 'reversal', NULL, NULL, NULL, NULL, NULL);
  INSERT INTO t1637_expect SELECT '4a Payment Due clears desk money only',
    pg_temp.money1637(v_card), 'total=7500 card=5000 paid=0.00 refund=0.00 status=pending';
  INSERT INTO t1637_expect SELECT '4b and card-paid entries stay paid',
    (SELECT string_agg(payment_status, ',' ORDER BY id) FROM public.entries
      WHERE registration_id = v_card),
    'paid,paid,pending';

  -- 5. A desk refund is capped at desk money: $25 held at the desk, $50 on the card.
  PERFORM public.record_enrollment_payment(v_card, 'payment', NULL, 'check', NULL, '1638', NULL);
  BEGIN
    PERFORM public.record_enrollment_payment(v_card, 'refund', 30, 'cash', NULL, NULL, NULL);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_refused := true;
  END;
  INSERT INTO t1637_expect SELECT '5a a desk refund larger than desk money is refused',
    v_refused::text, 'true';
  PERFORM public.record_enrollment_payment(v_card, 'refund', 25, 'cash', NULL, NULL, NULL);
  INSERT INTO t1637_expect SELECT '5b refunding all desk money leaves card money: partial_refund',
    pg_temp.money1637(v_card), 'total=7500 card=5000 paid=25.00 refund=25.00 status=partial_refund';

  -- 11. A card-covered form that also held desk money stays paid after "Payment Due".
  PERFORM public.record_enrollment_payment(v_covered, 'payment', 10, 'cash', NULL, NULL, NULL);
  PERFORM public.record_enrollment_payment(v_covered, 'reversal', NULL, NULL, NULL, NULL, NULL);
  INSERT INTO t1637_expect SELECT '11 Payment Due on a card-covered form leaves it paid',
    pg_temp.money1637(v_covered), 'total=3500 card=3500 paid=0.00 refund=0.00 status=paid';
END;
$$;

RESET ROLE;

-- 13. Stripe refunds the covered form's whole order (the webhook marks it 'refunded'): its
-- card money is gone and its entry still owed, so the form reopens.
SET LOCAL ROLE service_role;
UPDATE public.stripe_orders SET status = 'refunded'
 WHERE id = '00000000-0000-0000-0000-000001637203';
RESET ROLE;
INSERT INTO t1637_expect
SELECT '13 an order refunded whole reopens the form it covered',
       pg_temp.money1637(pg_temp.form1637('00000000-0000-0000-0000-000001637053')),
       'total=3500 card=0 paid=0.00 refund=0.00 status=pending';

-- 6. A Stripe refund of the $30 card entry (stripe-refund-entry's stamp, service role only).
SET LOCAL ROLE service_role;
UPDATE public.entries
   SET refund_amount = 30, refunded_at = now(), payment_status = 'refunded'
 WHERE id = '00000000-0000-0000-0000-000001637101';
RESET ROLE;
INSERT INTO t1637_expect
SELECT '6 a Stripe refund leaves both owed and held: balance and status unchanged',
       pg_temp.money1637(pg_temp.form1637('00000000-0000-0000-0000-000001637052')),
       'total=4500 card=2000 paid=25.00 refund=25.00 status=partial_refund';

DO $$
DECLARE r record; v_fail int := 0;
BEGIN
  FOR r IN SELECT * FROM t1637_expect LOOP
    IF r.got IS DISTINCT FROM r.want THEN
      RAISE WARNING 'FAIL %: got %, want %', r.label, r.got, r.want;
      v_fail := v_fail + 1;
    ELSE
      RAISE NOTICE 'PASS %', r.label;
    END IF;
  END LOOP;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'FAIL MYK9-1637: % card-money case(s) wrong', v_fail;
  END IF;
END;
$$;

ROLLBACK;
