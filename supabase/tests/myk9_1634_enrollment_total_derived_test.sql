-- MYK9-1634: a mail-in entry form's total is the sum of its entries' fees, leaving out
-- deleted and waived entries.
--
-- Asserts, on a mail-in form (no Stripe intent in payment_reference):
--   1. a hand-set total on INSERT is replaced by the derived figure (no entries -> 0);
--   2. inserting entries sets the total to the sum of their fees;
--   3. soft-deleting an entry lowers it, and restoring it raises it back;
--   4. re-pricing an entry updates it;
--   5. moving an entry to another form updates both forms;
--   6. a direct write of total_amount (the old client/server increments) is overridden;
--   7. "Paid in full" (record_enrollment_payment, amount NULL) after a delete charges only
--      the live entries;
--   8. a Stripe-paid form (payment_reference 'pi_...') keeps its stored total, also once a
--      desk payment overwrites the reference (9) and after a full refund (11);
--  12. waiving an entry drops its fee, and un-waiving adds it back;
--  13. so do Comp and Undo Comp, which never name payment_status.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated database; fixtures roll back.

BEGIN;

INSERT INTO public.roles (id, name, description, is_system)
VALUES ('00000000-0000-0000-0000-000001634801', 'secretary', 'MYK9-1634 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001634001', 'MYK9-1634 Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES ('00000000-0000-0000-0000-000001634011', 'MYK9-1634 Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000001634001');

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES ('00000000-0000-0000-0000-000001634021', '00000000-0000-0000-0000-000001634011',
        'MYK9-1634 Trial', current_date, 'AKC', 'Scent Work', 'America/Chicago');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001634051', 'Club', 'Secretary', '00000000-0000-0000-0000-000001634151'),
  ('00000000-0000-0000-0000-000001634053', 'Mail', 'Exhibitor', NULL),
  ('00000000-0000-0000-0000-000001634054', 'Other', 'Exhibitor', NULL),
  ('00000000-0000-0000-0000-000001634055', 'Online', 'Exhibitor', NULL);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001634051', id, '00000000-0000-0000-0000-000001634001',
       true, '00000000-0000-0000-0000-000001634151'
  FROM public.roles WHERE name = 'secretary';

-- 1. A hand-set total on a mail-in form with no entries is replaced by 0.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method, total_amount)
VALUES
  ('00000000-0000-0000-0000-000001634061', '00000000-0000-0000-0000-000001634011',
   '00000000-0000-0000-0000-000001634053', 'pending', 'check', 9999),
  ('00000000-0000-0000-0000-000001634062', '00000000-0000-0000-0000-000001634011',
   '00000000-0000-0000-0000-000001634054', 'pending', 'cash', 1234);

-- 8 (setup). A Stripe-paid form keeps its stored total, processing fees included.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method,
                                payment_reference, total_amount)
VALUES ('00000000-0000-0000-0000-000001634063', '00000000-0000-0000-0000-000001634011',
        '00000000-0000-0000-0000-000001634055', 'paid', 'online', 'pi_1634fixture', 3745);

CREATE TEMP TABLE t1634_expect (label text, got integer, want integer) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.total1634(p_id uuid) RETURNS integer
LANGUAGE sql AS $$ SELECT total_amount FROM public.enrollments WHERE id = p_id $$;

INSERT INTO t1634_expect
SELECT '1 hand-set total on insert becomes the derived 0',
       pg_temp.total1634('00000000-0000-0000-0000-000001634061'), 0;

-- 2. Entries set it: $30 + $35 = 6500 cents.
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000001634081', '00000000-0000-0000-0000-000001634011',
   '00000000-0000-0000-0000-000001634021', '00000000-0000-0000-0000-000001634061',
   'confirmed', 'pending', 'check', 30),
  ('00000000-0000-0000-0000-000001634082', '00000000-0000-0000-0000-000001634011',
   '00000000-0000-0000-0000-000001634021', '00000000-0000-0000-0000-000001634061',
   'confirmed', 'pending', 'check', 35);
INSERT INTO t1634_expect
SELECT '2 inserting entries sums their fees',
       pg_temp.total1634('00000000-0000-0000-0000-000001634061'), 6500;

-- 3. Soft delete lowers it; restore raises it back.
UPDATE public.entries SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000001634082';
INSERT INTO t1634_expect
SELECT '3a soft-deleting an entry drops its fee',
       pg_temp.total1634('00000000-0000-0000-0000-000001634061'), 3000;
UPDATE public.entries SET deleted_at = NULL WHERE id = '00000000-0000-0000-0000-000001634082';
INSERT INTO t1634_expect
SELECT '3b restoring it adds the fee back',
       pg_temp.total1634('00000000-0000-0000-0000-000001634061'), 6500;

-- 4. Re-pricing updates it.
UPDATE public.entries SET entry_fee = 40 WHERE id = '00000000-0000-0000-0000-000001634081';
INSERT INTO t1634_expect
SELECT '4 re-pricing an entry updates the total',
       pg_temp.total1634('00000000-0000-0000-0000-000001634061'), 7500;

-- 5. Moving an entry to another form updates both.
UPDATE public.entries SET registration_id = '00000000-0000-0000-0000-000001634062'
 WHERE id = '00000000-0000-0000-0000-000001634082';
INSERT INTO t1634_expect
SELECT '5a the form an entry left loses its fee',
       pg_temp.total1634('00000000-0000-0000-0000-000001634061'), 4000;
INSERT INTO t1634_expect
SELECT '5b the form it joined gains it',
       pg_temp.total1634('00000000-0000-0000-0000-000001634062'), 3500;

-- 6. A direct write (the old increments) is overridden.
UPDATE public.enrollments SET total_amount = total_amount + 5000
 WHERE id = '00000000-0000-0000-0000-000001634061';
INSERT INTO t1634_expect
SELECT '6 a direct total_amount write is replaced by the derived figure',
       pg_temp.total1634('00000000-0000-0000-0000-000001634061'), 4000;

-- 12. Waived entries never count (owner, 2026-11-01): waiving an entry drops its fee from
-- what the form owes, and un-waiving it adds the fee back. The entry keeps its fee.
UPDATE public.entries SET payment_status = 'waived' WHERE id = '00000000-0000-0000-0000-000001634081';
INSERT INTO t1634_expect
SELECT '12a waiving an entry drops its fee from the total',
       pg_temp.total1634('00000000-0000-0000-0000-000001634061'), 0;
UPDATE public.entries SET payment_status = 'pending' WHERE id = '00000000-0000-0000-0000-000001634081';
INSERT INTO t1634_expect
SELECT '12b un-waiving it adds the fee back',
       pg_temp.total1634('00000000-0000-0000-0000-000001634061'), 4000;

-- 13. Comp and Undo Comp write `comped`; trg_entries_comp_payment_status (BEFORE) moves
-- payment_status to and from 'waived', a column the statement never names.
UPDATE public.entries SET comped = true WHERE id = '00000000-0000-0000-0000-000001634081';
INSERT INTO t1634_expect
SELECT '13a comping an entry drops its fee from the total',
       pg_temp.total1634('00000000-0000-0000-0000-000001634061'), 0;
UPDATE public.entries SET comped = false WHERE id = '00000000-0000-0000-0000-000001634081';
INSERT INTO t1634_expect
SELECT '13b undoing the comp adds the fee back',
       pg_temp.total1634('00000000-0000-0000-0000-000001634061'), 4000;

-- 8. The Stripe form is untouched, even when one of its entries changes.
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-000001634083', '00000000-0000-0000-0000-000001634011',
        '00000000-0000-0000-0000-000001634021', '00000000-0000-0000-0000-000001634063',
        'confirmed', 'pending', 'cash', 0);
UPDATE public.enrollments SET total_amount = 3745
 WHERE id = '00000000-0000-0000-0000-000001634063';
INSERT INTO t1634_expect
SELECT '8 a Stripe-paid form keeps its stored total',
       pg_temp.total1634('00000000-0000-0000-0000-000001634063'), 3745;

-- 9. A desk payment that overwrites a Stripe form's reference (the ledger core writes the
-- check number into payment_reference) keeps the Stripe total: a succeeded order covering
-- the form's entry is the permanent marker. customer_id NULL keeps the checkout triggers out.
INSERT INTO public.stripe_orders (id, show_id, status, amount_cents, entry_ids, stripe_payment_intent_id)
VALUES ('00000000-0000-0000-0000-000001634091', '00000000-0000-0000-0000-000001634011',
        'succeeded', 3745, ARRAY['00000000-0000-0000-0000-000001634083'::uuid], 'pi_1634fixture');
UPDATE public.enrollments SET payment_reference = '2207'
 WHERE id = '00000000-0000-0000-0000-000001634063';
INSERT INTO t1634_expect
SELECT '9 a Stripe form whose reference is overwritten keeps its total (order marker; would re-derive to 0)',
       pg_temp.total1634('00000000-0000-0000-0000-000001634063'), 3745;

-- 11. After a full Stripe refund (the webhook stamps the order 'refunded') the form is still
-- a Stripe form: the overwritten reference no longer marks it, the refunded order must.
UPDATE public.stripe_orders SET status = 'refunded'
 WHERE id = '00000000-0000-0000-0000-000001634091';
UPDATE public.enrollments SET payment_reference = 'Refund note'
 WHERE id = '00000000-0000-0000-0000-000001634063';
INSERT INTO t1634_expect
SELECT '11 a refunded Stripe order still marks the form (would re-derive to 0)',
       pg_temp.total1634('00000000-0000-0000-0000-000001634063'), 3745;

-- 10. The triggers move no money: paid, refund and status are untouched by an entry change.
CREATE TEMP TABLE t1634_money ON COMMIT DROP AS
SELECT paid_amount, refund_amount, payment_status FROM public.enrollments
 WHERE id = '00000000-0000-0000-0000-000001634062';
UPDATE public.entries SET entry_fee = 45 WHERE id = '00000000-0000-0000-0000-000001634082';
INSERT INTO t1634_expect
SELECT '10 an entry change leaves paid, refund and status untouched',
       (SELECT count(*)::int FROM public.enrollments en, t1634_money m
         WHERE en.id = '00000000-0000-0000-0000-000001634062'
           AND en.paid_amount IS NOT DISTINCT FROM m.paid_amount
           AND en.refund_amount IS NOT DISTINCT FROM m.refund_amount
           AND en.payment_status IS NOT DISTINCT FROM m.payment_status), 1;
INSERT INTO t1634_expect
SELECT '10b and still re-derives the total (45.00)',
       pg_temp.total1634('00000000-0000-0000-0000-000001634062'), 4500;

DO $$
DECLARE r record; v_fail int := 0;
BEGIN
  FOR r IN SELECT * FROM t1634_expect LOOP
    IF r.got IS DISTINCT FROM r.want THEN
      RAISE WARNING 'FAIL %: got %, want %', r.label, r.got, r.want;
      v_fail := v_fail + 1;
    ELSE
      RAISE NOTICE 'PASS %', r.label;
    END IF;
  END LOOP;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'FAIL MYK9-1634: % derived-total case(s) wrong', v_fail;
  END IF;
END;
$$;

-- 7. "Paid in full" after a delete charges only the live entries. Form 061 now holds one
-- live $40 entry (082 moved away); add a $25 entry, delete it, then pay in full.
INSERT INTO public.entries (id, show_id, trial_id, registration_id, entry_status,
                            payment_status, payment_method, entry_fee)
VALUES ('00000000-0000-0000-0000-000001634084', '00000000-0000-0000-0000-000001634011',
        '00000000-0000-0000-0000-000001634021', '00000000-0000-0000-0000-000001634061',
        'confirmed', 'pending', 'check', 25);
UPDATE public.entries SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000001634084';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001634151', true);

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.record_enrollment_payment(
    '00000000-0000-0000-0000-000001634061', 'payment', NULL, 'check', NULL, '1634', NULL);
  IF (v_result->>'paid_amount')::numeric <> 40 THEN
    RAISE EXCEPTION 'FAIL 7 Paid in full charged % after a delete, want 40 (the live entry only)',
      v_result->>'paid_amount';
  END IF;
  RAISE NOTICE 'PASS 7 Paid in full after a delete charges only the live entries (40)';
END;
$$;

RESET ROLE;

ROLLBACK;
