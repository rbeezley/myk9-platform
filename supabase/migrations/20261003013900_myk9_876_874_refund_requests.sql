-- MYK9-876 + MYK9-874: refunds are never automatic; every refund needs a
-- person's approval (owner rule, 2026-09-29).
--
-- Before this, stripe-webhook called stripe.refunds.create itself in two
-- places: a payment-link charge it could not honor
-- (entry_payment_request_auto_refund) and the unserved share of a cart that
-- overflowed class capacity (entry_cart_overflow_auto_refund). And a paid
-- Checkout Session whose cart the exhibitor had ABANDONED could never win the
-- `active -> submitted` fulfillment claim, so it fell into the duplicate-charge
-- branch with nothing durable to show for the charge (MYK9-874).
--
-- 1. public.refund_requests — one row per refund the platform OWES but has not
--    yet issued: the durable pending-refund record. The webhook writes it (via
--    the two RPCs below) and raises the existing CRITICAL operator alert; only
--    the stripe-approve-refund edge function, called by a site admin, issues
--    the Stripe refund, and it claims the row first (claim_refund_request_
--    approval) so a double click or a retry cannot refund twice.
--
-- 2. entry_carts.status gains 'refund_pending'. claim_abandoned_cart_refund
--    moves an abandoned/expired cart whose CURRENT session is the paid one to
--    'refund_pending' in the same statement that queues the request. The
--    webhook's fulfillment claim is `UPDATE ... WHERE status = 'active'`, so
--    the two claims are conditioned on the SAME column and only one can ever
--    win: a cart is fulfilled (submitted) or queued for refund
--    (refund_pending), never both. 'refund_pending' is terminal: no code path
--    reopens it (stripe-checkout reopens only active/expired carts), and the
--    status trigger below refuses every non-service-role write to or from it.
--
-- 3. claim_refund_request_approval re-checks, under the row lock, that an
--    abandoned-cart refund's cart is still 'refund_pending' and that nothing
--    fulfilled the session (no stripe_orders row, no entry carrying the
--    payment intent) before it lets the approval through.
--
-- Refunds come from the PLATFORM balance (separate charges and transfers), and
-- every queued refund is for lines that never became paid entries, so none of
-- them changes a club payout; the approval needs no show money lock.
--
-- Behavioral coverage (runs in CI only):
-- supabase/tests/myk9_876_874_refund_request_claims_test.sql

BEGIN;

-- ============================================================================
-- 1. entry_carts: the refund_pending status
-- ============================================================================

ALTER TABLE public.entry_carts DROP CONSTRAINT IF EXISTS entry_carts_status_check;
ALTER TABLE public.entry_carts
  ADD CONSTRAINT entry_carts_status_check
  CHECK (status IN ('active', 'submitted', 'abandoned', 'expired', 'refund_pending'));

-- Copied from 20260611230000_cart_status_and_cartid_guards.sql (the only and
-- latest definition). Adds: 'refund_pending' is service-role-owned, like
-- 'submitted' — an owner may neither set it (which would block their own
-- fulfillment with no refund queued) nor move a cart out of it.
CREATE OR REPLACE FUNCTION public.entry_carts_protect_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT current_setting('role', true)) = 'service_role' THEN
    RETURN new;
  END IF;
  -- Paid cart: service_role owns all further state changes.
  IF old.status = 'submitted' THEN
    RAISE EXCEPTION
      'submitted cart status cannot be changed by non-service-role callers'
      USING errcode = '42501';
  END IF;
  -- Paid cart queued for an approved refund (MYK9-874): same ownership.
  IF old.status = 'refund_pending' OR new.status = 'refund_pending' THEN
    RAISE EXCEPTION
      'refund_pending cart status is owned by the payment webhook'
      USING errcode = '42501';
  END IF;
  -- Regression to active from any terminal state re-opens the idempotency
  -- latch — block for all non-service-role callers.
  IF new.status = 'active' THEN
    RAISE EXCEPTION
      'cart status cannot regress to active'
      USING errcode = '42501';
  END IF;
  RETURN new;
END;
$$;

-- A trigger function needs no EXECUTE grant to fire. Matches the live ACL
-- (postgres and service_role only); CREATE OR REPLACE keeps it, this states it.
REVOKE ALL ON FUNCTION public.entry_carts_protect_status() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. The pending-refund queue
-- ============================================================================

CREATE TABLE public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL
    CHECK (kind IN ('abandoned_cart', 'cart_overflow', 'entry_payment_link')),
  -- pending  -> waiting for a site admin
  -- approved -> an admin approved it and the Stripe call is in flight (or
  --             crashed; a repeat approval resumes it with the same refund)
  -- refunded -> the Stripe refund exists (stripe_refund_id)
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'refunded')),
  stripe_checkout_session_id text NOT NULL,
  stripe_payment_intent_id text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reason text NOT NULL,
  -- Owners may delete their carts; the request outlives the cart.
  cart_id uuid REFERENCES public.entry_carts (id) ON DELETE SET NULL,
  entry_payment_link_id uuid REFERENCES public.entry_payment_links (id) ON DELETE SET NULL,
  show_id uuid REFERENCES public.shows (id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- auth.users id of the approving site admin (never a people.id).
  approved_by_auth_user_id uuid,
  approved_at timestamptz,
  stripe_refund_id text UNIQUE,
  refunded_at timestamptz,
  CONSTRAINT refund_requests_once_per_session UNIQUE (stripe_checkout_session_id, kind),
  CONSTRAINT refund_requests_approval_shape CHECK (
    (status = 'pending') = (approved_at IS NULL)
    AND (status = 'refunded') = (stripe_refund_id IS NOT NULL AND refunded_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.refund_requests IS
  'MYK9-876/874: refunds the platform owes but has not issued. Written by stripe-webhook (SECURITY DEFINER RPCs); issued only by stripe-approve-refund after a site admin approves. Site admins read; no client writes.';

CREATE INDEX refund_requests_pending_idx
  ON public.refund_requests (created_at)
  WHERE status <> 'refunded';

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests FORCE ROW LEVEL SECURITY;

-- REQUIRED, not tidy-up: ALTER DEFAULT PRIVILEGES grant anon full CRUD on
-- every new public table. Site admins READ (the approval queue); every write
-- goes through the SECURITY DEFINER RPCs below as service_role.
REVOKE ALL ON TABLE public.refund_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.refund_requests TO authenticated;
GRANT ALL ON TABLE public.refund_requests TO service_role;

CREATE POLICY refund_requests_site_admin_select
  ON public.refund_requests
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_site_admin()));

-- ============================================================================
-- 3. Webhook RPCs (service_role only)
-- ============================================================================

-- MYK9-874: the refund side of the cart claim. Wins only when the cart is
-- abandoned/expired AND still points at the paid session; the fulfillment
-- claim wins only from 'active'. A re-delivery finds its own request and
-- reports 'already_pending' so the webhook returns 2xx instead of retrying.
CREATE OR REPLACE FUNCTION public.claim_abandoned_cart_refund(
  p_cart_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (outcome text, refund_request_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cart record;
  v_existing uuid;
  v_id uuid;
BEGIN
  IF p_cart_id IS NULL OR p_session_id IS NULL OR p_payment_intent_id IS NULL
     OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'claim_abandoned_cart_refund: cart, session, intent and a positive amount are required'
      USING errcode = '22023';
  END IF;

  -- The row lock serialises this against the fulfillment claim and a
  -- concurrent re-delivery of the same session.
  SELECT c.id, c.status, c.stripe_checkout_session_id, c.show_id
    INTO v_cart
    FROM public.entry_carts c
   WHERE c.id = p_cart_id
   FOR UPDATE;

  SELECT r.id INTO v_existing
    FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = p_session_id
     AND r.kind = 'abandoned_cart';
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT 'already_pending'::text, v_existing;
    RETURN;
  END IF;

  IF v_cart.id IS NULL
     OR v_cart.status NOT IN ('abandoned', 'expired')
     OR v_cart.stripe_checkout_session_id IS DISTINCT FROM p_session_id THEN
    RETURN QUERY SELECT 'not_refundable'::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.entry_carts
     SET status = 'refund_pending'
   WHERE id = p_cart_id;

  INSERT INTO public.refund_requests (
    kind, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents,
    reason, cart_id, show_id, detail
  )
  VALUES (
    'abandoned_cart', p_session_id, p_payment_intent_id, p_amount_cents,
    'cart_' || v_cart.status, p_cart_id, v_cart.show_id, COALESCE(p_detail, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT 'claimed'::text, v_id;
END;
$$;

-- MYK9-876: queue a partial make-whole refund the webhook used to issue
-- itself (cart overflow, payment-link lines it could not honor). Idempotent
-- on (session, kind): a re-delivery returns the existing row, created=false.
CREATE OR REPLACE FUNCTION public.request_refund_approval(
  p_kind text,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_reason text,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_cart_id uuid DEFAULT NULL,
  p_entry_payment_link_id uuid DEFAULT NULL,
  p_show_id uuid DEFAULT NULL
)
RETURNS TABLE (refund_request_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_kind NOT IN ('cart_overflow', 'entry_payment_link') THEN
    -- abandoned_cart must go through claim_abandoned_cart_refund, which also
    -- takes the cart out of fulfillment's reach.
    RAISE EXCEPTION 'request_refund_approval: unsupported kind %', p_kind
      USING errcode = '22023';
  END IF;
  IF p_session_id IS NULL OR p_payment_intent_id IS NULL
     OR p_amount_cents IS NULL OR p_amount_cents <= 0 OR p_reason IS NULL THEN
    RAISE EXCEPTION 'request_refund_approval: session, intent, reason and a positive amount are required'
      USING errcode = '22023';
  END IF;

  INSERT INTO public.refund_requests (
    kind, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents,
    reason, cart_id, entry_payment_link_id, show_id, detail
  )
  VALUES (
    p_kind, p_session_id, p_payment_intent_id, p_amount_cents,
    p_reason, p_cart_id, p_entry_payment_link_id, p_show_id, COALESCE(p_detail, '{}'::jsonb)
  )
  ON CONFLICT (stripe_checkout_session_id, kind) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, true;
    RETURN;
  END IF;

  SELECT r.id INTO v_id
    FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = p_session_id
     AND r.kind = p_kind;
  RETURN QUERY SELECT v_id, false;
END;
$$;

-- ============================================================================
-- 4. Approval RPCs (service_role only; stripe-approve-refund authorises the
--    site admin before calling them)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_refund_request_approval(
  p_request_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS TABLE (
  outcome text,
  kind text,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  amount_cents integer,
  reason text,
  stripe_refund_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req public.refund_requests%ROWTYPE;
  v_cart_status text;
BEGIN
  IF p_actor_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'claim_refund_request_approval: an approving user is required'
      USING errcode = '22023';
  END IF;

  SELECT * INTO v_req
    FROM public.refund_requests r
   WHERE r.id = p_request_id
   FOR UPDATE;

  IF v_req.id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text, NULL::text,
      NULL::integer, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_req.status = 'refunded' THEN
    RETURN QUERY SELECT 'already_refunded'::text, v_req.kind, v_req.stripe_payment_intent_id,
      v_req.stripe_checkout_session_id, v_req.amount_cents, v_req.reason, v_req.stripe_refund_id;
    RETURN;
  END IF;

  -- MYK9-874: approval and fulfillment are mutually exclusive. The cart must
  -- still be held at refund_pending (or gone), and nothing may have fulfilled
  -- this session or stamped an entry with its payment intent.
  IF v_req.kind = 'abandoned_cart' THEN
    IF v_req.cart_id IS NOT NULL THEN
      SELECT c.status INTO v_cart_status
        FROM public.entry_carts c
       WHERE c.id = v_req.cart_id
       FOR UPDATE;
      IF v_cart_status IS DISTINCT FROM 'refund_pending' THEN
        RETURN QUERY SELECT 'fulfilled'::text, v_req.kind, v_req.stripe_payment_intent_id,
          v_req.stripe_checkout_session_id, v_req.amount_cents, v_req.reason, NULL::text;
        RETURN;
      END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.stripe_orders o
                WHERE o.stripe_checkout_session_id = v_req.stripe_checkout_session_id)
       OR EXISTS (SELECT 1 FROM public.entries e
                   WHERE e.stripe_payment_intent_id = v_req.stripe_payment_intent_id) THEN
      RETURN QUERY SELECT 'fulfilled'::text, v_req.kind, v_req.stripe_payment_intent_id,
        v_req.stripe_checkout_session_id, v_req.amount_cents, v_req.reason, NULL::text;
      RETURN;
    END IF;
  END IF;

  IF v_req.status = 'pending' THEN
    UPDATE public.refund_requests
       SET status = 'approved',
           approved_by_auth_user_id = p_actor_auth_user_id,
           approved_at = now()
     WHERE id = v_req.id;
    RETURN QUERY SELECT 'claimed'::text, v_req.kind, v_req.stripe_payment_intent_id,
      v_req.stripe_checkout_session_id, v_req.amount_cents, v_req.reason, NULL::text;
    RETURN;
  END IF;

  -- 'approved' with no refund recorded: a previous approval crashed or is in
  -- flight. Resuming is safe — the edge function reuses the refund stamped
  -- with this request id, and Stripe's idempotency key covers a live race.
  RETURN QUERY SELECT 'resume'::text, v_req.kind, v_req.stripe_payment_intent_id,
    v_req.stripe_checkout_session_id, v_req.amount_cents, v_req.reason, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_refund_request(
  p_request_id uuid,
  p_stripe_refund_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_stripe_refund_id IS NULL THEN
    RAISE EXCEPTION 'complete_refund_request: a Stripe refund id is required'
      USING errcode = '22023';
  END IF;

  UPDATE public.refund_requests
     SET status = 'refunded',
         stripe_refund_id = p_stripe_refund_id,
         refunded_at = now()
   WHERE id = p_request_id
     AND status = 'approved';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 1 THEN
    RETURN true;
  END IF;
  -- A repeat completion with the same refund is a benign no-op.
  RETURN EXISTS (SELECT 1 FROM public.refund_requests r
                  WHERE r.id = p_request_id
                    AND r.status = 'refunded'
                    AND r.stripe_refund_id = p_stripe_refund_id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_abandoned_cart_refund(uuid, text, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_refund_approval(text, text, text, integer, text, jsonb, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_refund_request_approval(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_refund_request(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_abandoned_cart_refund(uuid, text, text, integer, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.request_refund_approval(text, text, text, integer, text, jsonb, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_refund_request_approval(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_refund_request(uuid, text) TO service_role;

COMMIT;
