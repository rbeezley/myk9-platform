-- MYK9-499: cart checkout inserts stripe_orders with status='succeeded'.
-- The original enrollment trigger ran only on UPDATE, leaving those paid
-- entries without an MK9 confirmation and showing the Stripe intent instead.

CREATE OR REPLACE FUNCTION public.sync_enrollment_on_payment_success()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_handler_id uuid;
  v_enrollment_id uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'succeeded' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'succeeded' AND OLD.enrollment_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- A refunded/fully denied cart has no accepted entry to confirm. Payment
  -- links with no customer likewise cannot identify the enrollment owner.
  IF NEW.show_id IS NULL OR NEW.customer_id IS NULL
     OR NEW.entry_ids IS NULL OR cardinality(NEW.entry_ids) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT person_id INTO v_handler_id
  FROM public.stripe_customers
  WHERE id = NEW.customer_id;
  IF v_handler_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.enrollments (
    show_id, handler_id, payment_status, payment_reference,
    total_amount, payment_method
  ) VALUES (
    NEW.show_id, v_handler_id, 'paid', NEW.stripe_payment_intent_id,
    NEW.amount_cents, 'online'
  )
  ON CONFLICT (show_id, handler_id) DO UPDATE
    SET payment_status = 'paid',
        payment_reference = EXCLUDED.payment_reference,
        total_amount = EXCLUDED.total_amount,
        payment_method = 'online',
        updated_at = now()
  RETURNING id INTO v_enrollment_id;

  UPDATE public.entries
  SET registration_id = v_enrollment_id
  WHERE id = ANY(NEW.entry_ids);

  NEW.enrollment_id := v_enrollment_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stripe_orders_sync_enrollment ON public.stripe_orders;
CREATE TRIGGER trg_stripe_orders_sync_enrollment
  BEFORE UPDATE ON public.stripe_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_enrollment_on_payment_success();

-- AFTER INSERT runs after attach_pending_order_refunds_after_insert (trigger
-- names sort alphabetically). That trigger reconciles refunds that arrived
-- before the order; only a still-succeeded order receives an enrollment.
CREATE OR REPLACE FUNCTION public.sync_inserted_checkout_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.stripe_orders
  SET status = status
  WHERE id = NEW.id AND status = 'succeeded' AND enrollment_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_sync_inserted_checkout_enrollment ON public.stripe_orders;
CREATE TRIGGER zz_sync_inserted_checkout_enrollment
  AFTER INSERT ON public.stripe_orders
  FOR EACH ROW
  WHEN (NEW.status = 'succeeded')
  EXECUTE FUNCTION public.sync_inserted_checkout_enrollment();

-- Repair successful cart orders recorded before the INSERT trigger existed.
-- The existing enrollment for the same handler/show wins its stable MK9 number.
DO $$
DECLARE
  v_order record;
  v_enrollment_id uuid;
BEGIN
  FOR v_order IN
    SELECT o.id, o.show_id, o.entry_ids, o.stripe_payment_intent_id,
           o.amount_cents, sc.person_id AS handler_id
    FROM public.stripe_orders AS o
    JOIN public.stripe_customers AS sc ON sc.id = o.customer_id
    WHERE o.status = 'succeeded'
      AND o.enrollment_id IS NULL
      AND o.order_type = 'entry'
      AND o.metadata ->> 'cart_id' IS NOT NULL
      AND o.show_id IS NOT NULL
      AND o.entry_ids IS NOT NULL
      AND cardinality(o.entry_ids) > 0
      AND NOT EXISTS (
        SELECT 1 FROM unnest(o.entry_ids) AS entry_id
        LEFT JOIN public.entries AS e ON e.id = entry_id
        WHERE e.id IS NULL OR e.show_id IS DISTINCT FROM o.show_id
          OR e.registration_id IS NOT NULL
      )
  LOOP
    INSERT INTO public.enrollments (
      show_id, handler_id, payment_status, payment_reference,
      total_amount, payment_method
    ) VALUES (
      v_order.show_id, v_order.handler_id, 'paid',
      v_order.stripe_payment_intent_id, v_order.amount_cents, 'online'
    )
    ON CONFLICT (show_id, handler_id) DO UPDATE
      SET payment_status = 'paid', updated_at = now()
    RETURNING id INTO v_enrollment_id;

    UPDATE public.entries
    SET registration_id = v_enrollment_id
    WHERE id = ANY(v_order.entry_ids)
      AND registration_id IS NULL;

    UPDATE public.stripe_orders
    SET enrollment_id = v_enrollment_id
    WHERE id = v_order.id;
  END LOOP;
END;
$$;
