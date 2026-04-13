-- Migration 132: Wire enrollment row creation to Stripe payment success
--
-- When a Stripe payment succeeds the stripe-webhook edge function updates
-- stripe_orders.status to 'succeeded'.  Before this migration nothing
-- created the corresponding enrollments row, so the MK9-XXXXXX confirmation
-- number was never generated and the two systems stayed disconnected.
--
-- This migration:
--   1. Adds financial columns to enrollments (total_amount, discount_amount,
--      payment_method) — referenced by send-registration-email.
--   2. Adds enrollment_id FK to stripe_orders so each paid order points at
--      its enrollment.
--   3. Creates a BEFORE UPDATE trigger on stripe_orders that fires whenever
--      status transitions to 'succeeded', upserts the enrollment row, links
--      all purchased entries via entries.registration_id, and writes the new
--      enrollment_id back onto the order row — all in one atomic DB operation.

-- ==========================================================================
-- 1. Extend enrollments with financial / method columns
-- ==========================================================================

ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS total_amount    INTEGER,        -- cents, mirrors stripe_orders.amount_cents
  ADD COLUMN IF NOT EXISTS discount_amount INTEGER,        -- cents, NULL when no discount
  ADD COLUMN IF NOT EXISTS payment_method  TEXT DEFAULT 'online';  -- 'online' | 'check' | 'cash' | 'secretary_paid'

-- ==========================================================================
-- 2. Add enrollment_id FK to stripe_orders
-- ==========================================================================

ALTER TABLE public.stripe_orders
  ADD COLUMN IF NOT EXISTS enrollment_id UUID REFERENCES public.enrollments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_orders_enrollment_id
  ON public.stripe_orders(enrollment_id);

-- ==========================================================================
-- 3. Trigger function: upsert enrollment on payment success
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.sync_enrollment_on_payment_success()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handler_id    UUID;
  v_enrollment_id UUID;
BEGIN
  -- Only act when status transitions to 'succeeded' for the first time
  IF NEW.status IS DISTINCT FROM 'succeeded' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'succeeded' THEN
    RETURN NEW;  -- already processed, idempotent guard
  END IF;

  -- Both show_id and customer_id are required to create a meaningful enrollment
  IF NEW.show_id IS NULL OR NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve the exhibitor/handler from the Stripe customer record
  SELECT person_id INTO v_handler_id
  FROM public.stripe_customers
  WHERE id = NEW.customer_id;

  IF v_handler_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Upsert enrollment (one row per handler per show)
  INSERT INTO public.enrollments (
    show_id,
    handler_id,
    payment_status,
    payment_reference,
    total_amount,
    payment_method
  )
  VALUES (
    NEW.show_id,
    v_handler_id,
    'paid',
    NEW.stripe_payment_intent_id,
    NEW.amount_cents,
    'online'
  )
  ON CONFLICT (show_id, handler_id) DO UPDATE
    SET payment_status   = 'paid',
        payment_reference = EXCLUDED.payment_reference,
        total_amount      = EXCLUDED.total_amount,
        payment_method    = 'online',
        updated_at        = now()
  RETURNING id INTO v_enrollment_id;

  -- Link all entries in this order to the enrollment
  IF v_enrollment_id IS NOT NULL
     AND NEW.entry_ids IS NOT NULL
     AND cardinality(NEW.entry_ids) > 0 THEN
    UPDATE public.entries
    SET registration_id = v_enrollment_id
    WHERE id = ANY(NEW.entry_ids);
  END IF;

  -- Store the enrollment reference on the order row
  NEW.enrollment_id := v_enrollment_id;

  RETURN NEW;
END;
$$;

-- ==========================================================================
-- 4. Attach trigger to stripe_orders
-- ==========================================================================

DROP TRIGGER IF EXISTS trg_stripe_orders_sync_enrollment ON public.stripe_orders;

CREATE TRIGGER trg_stripe_orders_sync_enrollment
  BEFORE UPDATE ON public.stripe_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_enrollment_on_payment_success();
