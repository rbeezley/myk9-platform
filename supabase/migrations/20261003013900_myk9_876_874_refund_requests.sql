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
--    section 4) and raises the existing CRITICAL operator alert. Each request
--    is written in the SAME transaction as its fulfillment latch: the
--    abandoned-cart claim (cart -> refund_pending) and the payment-link close
--    (link -> paid, queue_payment_link_refund). The cart-overflow share is not
--    queued: its amount exists only after the cart latch closed, so it cannot
--    be atomic with it, and it is refunded by hand until MYK9-964 (Codex
--    round 13 on #2689).
--
-- 3. public.refund_request_attempts — one row per approval that tried to
--    refund a request (Codex review rounds 1-2 on #2689). Each attempt owns
--    AT MOST ONE Stripe refund, written once, and a settle changes only that
--    one attempt. The
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
--    Every attempt write is a compare-and-set on attempts.version (Codex
--    round 3 on #2689): the caller passes the version it read, a mismatch
--    returns 'conflict' and writes nothing.
--
--    The one exception to "settle from Stripe": when Stripe DEFINITIVELY
--    rejects creating the refund, no refund exists to re-read, and
--    fail_unissued_refund_attempt marks that attempt failed with Stripe's
--    error code (CAS, attempt pending with no refund id only; Codex round 7).
--
--    ONE SETTLE PATH, STRIPE THE ONLY TRUTH (Codex round 4 on #2689).
--    record_refund_attempt attaches a refund id and never a status;
--    settle_refund_attempt is the only status writer, and its only caller is
--    settleAttemptFromStripe (refundSettlement.ts), which reads the attempt's
--    version, re-reads the refund from Stripe, then settles as a
--    compare-and-set. The webhook and the admin's "Check status" both go
--    through it; if Stripe cannot be reached nothing is written.
--
--    LOCK ORDER: refund_requests row, then refund_request_attempts row. Every
--    RPC that writes attempts locks the request first, and the recompute
--    trigger takes the request lock BEFORE it reads the attempts, so a
--    delayed write can never recompute from a stale read and overwrite a
--    newer status.
--
--    RESOLVED WITHOUT REFUND (Codex round 6 on #2689). When the charge is
--    honored another way (an admin fulfills the entries by hand), a site
--    admin resolves the request: resolve_refund_request_without_refund, with
--    a required note, only while the request is 'pending' or 'failed' and no
--    attempt is pending or succeeded, under the request's row lock. The
--    state is TERMINAL and manual: begin_refund_attempt refuses it
--    ('resolved'), and the recompute trigger never overwrites it.
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
    -- Cart overflow is NOT queued (Codex round 13 on #2689, option C): its
    -- amount is only known after the cart latch closes, so it cannot be atomic
    -- with it; an operator alert handles it by hand until MYK9-964.
    CHECK (kind IN ('abandoned_cart', 'entry_payment_link')),
  -- DERIVED from refund_request_attempts by refund_requests_recompute_status
  -- (see the header); no RPC writes it directly.
  -- 'resolved_without_refund' is the one MANUAL, terminal state
  -- (resolve_refund_request_without_refund); the trigger never overwrites it.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'awaiting_stripe', 'refunded', 'failed',
                      'resolved_without_refund')),
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
  -- Set together, only by resolve_refund_request_without_refund.
  -- auth.users id of the resolving site admin (never a people.id).
  resolved_by_auth_user_id uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_requests_once_per_session UNIQUE (stripe_checkout_session_id, kind),
  CONSTRAINT refund_requests_failure_shape CHECK ((status = 'failed') = (last_failure IS NOT NULL)),
  CONSTRAINT refund_requests_resolution_shape CHECK (
    (status = 'resolved_without_refund') = (resolved_at IS NOT NULL)
    AND (resolved_at IS NULL) = (resolved_by_auth_user_id IS NULL)
    AND (resolved_at IS NULL) = (resolution_note IS NULL)
    AND (resolution_note IS NULL OR btrim(resolution_note) <> '')
  )
);

COMMENT ON TABLE public.refund_requests IS
  'MYK9-876/874: refunds the platform owes. Written by stripe-webhook (SECURITY DEFINER RPCs); refunded only through refund_request_attempts, which stripe-approve-refund creates after a site admin approves. status/last_failure are derived from the attempts, except the terminal manual resolved_without_refund (resolve_refund_request_without_refund, note required). Site admins read; no client writes.';

CREATE INDEX refund_requests_open_idx
  ON public.refund_requests (created_at)
  WHERE status NOT IN ('refunded', 'resolved_without_refund');

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
  -- Written ONCE (record_refund_attempt); never the source of a status.
  stripe_refund_id text UNIQUE,
  -- Stripe's refund status ('requires_action' is stored as 'pending').
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled')),
  failure_reason text,
  -- Compare-and-set token: every write passes the version it read and bumps it.
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
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
-- every attempt write. The request row is locked FIRST and the attempts read
-- after it (Codex round 3): reading first let a delayed write compute from a
-- stale snapshot, wait for the lock, and then overwrite a newer status.
CREATE OR REPLACE FUNCTION public.refund_requests_recompute_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_status text;
  v_any_succeeded boolean;
  v_any_pending boolean;
  v_latest record;
  v_status text;
  v_failure text;
BEGIN
  SELECT r.status INTO v_request_status
    FROM public.refund_requests r WHERE r.id = NEW.request_id FOR UPDATE;
  -- A manual resolution is terminal (Codex round 6): never derived over.
  IF v_request_status = 'resolved_without_refund' THEN
    RETURN NULL;
  END IF;

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
RETURNS TABLE (outcome text, refund_request_id uuid, request_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cart record;
  v_existing uuid;
  v_existing_status text;
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

  SELECT r.id, r.status INTO v_existing, v_existing_status
    FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = p_session_id
     AND r.kind = 'abandoned_cart';
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT 'already_pending'::text, v_existing, v_existing_status;
    RETURN;
  END IF;

  IF v_cart.id IS NULL
     OR v_cart.status NOT IN ('abandoned', 'expired')
     OR v_cart.stripe_checkout_session_id IS DISTINCT FROM p_session_id THEN
    RETURN QUERY SELECT 'not_refundable'::text, NULL::uuid, NULL::text;
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

  RETURN QUERY SELECT 'claimed'::text, v_id, 'pending'::text;
END;
$$;

-- MYK9-876 (Codex rounds 13-14 on #2689): the payment-link refund obligation
-- and order, ATOMIC with the link's fulfillment latch. In ONE transaction:
--   * with p_link_id and p_close_from, the link moves p_close_from -> 'paid'
--     (the webhook's idempotency latch for this session);
--   * with p_order, the session's stripe_orders row is inserted from the
--     webhook's column values (ON CONFLICT DO NOTHING: an order that already
--     exists stays as it is), so a closed latch always has its order;
--   * with p_amount_cents, the entry_payment_link refund request is inserted,
--     idempotent on (session, kind);
-- and it returns the link's status and the session's request, if any. With
-- neither it only READS, which a redelivery uses to find the request. So a
-- closed latch always has its request beside it, and a lost response or a
-- redelivery finds both. p_link_id NULL is the paid session with no link row
-- (queue only). A link or show deleted before a redelivery is stored as NULL
-- and its original id kept in detail, so a missing parent never blocks the
-- insert.
CREATE OR REPLACE FUNCTION public.queue_payment_link_refund(
  p_session_id text,
  p_link_id uuid DEFAULT NULL,
  p_close_from text DEFAULT NULL,
  p_payment_intent_id text DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_show_id uuid DEFAULT NULL,
  p_order jsonb DEFAULT NULL
)
RETURNS TABLE (
  link_status text,
  link_closed boolean,
  order_created boolean,
  refund_request_id uuid,
  created boolean,
  request_status text,
  amount_cents integer,
  reason text,
  stripe_payment_intent_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_link_status text;
  v_closed boolean := false;
  v_order_rows integer := 0;
  v_id uuid;
  v_req public.refund_requests%ROWTYPE;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'queue_payment_link_refund: a session is required' USING errcode = '22023';
  END IF;
  IF p_close_from IS NOT NULL AND (p_link_id IS NULL OR p_close_from NOT IN ('open', 'expired')) THEN
    RAISE EXCEPTION 'queue_payment_link_refund: a link closes only from open or expired'
      USING errcode = '22023';
  END IF;
  IF p_amount_cents IS NOT NULL AND (p_amount_cents <= 0 OR p_payment_intent_id IS NULL) THEN
    RAISE EXCEPTION 'queue_payment_link_refund: a refund needs an intent and a positive amount'
      USING errcode = '22023';
  END IF;

  IF p_link_id IS NOT NULL THEN
    SELECT l.status INTO v_link_status
      FROM public.entry_payment_links l
     WHERE l.id = p_link_id
     FOR UPDATE;
    IF p_close_from IS NOT NULL AND v_link_status = p_close_from THEN
      UPDATE public.entry_payment_links l
         SET status = 'paid',
             updated_at = now()
       WHERE l.id = p_link_id;
      v_link_status := 'paid';
      v_closed := true;
    END IF;
  END IF;

  -- The order, column for column as the webhook built it, typed by the table
  -- itself. The session id is this call's, never the payload's.
  IF p_order IS NOT NULL THEN
    INSERT INTO public.stripe_orders AS o (
      customer_id, stripe_payment_intent_id, stripe_checkout_session_id, amount_cents,
      currency, status, order_type, entry_subtotal_cents, platform_fee_cents,
      platform_fee_rate, stripe_processing_fee_cents, refunded_cents,
      make_whole_refunded_cents, metadata, show_id, entry_ids, paid_at
    )
    SELECT x.customer_id, x.stripe_payment_intent_id, p_session_id, x.amount_cents,
           x.currency, x.status, x.order_type, x.entry_subtotal_cents, x.platform_fee_cents,
           x.platform_fee_rate, x.stripe_processing_fee_cents, x.refunded_cents,
           x.make_whole_refunded_cents, x.metadata, x.show_id, x.entry_ids, x.paid_at
      FROM jsonb_populate_record(NULL::public.stripe_orders, p_order) AS x
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_order_rows = ROW_COUNT;
  END IF;

  IF p_amount_cents IS NOT NULL THEN
    INSERT INTO public.refund_requests AS r (
      kind, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents,
      reason, entry_payment_link_id, show_id, detail
    )
    VALUES (
      'entry_payment_link', p_session_id, p_payment_intent_id, p_amount_cents, p_reason,
      (SELECT l.id FROM public.entry_payment_links l WHERE l.id = p_link_id),
      (SELECT sh.id FROM public.shows sh WHERE sh.id = p_show_id),
      COALESCE(p_detail, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
             'entry_payment_link_id', p_link_id,
             'show_id', p_show_id))
    )
    ON CONFLICT (stripe_checkout_session_id, kind) DO NOTHING
    RETURNING r.id INTO v_id;
  END IF;

  SELECT * INTO v_req
    FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = p_session_id
     AND r.kind = 'entry_payment_link';

  RETURN QUERY SELECT v_link_status, v_closed, (v_order_rows > 0), v_req.id, (v_id IS NOT NULL),
    v_req.status, v_req.amount_cents, v_req.reason, v_req.stripe_payment_intent_id;
END;
$$;

-- ============================================================================
-- 5. Attempt RPCs (service_role only). stripe-approve-refund authorises the
--    site admin before calling begin or resolve; settleAttemptFromStripe
--    (approval and webhook alike) calls state, record and settle.
-- ============================================================================

-- Start (or resume) the approval of one request. Under the request's row lock:
--   resolved          resolved without refund by a site admin: refused
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
  stripe_refund_id text,
  attempt_version integer
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
      NULL::text, NULL::integer, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;

  IF v_req.status = 'resolved_without_refund' THEN
    RETURN QUERY SELECT 'resolved'::text, NULL::uuid, NULL::integer, v_req.kind,
      v_req.stripe_payment_intent_id, v_req.stripe_checkout_session_id, v_req.amount_cents,
      v_req.reason, NULL::text, NULL::integer;
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
      v_req.reason, v_attempt.stripe_refund_id, v_attempt.version;
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
        v_req.reason, NULL::text, NULL::integer;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_attempt
    FROM public.refund_request_attempts a
   WHERE a.request_id = v_req.id AND a.status = 'pending';
  IF v_attempt.id IS NOT NULL THEN
    RETURN QUERY SELECT 'resume'::text, v_attempt.id, v_attempt.attempt_no, v_req.kind,
      v_req.stripe_payment_intent_id, v_req.stripe_checkout_session_id, v_req.amount_cents,
      v_req.reason, v_attempt.stripe_refund_id, v_attempt.version;
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
    v_req.reason, NULL::text, v_attempt.version;
END;
$$;

-- Never move a settled attempt back to 'pending': a reported 'pending' (an
-- older observation) must not undo what Stripe already reported.
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

-- Attach a Stripe refund id to its attempt, once (Codex rounds 3-4 on #2689).
-- It writes the id ONLY, never a status: every status comes from
-- settle_refund_attempt, after a caller re-reads the refund from Stripe.
--   recorded                  the id is now on the attempt
--   conflict                  the attempt changed since the caller read it
--                             (version mismatch): nothing written
--   already_recorded          the attempt already holds a refund: nothing written
--   refund_on_other_attempt   that Stripe refund belongs to another attempt
--   not_found
CREATE OR REPLACE FUNCTION public.record_refund_attempt(
  p_attempt_id uuid,
  p_expected_version integer,
  p_stripe_refund_id text
)
RETURNS TABLE (
  outcome text,
  attempt_status text,
  stripe_refund_id text,
  attempt_version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_request_id uuid;
  v_attempt public.refund_request_attempts%ROWTYPE;
  v_outcome text;
BEGIN
  IF p_stripe_refund_id IS NULL OR p_expected_version IS NULL THEN
    RAISE EXCEPTION 'record_refund_attempt: a version and a Stripe refund id are required'
      USING errcode = '22023';
  END IF;

  SELECT a.request_id INTO v_request_id
    FROM public.refund_request_attempts a WHERE a.id = p_attempt_id;
  IF v_request_id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;
  -- Lock order: request, then attempt.
  PERFORM 1 FROM public.refund_requests r WHERE r.id = v_request_id FOR UPDATE;
  SELECT * INTO v_attempt
    FROM public.refund_request_attempts a
   WHERE a.id = p_attempt_id
   FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.refund_request_attempts a
              WHERE a.stripe_refund_id = p_stripe_refund_id AND a.id <> p_attempt_id) THEN
    v_outcome := 'refund_on_other_attempt';
  ELSIF v_attempt.version <> p_expected_version THEN
    v_outcome := 'conflict';
  ELSIF v_attempt.stripe_refund_id IS NOT NULL THEN
    v_outcome := 'already_recorded';
  ELSE
    UPDATE public.refund_request_attempts a
       SET stripe_refund_id = p_stripe_refund_id,
           version = a.version + 1,
           updated_at = now()
     WHERE a.id = p_attempt_id
       AND a.version = p_expected_version
    RETURNING a.* INTO v_attempt;
    v_outcome := 'recorded';
  END IF;

  RETURN QUERY SELECT v_outcome, v_attempt.status, v_attempt.stripe_refund_id, v_attempt.version;
END;
$$;

-- One attempt as the settle routine reads it BEFORE it asks Stripe: its id,
-- version, refund id (NULL until attached), and the REQUEST's payment intent,
-- kind and reason (Codex round 7: the ledger branch is chosen from the
-- request row, never the event). No row: no such request. A row with a NULL
-- attempt_id: the request exists but that attempt does not.
CREATE OR REPLACE FUNCTION public.refund_attempt_state(p_request_id uuid, p_attempt_no integer)
RETURNS TABLE (
  attempt_id uuid,
  attempt_version integer,
  stripe_refund_id text,
  attempt_status text,
  stripe_payment_intent_id text,
  request_kind text,
  request_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.id, a.version, a.stripe_refund_id, a.status, r.stripe_payment_intent_id,
         r.kind, r.reason
    FROM public.refund_requests r
    LEFT JOIN public.refund_request_attempts a
      ON a.request_id = r.id AND a.attempt_no = p_attempt_no
   WHERE r.id = p_request_id
$$;

-- Stripe DEFINITIVELY rejected creating this attempt's refund (a 4xx invalid
-- request with a known permanent code, e.g. charge_already_refunded), so no
-- refund exists and the same idempotency key would only replay the error
-- (Codex round 7 on #2689). Mark the attempt failed with that code, as a
-- compare-and-set, so the request derives to 'failed' and can be approved
-- again (attempt n+1, a new key) or resolved without refund. Only an attempt
-- that is pending and holds NO refund id qualifies:
--   failed          written
--   conflict        version mismatch: nothing written
--   already_issued  the attempt holds a refund: nothing written (settle it)
--   not_pending     the attempt is settled: nothing written
--   not_found
CREATE OR REPLACE FUNCTION public.fail_unissued_refund_attempt(
  p_attempt_id uuid,
  p_expected_version integer,
  p_failure_reason text
)
RETURNS TABLE (outcome text, attempt_status text, attempt_version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_request_id uuid;
  v_attempt public.refund_request_attempts%ROWTYPE;
  v_outcome text;
BEGIN
  IF p_expected_version IS NULL OR p_failure_reason IS NULL OR btrim(p_failure_reason) = '' THEN
    RAISE EXCEPTION 'fail_unissued_refund_attempt: a version and a Stripe error code are required'
      USING errcode = '22023';
  END IF;

  SELECT a.request_id INTO v_request_id
    FROM public.refund_request_attempts a WHERE a.id = p_attempt_id;
  IF v_request_id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::integer;
    RETURN;
  END IF;
  -- Lock order: request, then attempt.
  PERFORM 1 FROM public.refund_requests r WHERE r.id = v_request_id FOR UPDATE;
  SELECT * INTO v_attempt
    FROM public.refund_request_attempts a
   WHERE a.id = p_attempt_id
   FOR UPDATE;

  IF v_attempt.version <> p_expected_version THEN
    v_outcome := 'conflict';
  ELSIF v_attempt.stripe_refund_id IS NOT NULL THEN
    v_outcome := 'already_issued';
  ELSIF v_attempt.status <> 'pending' THEN
    v_outcome := 'not_pending';
  ELSE
    UPDATE public.refund_request_attempts a
       SET status = 'failed',
           failure_reason = p_failure_reason,
           version = a.version + 1,
           updated_at = now()
     WHERE a.id = p_attempt_id
       AND a.version = p_expected_version
    RETURNING a.* INTO v_attempt;
    v_outcome := 'failed';
  END IF;

  RETURN QUERY SELECT v_outcome, v_attempt.status, v_attempt.version;
END;
$$;

-- The ONLY status writer (Codex round 4 on #2689): settleAttemptFromStripe
-- calls it with the refund's CURRENT state, re-read from Stripe after it read
-- the attempt's version. A compare-and-set on that version: 'conflict' means
-- another write landed in between, nothing is written, and the caller reads
-- the version and Stripe again. An attempt with no refund attached is
-- 'no_refund' (nothing to settle). live_attempts counts the request's
-- pending/succeeded attempts after the write; above 1 means two refunds are
-- live for one request.
CREATE OR REPLACE FUNCTION public.settle_refund_attempt(
  p_attempt_id uuid,
  p_expected_version integer,
  p_status text,
  p_failure_reason text DEFAULT NULL
)
RETURNS TABLE (
  outcome text,
  request_id uuid,
  attempt_status text,
  request_status text,
  live_attempts integer,
  attempt_version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_request_id uuid;
  v_attempt public.refund_request_attempts%ROWTYPE;
  v_status text;
  v_outcome text;
BEGIN
  IF p_attempt_id IS NULL OR p_expected_version IS NULL
     OR p_status NOT IN ('pending', 'succeeded', 'failed', 'canceled') THEN
    RAISE EXCEPTION 'settle_refund_attempt: an attempt, a version and a Stripe status are required'
      USING errcode = '22023';
  END IF;

  SELECT a.request_id INTO v_request_id
    FROM public.refund_request_attempts a WHERE a.id = p_attempt_id;
  IF v_request_id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text, NULL::text, NULL::integer,
      NULL::integer;
    RETURN;
  END IF;
  -- Lock order: request, then attempt.
  PERFORM 1 FROM public.refund_requests r WHERE r.id = v_request_id FOR UPDATE;
  SELECT * INTO v_attempt
    FROM public.refund_request_attempts a
   WHERE a.id = p_attempt_id
   FOR UPDATE;

  v_status := public.refund_attempt_next_status(v_attempt.status, p_status);
  IF v_attempt.version <> p_expected_version THEN
    v_outcome := 'conflict';
    v_status := v_attempt.status;
  ELSIF v_attempt.stripe_refund_id IS NULL THEN
    v_outcome := 'no_refund';
    v_status := v_attempt.status;
  ELSIF v_status = v_attempt.status THEN
    v_outcome := 'unchanged';
  ELSE
    UPDATE public.refund_request_attempts a
       SET status = v_status,
           failure_reason = CASE WHEN v_status IN ('failed', 'canceled')
                                 THEN COALESCE(p_failure_reason, a.failure_reason) END,
           version = a.version + 1,
           updated_at = now()
     WHERE a.id = v_attempt.id
       AND a.version = p_expected_version
    RETURNING a.* INTO v_attempt;
    v_outcome := 'updated';
  END IF;

  RETURN QUERY
    SELECT v_outcome, r.id, v_status, r.status,
           (SELECT count(*)::integer FROM public.refund_request_attempts a
             WHERE a.request_id = r.id AND a.status IN ('pending', 'succeeded')),
           v_attempt.version
      FROM public.refund_requests r
     WHERE r.id = v_request_id;
END;
$$;

-- A site admin closes a request WITHOUT a refund (the charge was honored
-- another way, e.g. entries fulfilled by hand), with a required note. Under the
-- request's row lock:
--   resolved                the request is now resolved_without_refund
--   already_resolved        it already was: nothing written
--   has_live_attempt        an attempt is pending or succeeded at Stripe:
--                           nothing written (settle it first)
--   not_resolvable          any other status: nothing written
--   note_required           blank note: nothing written
--   not_found
-- stripe-approve-refund authorises the site admin before calling it.
CREATE OR REPLACE FUNCTION public.resolve_refund_request_without_refund(
  p_request_id uuid,
  p_actor_auth_user_id uuid,
  p_note text
)
RETURNS TABLE (outcome text, request_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_req public.refund_requests%ROWTYPE;
BEGIN
  IF p_actor_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'resolve_refund_request_without_refund: a resolving user is required'
      USING errcode = '22023';
  END IF;

  SELECT * INTO v_req
    FROM public.refund_requests r
   WHERE r.id = p_request_id
   FOR UPDATE;
  IF v_req.id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text;
    RETURN;
  END IF;
  IF v_req.status = 'resolved_without_refund' THEN
    RETURN QUERY SELECT 'already_resolved'::text, v_req.status;
    RETURN;
  END IF;
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RETURN QUERY SELECT 'note_required'::text, v_req.status;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.refund_request_attempts a
              WHERE a.request_id = v_req.id AND a.status IN ('pending', 'succeeded')) THEN
    RETURN QUERY SELECT 'has_live_attempt'::text, v_req.status;
    RETURN;
  END IF;
  IF v_req.status NOT IN ('pending', 'failed') THEN
    RETURN QUERY SELECT 'not_resolvable'::text, v_req.status;
    RETURN;
  END IF;

  UPDATE public.refund_requests r
     SET status = 'resolved_without_refund',
         last_failure = NULL,
         resolved_by_auth_user_id = p_actor_auth_user_id,
         resolved_at = now(),
         resolution_note = btrim(p_note),
         updated_at = now()
   WHERE r.id = v_req.id;

  RETURN QUERY SELECT 'resolved'::text, 'resolved_without_refund'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_abandoned_cart_refund(uuid, text, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_payment_link_refund(text, uuid, text, text, integer, text, jsonb, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_refund_attempt(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_attempt_next_status(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_refund_attempt(uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_attempt_state(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_refund_attempt(uuid, integer, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_refund_request_without_refund(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_unissued_refund_attempt(uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_abandoned_cart_refund(uuid, text, text, integer, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_payment_link_refund(text, uuid, text, text, integer, text, jsonb, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_refund_attempt(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_attempt_next_status(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_refund_attempt(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_attempt_state(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_refund_attempt(uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_refund_request_without_refund(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_unissued_refund_attempt(uuid, integer, text) TO service_role;

COMMIT;
