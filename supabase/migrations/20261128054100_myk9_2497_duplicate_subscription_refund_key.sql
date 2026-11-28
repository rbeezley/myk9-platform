-- MYK9-2497: a SECOND premium subscription for a customer who already holds a
-- live one (active, trialing or past_due) joins the refund approval queue as
-- kind 'duplicate_subscription'.
--
-- stripe-checkout (MYK9-2449) expires a customer's open subscription sessions
-- before it opens a new one. Two sessions paid in the same second can still
-- both complete. stripe-webhook then sees two live subscriptions on one
-- customer: it keeps the OLDEST, grants no entitlement from the newer one, and
-- queues a request to refund the newer one's first invoice. Refunds stay
-- human-approved: the webhook only queues, and stripe-approve-refund issues
-- the refund after a site admin approves it. The webhook never cancels the
-- duplicate either; the alert tells the admin to cancel it in Stripe.
--
-- 1. refund_requests_kind_check gains 'duplicate_subscription' (restated from
--    20261005013700_myk9_963_unfulfilled_charge_refund.sql, its latest
--    definition).
--
-- 2. refund_requests.stripe_subscription_id: the duplicate subscription a
--    'duplicate_subscription' request refunds (required for that kind, NULL
--    for every other). The table's grants are table-level (SELECT to
--    authenticated, ALL to service_role, nothing to anon;
--    20261003013900_myk9_876_874_refund_requests.sql) and cover the new
--    column; no column-level grant is added, so anon stays out.
--
-- 3. THE DEDUPE KEY. Both checkout completion events (the kept subscription's
--    session and the duplicate's) can arrive after both subscriptions exist,
--    and each names the SAME duplicate. refund_requests_once_per_session is
--    (session, kind), and the two events carry different session ids, so it
--    cannot dedupe them. refund_requests_one_live_per_session ignores closed
--    requests, so it cannot stop a second request after the first refund
--    settled. refund_requests_once_per_duplicate_subscription is unique on the
--    duplicate subscription id for this kind, whatever the status: one request
--    per duplicate, ever. The row keeps the duplicate's ACTUAL checkout
--    session id.
--
-- 4. queue_duplicate_subscription_refund (service_role only) inserts the
--    request, idempotent on the duplicate subscription, and reports:
--      queued          this call inserted it
--      already_queued  a request for this duplicate exists (any status)
--      other_request   another live request holds the session or the payment
--                      intent. Nothing is inserted.
--
-- No settle-RPC change: settle_refund_attempt and begin_refund_attempt do not
-- branch on kind for this one. A subscription charge records no stripe_orders
-- row, which the webhook's ledger routing knows (approvedRefundHasNoOrder).
--
-- DEPLOY ORDER: push this migration BEFORE deploying stripe-webhook. The
-- deployed webhook never calls queue_duplicate_subscription_refund.
--
-- Behavioral coverage (runs in CI only):
-- supabase/tests/myk9_2497_duplicate_subscription_refund_test.sql

BEGIN;

-- ============================================================================
-- 1. The duplicate_subscription refund kind
-- ============================================================================

ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_kind_check;
ALTER TABLE public.refund_requests
  ADD CONSTRAINT refund_requests_kind_check
  CHECK (kind IN ('abandoned_cart', 'entry_payment_link', 'cart_overflow', 'unfulfilled_charge',
                  'duplicate_subscription'));

-- ============================================================================
-- 2. The duplicate subscription a request refunds
-- ============================================================================

ALTER TABLE public.refund_requests ADD COLUMN stripe_subscription_id text;

COMMENT ON COLUMN public.refund_requests.stripe_subscription_id IS
  'MYK9-2497: the duplicate Stripe subscription a duplicate_subscription request refunds. Required for that kind; NULL for every other.';

ALTER TABLE public.refund_requests
  ADD CONSTRAINT refund_requests_duplicate_subscription_shape
  CHECK ((kind = 'duplicate_subscription') = (stripe_subscription_id IS NOT NULL));

-- ============================================================================
-- 3. One request per duplicate subscription, ever
-- ============================================================================

CREATE UNIQUE INDEX refund_requests_once_per_duplicate_subscription
  ON public.refund_requests (stripe_subscription_id)
  WHERE kind = 'duplicate_subscription';

-- ============================================================================
-- 4. Queue a duplicate subscription's first invoice
-- ============================================================================

CREATE OR REPLACE FUNCTION public.queue_duplicate_subscription_refund(
  p_subscription_id text,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  outcome text,
  refund_request_id uuid,
  request_status text,
  amount_cents integer,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_req public.refund_requests%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_subscription_id IS NULL OR p_session_id IS NULL OR p_payment_intent_id IS NULL
     OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'queue_duplicate_subscription_refund: subscription, session, intent and a positive amount are required'
      USING errcode = '22023';
  END IF;

  SELECT * INTO v_req
    FROM public.refund_requests r
   WHERE r.kind = 'duplicate_subscription'
     AND r.stripe_subscription_id = p_subscription_id;
  IF v_req.id IS NOT NULL THEN
    RETURN QUERY SELECT 'already_queued'::text, v_req.id, v_req.status, v_req.amount_cents,
      v_req.stripe_payment_intent_id, v_req.stripe_checkout_session_id;
    RETURN;
  END IF;

  INSERT INTO public.refund_requests (
    kind, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents,
    reason, stripe_subscription_id, detail
  )
  VALUES (
    'duplicate_subscription', p_session_id, p_payment_intent_id, p_amount_cents,
    'duplicate_subscription', p_subscription_id,
    COALESCE(p_detail, '{}'::jsonb) || jsonb_build_object('duplicate_subscription_id', p_subscription_id)
  )
  -- No conflict target: the per-duplicate key (a concurrent delivery for the
  -- same duplicate), once per (session, kind), or one LIVE request per
  -- session / per payment intent each make this a no-op, reported from what
  -- is there.
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  SELECT * INTO v_req
    FROM public.refund_requests r
   WHERE r.kind = 'duplicate_subscription'
     AND r.stripe_subscription_id = p_subscription_id;
  IF v_req.id IS NULL THEN
    RETURN QUERY SELECT 'other_request'::text, NULL::uuid, NULL::text, NULL::integer,
      NULL::text, NULL::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT
    CASE WHEN v_id IS NULL THEN 'already_queued' ELSE 'queued' END,
    v_req.id, v_req.status, v_req.amount_cents, v_req.stripe_payment_intent_id,
    v_req.stripe_checkout_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_duplicate_subscription_refund(text, text, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_duplicate_subscription_refund(text, text, text, integer, jsonb)
  TO service_role;

COMMIT;
