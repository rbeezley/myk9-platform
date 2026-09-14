-- MYK9-499: a successful Stripe order inserted by the cart webhook must mint
-- the same MK9 number that My Shows reads through entries.registration_id.
BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000499001', 'Checkout confirmation test club');
INSERT INTO public.people (id, first_name, last_name)
VALUES ('00000000-0000-0000-0000-000000499002', 'Checkout', 'Exhibitor');
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000499003', 'Checkout confirmation test show',
        'AKC', current_date, current_date, '00000000-0000-0000-0000-000000499001',
        'published');
INSERT INTO public.trials (id, show_id, name, date, registry_id)
VALUES ('00000000-0000-0000-0000-000000499004',
        '00000000-0000-0000-0000-000000499003', 'Trial', current_date, 'AKC');
INSERT INTO public.classes (id, trial_id, name, status)
VALUES
  ('00000000-0000-0000-0000-000000499005',
   '00000000-0000-0000-0000-000000499004', 'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000000499013',
   '00000000-0000-0000-0000-000000499004', 'Interior Novice', 'upcoming');
INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES ('00000000-0000-0000-0000-000000499006', 'Checkout Dog', 'Dog', '',
        '00000000-0000-0000-0000-000000499002');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES ('00000000-0000-0000-0000-000000499006', 'AKC', 'SR49900001', true);
-- Cart items may omit the handler even though the Stripe customer identifies
-- the exhibitor who owns the resulting enrollment.
INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
                            entry_status, payment_status, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000000499007',
   '00000000-0000-0000-0000-000000499006',
   '00000000-0000-0000-0000-000000499005',
   '00000000-0000-0000-0000-000000499003',
   '00000000-0000-0000-0000-000000499004',
   NULL, 'confirmed', 'paid', 25),
  ('00000000-0000-0000-0000-000000499008',
   '00000000-0000-0000-0000-000000499006',
   '00000000-0000-0000-0000-000000499013',
   '00000000-0000-0000-0000-000000499003',
   '00000000-0000-0000-0000-000000499004',
   '00000000-0000-0000-0000-000000499002', 'confirmed', 'paid', 25);
INSERT INTO public.stripe_customers (id, person_id, stripe_customer_id)
VALUES ('00000000-0000-0000-0000-000000499009',
        '00000000-0000-0000-0000-000000499002', 'cus_myk9_499_test');

-- The webhook's actual write shape: it inserts directly as succeeded.
INSERT INTO public.stripe_orders (
  id, customer_id, stripe_payment_intent_id, stripe_checkout_session_id,
  amount_cents, status, order_type, show_id, entry_ids, metadata
) VALUES (
  '00000000-0000-0000-0000-000000499010',
  '00000000-0000-0000-0000-000000499009', 'pi_myk9_499_insert',
  'cs_myk9_499_insert', 2500, 'succeeded', 'entry',
  '00000000-0000-0000-0000-000000499003',
  ARRAY['00000000-0000-0000-0000-000000499007'::uuid],
  '{"cart_id":"00000000-0000-0000-0000-000000499011"}'::jsonb
);

DO $$
DECLARE
  v_enrollment_id uuid;
  v_number text;
BEGIN
  SELECT o.enrollment_id, en.confirmation_number
  INTO v_enrollment_id, v_number
  FROM public.stripe_orders o
  JOIN public.enrollments en ON en.id = o.enrollment_id
  WHERE o.id = '00000000-0000-0000-0000-000000499010';
  IF v_enrollment_id IS NULL OR v_number NOT LIKE 'MK9-%' THEN
    RAISE EXCEPTION 'Successful INSERT did not create a platform confirmation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.entries
    WHERE id = '00000000-0000-0000-0000-000000499007'
      AND registration_id = v_enrollment_id
  ) THEN
    RAISE EXCEPTION 'Successful INSERT did not link its paid entry';
  END IF;
END;
$$;

-- Preserve the legacy pending -> succeeded path and the stable number on a
-- repeat success update for the same handler/show.
INSERT INTO public.stripe_orders (
  id, customer_id, stripe_payment_intent_id, stripe_checkout_session_id,
  amount_cents, status, order_type, show_id, entry_ids
) VALUES (
  '00000000-0000-0000-0000-000000499012',
  '00000000-0000-0000-0000-000000499009', 'pi_myk9_499_update',
  'cs_myk9_499_update', 2500, 'pending', 'entry',
  '00000000-0000-0000-0000-000000499003',
  ARRAY['00000000-0000-0000-0000-000000499008'::uuid]
);
UPDATE public.stripe_orders SET status = 'succeeded'
WHERE id = '00000000-0000-0000-0000-000000499012';
UPDATE public.stripe_orders SET status = 'succeeded'
WHERE id = '00000000-0000-0000-0000-000000499012';

DO $$
DECLARE
  v_first uuid;
  v_second uuid;
BEGIN
  SELECT enrollment_id INTO v_first FROM public.stripe_orders
  WHERE id = '00000000-0000-0000-0000-000000499010';
  SELECT enrollment_id INTO v_second FROM public.stripe_orders
  WHERE id = '00000000-0000-0000-0000-000000499012';
  IF v_first IS NULL OR v_first IS DISTINCT FROM v_second THEN
    RAISE EXCEPTION 'Orders for one handler/show did not reuse an enrollment';
  END IF;
  IF (SELECT registration_id FROM public.entries
      WHERE id = '00000000-0000-0000-0000-000000499008') IS DISTINCT FROM v_first THEN
    RAISE EXCEPTION 'UPDATE path did not link its paid entry';
  END IF;
  IF (SELECT count(*) FROM public.enrollments
      WHERE show_id = '00000000-0000-0000-0000-000000499003'
        AND handler_id = '00000000-0000-0000-0000-000000499002') <> 1 THEN
    RAISE EXCEPTION 'Duplicate enrollment created';
  END IF;
END;
$$;

-- A refund can arrive before its order. The refund attachment trigger runs
-- first and must prevent a refunded order from receiving a paid enrollment.
INSERT INTO public.stripe_order_refunds (
  stripe_refund_id, stripe_payment_intent_id, amount_cents, kind
) VALUES ('re_myk9_499_early', 'pi_myk9_499_refunded', 2500, 'post_hoc');
INSERT INTO public.stripe_orders (
  id, customer_id, stripe_payment_intent_id, stripe_checkout_session_id,
  amount_cents, status, order_type, show_id, entry_ids
) VALUES (
  '00000000-0000-0000-0000-000000499014',
  '00000000-0000-0000-0000-000000499009', 'pi_myk9_499_refunded',
  'cs_myk9_499_refunded', 2500, 'succeeded', 'entry',
  '00000000-0000-0000-0000-000000499003',
  ARRAY['00000000-0000-0000-0000-000000499008'::uuid]
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.stripe_orders
    WHERE id = '00000000-0000-0000-0000-000000499014'
      AND status = 'refunded' AND enrollment_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Early full refund incorrectly minted a paid confirmation';
  END IF;
END;
$$;

ROLLBACK;
