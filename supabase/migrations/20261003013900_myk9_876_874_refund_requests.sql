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
-- 1. entry_carts.status gains 'refund_pending'. claim_abandoned_cart_refund
--    moves an abandoned/expired cart whose CURRENT session is the paid one to
--    'refund_pending' in the same statement that queues the request. The
--    webhook's fulfillment claim is `UPDATE ... WHERE status = 'active'`, so
--    the two claims are conditioned on the SAME column and only one can ever
--    win: a cart is fulfilled (submitted) or queued for refund
--    (refund_pending), never both. 'refund_pending' is terminal: no code path
--    reopens it (stripe-checkout reopens only active/expired carts), and the
--    status trigger below refuses every non-service-role write to or from it.
--
-- 2. public.refund_requests — one row per refund the platform OWES: the
--    durable pending-refund record. stripe-webhook writes it (the two RPCs in
--    section 4) and raises the existing CRITICAL operator alert.
--
-- 3. public.refund_request_attempts — one row per approval that tried to
--    refund a request (Codex review rounds 1-2 on #2689). Each attempt owns
--    AT MOST ONE Stripe refund, written once, and the webhook updates only the
--    attempt whose stripe_refund_id matches the refund it received. The
--    request's status and last_failure are DERIVED from its attempts by a
--    trigger in the same transaction as every attempt write, never set by a
--    caller, so a delayed event or a delayed approval can only change its own
--    attempt:
--      refunded        any attempt succeeded
--      awaiting_stripe else an attempt is pending
--      failed          else the latest attempt failed or was canceled
--      pending         no attempts yet
--    A new attempt is created only while no attempt is pending or succeeded
--    (begin_refund_attempt, under the request's row lock; a partial unique
--    index backs the pending half).
--
-- 4. begin_refund_attempt re-checks, under the row lock, that an
--    abandoned-cart refund's cart is still 'refund_pending' and that nothing
--    fulfilled the session (no stripe_orders row, no entry carrying the
--    payment intent) before it lets an approval through.
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
  -- DERIVED from refund_request_attempts by refund_requests_recompute_status
  -- (see the header); no RPC writes it directly.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'awaiting_stripe', 'refunded', 'failed')),
  -- DERIVED: the latest attempt's failure, while status = 'failed'.
  last_failure text,
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_requests_once_per_session UNIQUE (stripe_checkout_session_id, kind),
  CONSTRAINT refund_requests_failure_shape CHECK ((status = 'failed') = (last_failure IS NOT NULL))
);

COMMENT ON TABLE public.refund_requests IS
  'MYK9-876/874: refunds the platform owes. Written by stripe-webhook (SECURITY DEFINER RPCs); refunded only through refund_request_attempts, which stripe-approve-refund creates after a site admin approves. status/last_failure are derived from the attempts. Site admins read; no client writes.';

CREATE INDEX refund_requests_open_idx
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
-- 3. Refund attempts: one Stripe refund each, status derived onto the request
-- ============================================================================

CREATE TABLE public.refund_request_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Money history: a request with attempts is never deleted.
  request_id uuid NOT NULL REFERENCES public.refund_requests (id) ON DELETE RESTRICT,
  -- 1, 2, 3 ... per request; the Stripe idempotency key is
  -- refund-request-<request_id>-<attempt_no>.
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  -- Written ONCE (record_refund_attempt); the webhook finds the attempt by it.
  stripe_refund_id text UNIQUE,
  -- Stripe's refund status ('requires_action' is stored as 'pending').
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled')),
  failure_reason text,
  -- auth.users id of the approving site admin (never a people.id).
  approved_by_auth_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_request_attempts_once UNIQUE (request_id, attempt_no)
);

COMMENT ON TABLE public.refund_request_attempts IS
  'MYK9-876 (Codex rounds 1-2 on #2689): one row per approval of a refund_requests row; each owns at most one Stripe refund. Written only by SECURITY DEFINER RPCs as service_role; site admins read.';

-- At most one attempt in flight per request (begin_refund_attempt also
-- refuses while one is pending or succeeded, under the request's row lock).
CREATE UNIQUE INDEX refund_request_attempts_one_pending_idx
  ON public.refund_request_attempts (request_id)
  WHERE status = 'pending';

ALTER TABLE public.refund_request_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_request_attempts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.refund_request_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.refund_request_attempts TO authenticated;
GRANT ALL ON TABLE public.refund_request_attempts TO service_role;

CREATE POLICY refund_request_attempts_site_admin_select
  ON public.refund_request_attempts
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_site_admin()));

-- The request's status, derived from its attempts in the SAME transaction as
-- every attempt write.
CREATE OR REPLACE FUNCTION public.refund_requests_recompute_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_any_succeeded boolean;
  v_any_pending boolean;
  v_latest record;
  v_status text;
  v_failure text;
BEGIN
  SELECT COALESCE(bool_or(a.status = 'succeeded'), false),
         COALESCE(bool_or(a.status = 'pending'), false)
    INTO v_any_succeeded, v_any_pending
    FROM public.refund_request_attempts a
   WHERE a.request_id = NEW.request_id;

  SELECT a.status, a.failure_reason INTO v_latest
    FROM public.refund_request_attempts a
   WHERE a.request_id = NEW.request_id
   ORDER BY a.attempt_no DESC
   LIMIT 1;

  v_status := CASE
    WHEN v_any_succeeded THEN 'refunded'
    WHEN v_any_pending THEN 'awaiting_stripe'
    WHEN v_latest.status IN ('failed', 'canceled') THEN 'failed'
    ELSE 'pending'
  END;
  v_failure := CASE
    WHEN v_status = 'failed' THEN v_latest.status || ': ' || COALESCE(v_latest.failure_reason, 'no reason given')
  END;

  UPDATE public.refund_requests r
     SET status = v_status,
         last_failure = v_failure,
         updated_at = now()
   WHERE r.id = NEW.request_id
     AND (r.status IS DISTINCT FROM v_status OR r.last_failure IS DISTINCT FROM v_failure);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_requests_recompute_status() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_refund_request_attempts_recompute
  AFTER INSERT OR UPDATE OF status, failure_reason ON public.refund_request_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.refund_requests_recompute_status();

-- ============================================================================
-- 4. Queueing RPCs (stripe-webhook; service_role only)
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
-- 5. Attempt RPCs (service_role only). stripe-approve-refund authorises the
--    site admin before calling begin/record; stripe-webhook calls settle.
-- ============================================================================

-- Start (or resume) the approval of one request. Under the request's row lock:
--   already_refunded  an attempt succeeded: nothing more may be refunded
--   fulfilled         abandoned cart whose session was fulfilled after all
--   resume            an attempt is still pending: carry on with IT (its
--                     idempotency key and any refund already stamped for it)
--   claimed           no attempt pending or succeeded: attempt n+1 created
--   not_found
CREATE OR REPLACE FUNCTION public.begin_refund_attempt(
  p_request_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS TABLE (
  outcome text,
  attempt_id uuid,
  attempt_no integer,
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
#variable_conflict use_column
DECLARE
  v_req public.refund_requests%ROWTYPE;
  v_attempt public.refund_request_attempts%ROWTYPE;
  v_cart_status text;
  v_next integer;
BEGIN
  IF p_actor_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'begin_refund_attempt: an approving user is required'
      USING errcode = '22023';
  END IF;

  SELECT * INTO v_req
    FROM public.refund_requests r
   WHERE r.id = p_request_id
   FOR UPDATE;
  IF v_req.id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::integer, NULL::text, NULL::text,
      NULL::text, NULL::integer, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_attempt
    FROM public.refund_request_attempts a
   WHERE a.request_id = v_req.id AND a.status = 'succeeded'
   ORDER BY a.attempt_no DESC
   LIMIT 1;
  IF v_attempt.id IS NOT NULL THEN
    RETURN QUERY SELECT 'already_refunded'::text, v_attempt.id, v_attempt.attempt_no, v_req.kind,
      v_req.stripe_payment_intent_id, v_req.stripe_checkout_session_id, v_req.amount_cents,
      v_req.reason, v_attempt.stripe_refund_id;
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
    END IF;
    IF (v_req.cart_id IS NOT NULL AND v_cart_status IS DISTINCT FROM 'refund_pending')
       OR EXISTS (SELECT 1 FROM public.stripe_orders o
                   WHERE o.stripe_checkout_session_id = v_req.stripe_checkout_session_id)
       OR EXISTS (SELECT 1 FROM public.entries e
                   WHERE e.stripe_payment_intent_id = v_req.stripe_payment_intent_id) THEN
      RETURN QUERY SELECT 'fulfilled'::text, NULL::uuid, NULL::integer, v_req.kind,
        v_req.stripe_payment_intent_id, v_req.stripe_checkout_session_id, v_req.amount_cents,
        v_req.reason, NULL::text;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_attempt
    FROM public.refund_request_attempts a
   WHERE a.request_id = v_req.id AND a.status = 'pending';
  IF v_attempt.id IS NOT NULL THEN
    RETURN QUERY SELECT 'resume'::text, v_attempt.id, v_attempt.attempt_no, v_req.kind,
      v_req.stripe_payment_intent_id, v_req.stripe_checkout_session_id, v_req.amount_cents,
      v_req.reason, v_attempt.stripe_refund_id;
    RETURN;
  END IF;

  SELECT COALESCE(max(a.attempt_no), 0) + 1 INTO v_next
    FROM public.refund_request_attempts a
   WHERE a.request_id = v_req.id;

  INSERT INTO public.refund_request_attempts AS a
    (request_id, attempt_no, approved_by_auth_user_id)
  VALUES (v_req.id, v_next, p_actor_auth_user_id)
  RETURNING a.* INTO v_attempt;

  RETURN QUERY SELECT 'claimed'::text, v_attempt.id, v_attempt.attempt_no, v_req.kind,
    v_req.stripe_payment_intent_id, v_req.stripe_checkout_session_id, v_req.amount_cents,
    v_req.reason, NULL::text;
END;
$$;

-- Never move a settled attempt back to 'pending': a delayed write carrying an
-- older 'pending' must not undo what Stripe already reported.
CREATE OR REPLACE FUNCTION public.refund_attempt_next_status(p_current text, p_reported text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_reported = 'pending' AND p_current <> 'pending' THEN p_current
    ELSE p_reported
  END
$$;

-- The approval records the Stripe refund on ITS attempt only:
--   recorded                  written (the id the first time, then status)
--   refund_on_other_attempt   that Stripe refund belongs to another attempt
--   attempt_has_other_refund  this attempt already holds a different refund
--   not_found
CREATE OR REPLACE FUNCTION public.record_refund_attempt(
  p_attempt_id uuid,
  p_stripe_refund_id text,
  p_status text,
  p_failure_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.refund_request_attempts%ROWTYPE;
  v_status text;
BEGIN
  IF p_stripe_refund_id IS NULL OR p_status NOT IN ('pending', 'succeeded', 'failed', 'canceled') THEN
    RAISE EXCEPTION 'record_refund_attempt: a Stripe refund id and a Stripe status are required'
      USING errcode = '22023';
  END IF;

  SELECT * INTO v_attempt
    FROM public.refund_request_attempts a
   WHERE a.id = p_attempt_id
   FOR UPDATE;
  IF v_attempt.id IS NULL THEN
    RETURN 'not_found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.refund_request_attempts a
              WHERE a.stripe_refund_id = p_stripe_refund_id AND a.id <> p_attempt_id) THEN
    RETURN 'refund_on_other_attempt';
  END IF;
  IF v_attempt.stripe_refund_id IS NOT NULL
     AND v_attempt.stripe_refund_id <> p_stripe_refund_id THEN
    RETURN 'attempt_has_other_refund';
  END IF;

  v_status := public.refund_attempt_next_status(v_attempt.status, p_status);
  UPDATE public.refund_request_attempts a
     SET stripe_refund_id = p_stripe_refund_id,
         status = v_status,
         failure_reason = CASE WHEN v_status IN ('failed', 'canceled')
                               THEN COALESCE(p_failure_reason, a.failure_reason) END,
         updated_at = now()
   WHERE a.id = p_attempt_id
     AND (a.stripe_refund_id IS NULL OR a.stripe_refund_id = p_stripe_refund_id);
  RETURN 'recorded';
END;
$$;

-- stripe-webhook: apply Stripe's CURRENT status for one refund to the attempt
-- that owns it, and to nothing else. A refund no attempt owns is 'not_found'
-- (logged and ignored by the caller). live_attempts counts the request's
-- pending/succeeded attempts after the write; above 1 means two refunds are
-- live for one request.
CREATE OR REPLACE FUNCTION public.settle_refund_attempt(
  p_stripe_refund_id text,
  p_status text,
  p_failure_reason text DEFAULT NULL
)
RETURNS TABLE (
  outcome text,
  request_id uuid,
  attempt_status text,
  request_status text,
  live_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_attempt public.refund_request_attempts%ROWTYPE;
  v_status text;
  v_outcome text;
BEGIN
  IF p_stripe_refund_id IS NULL OR p_status NOT IN ('pending', 'succeeded', 'failed', 'canceled') THEN
    RAISE EXCEPTION 'settle_refund_attempt: a Stripe refund id and a Stripe status are required'
      USING errcode = '22023';
  END IF;

  SELECT * INTO v_attempt
    FROM public.refund_request_attempts a
   WHERE a.stripe_refund_id = p_stripe_refund_id
   FOR UPDATE;
  IF v_attempt.id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;

  v_status := public.refund_attempt_next_status(v_attempt.status, p_status);
  IF v_status = v_attempt.status THEN
    v_outcome := 'unchanged';
  ELSE
    v_outcome := 'updated';
    UPDATE public.refund_request_attempts a
       SET status = v_status,
           failure_reason = CASE WHEN v_status IN ('failed', 'canceled')
                                 THEN COALESCE(p_failure_reason, a.failure_reason) END,
           updated_at = now()
     WHERE a.id = v_attempt.id;
  END IF;

  RETURN QUERY
    SELECT v_outcome, r.id, v_status, r.status,
           (SELECT count(*)::integer FROM public.refund_request_attempts a
             WHERE a.request_id = r.id AND a.status IN ('pending', 'succeeded'))
      FROM public.refund_requests r
     WHERE r.id = v_attempt.request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_abandoned_cart_refund(uuid, text, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_refund_approval(text, text, text, integer, text, jsonb, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_refund_attempt(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_attempt_next_status(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_refund_attempt(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_refund_attempt(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_abandoned_cart_refund(uuid, text, text, integer, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.request_refund_approval(text, text, text, integer, text, jsonb, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_refund_attempt(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_attempt_next_status(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_refund_attempt(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_refund_attempt(text, text, text) TO service_role;

COMMIT;
