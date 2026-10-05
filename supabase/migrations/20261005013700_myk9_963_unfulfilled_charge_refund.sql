-- MYK9-963: a paid checkout that created NOTHING joins the refund approval
-- queue, as kind 'unfulfilled_charge'.
--
-- stripe-webhook used to raise an operator alert that said "refund it from the
-- Stripe dashboard" whenever a PAID cart checkout could not be fulfilled at
-- all. Each reason is now a queued request instead (refund_requests.reason):
--   no_cart                   the cart row is gone
--   cart_classes_not_in_show  a cart class does not belong to the cart's show
--   paid_amount_mismatch      the charge disagrees with authoritative pricing
--   cart_not_claimable        the cart is no longer active on this session
--                             (most often a second charge for a cart another
--                             checkout already fulfilled)
--   stale_checkout            the cart changed (or expired) after this
--                             checkout started
-- (The fifth alert the issue names, "Paid cart could not be claimed", no
-- longer exists: MYK9-964 replaced that claim with begin_cart_fulfillment,
-- whose failure is a 5xx that Stripe retries.)
--
-- The exhibitor got nothing, so the request is the FULL charge, service fee
-- included (owner rule 2026-10-04, MYK9-997). Refunds stay human-approved:
-- the webhook only queues, and stripe-approve-refund issues the refund after
-- a site admin approves it.
--
-- 1. refund_requests_kind_check gains 'unfulfilled_charge' (restated from
--    20261004214700_myk9_964_replayable_cart_fulfillment.sql).
--
-- 2. queue_unfulfilled_charge_refund (service_role only) inserts the request,
--    idempotent on (session, kind), and reports:
--      queued          this call inserted it
--      already_queued  it was already there (a retry or a redelivery)
--      delivered       the session HAS something: a stripe_orders row, a cart
--                      fulfillment run, or entries stamped with the payment
--                      intent. Nothing is inserted.
--      other_request   the session already has a request of another kind.
--                      Nothing is inserted.
--    The cart (when named) is locked first, the lock begin_cart_fulfillment
--    and claim_abandoned_cart_refund take, so a run cannot appear between
--    the 'delivered' check and the insert. A cart or show deleted before the
--    call is stored as NULL, with its original id kept in detail.
--    Once the request exists, every redelivery of the session stops at the
--    webhook's entry (paidSessionEntry.ts), so it is never fulfilled after.
--
-- 3. begin_refund_attempt refuses ('fulfilled') to approve an
--    unfulfilled_charge request whose session has an order, a fulfillment
--    run, or entries on its payment intent: the abandoned-cart guard, applied
--    to this kind too. The approval UI already explains 'fulfilled'.
--
-- 4. begin_cart_fulfillment refuses ('not_claimable') a session that has an
--    unfulfilled_charge request (Codex round 1 on #2758). The queue leaves
--    the cart as it was (the exhibitor may check out again with a NEW
--    session), so without this a concurrent delivery that passed validation
--    could still begin fulfilling the queued session. Both functions take
--    the cart row lock first, so queue and fulfillment are exclusive per
--    session in both orders: queue first -> fulfillment refused; run first ->
--    the queue reports 'delivered' and inserts nothing. One model for every
--    reason: the request itself is the latch.
--
-- Copied from their LATEST definitions (each matches the live body, 2026-10-05):
--   begin_refund_attempt    20261003013900_myk9_876_874_refund_requests.sql
--                           changed: the fulfilled guard only
--   begin_cart_fulfillment  20261004214700_myk9_964_replayable_cart_fulfillment.sql
--                           changed: the not_claimable condition only
--   claim_abandoned_cart_refund  20261003013900_myk9_876_874_refund_requests.sql
--                           changed: see section 5
--
-- 5. THE INVARIANT (Codex round 2 on #2758): at most one LIVE refund request
--    per checkout session and per payment intent, across every kind, as two
--    partial unique indexes. The pairwise guards stay; the indexes make any
--    ordering safe. claim_abandoned_cart_refund now inserts first and moves
--    the cart only when its own insert landed.
--
-- DEPLOY ORDER: push this migration BEFORE deploying stripe-webhook. The
-- deployed webhook never writes 'unfulfilled_charge'; the new one calls
-- queue_unfulfilled_charge_refund.
--
-- Behavioral coverage (runs in CI only):
-- supabase/tests/myk9_963_unfulfilled_charge_refund_test.sql

BEGIN;

-- ============================================================================
-- 1. The unfulfilled_charge refund kind
-- ============================================================================

ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_kind_check;
ALTER TABLE public.refund_requests
  ADD CONSTRAINT refund_requests_kind_check
  CHECK (kind IN ('abandoned_cart', 'entry_payment_link', 'cart_overflow', 'unfulfilled_charge'));

-- ============================================================================
-- 2. Queue a paid checkout that created nothing
-- ============================================================================

CREATE OR REPLACE FUNCTION public.queue_unfulfilled_charge_refund(
  p_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_reason text,
  p_cart_id uuid DEFAULT NULL,
  p_show_id uuid DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  outcome text,
  refund_request_id uuid,
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
  v_cart_id uuid;
  v_show_id uuid;
  v_req public.refund_requests%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_session_id IS NULL OR p_payment_intent_id IS NULL
     OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'queue_unfulfilled_charge_refund: session, intent and a positive amount are required'
      USING errcode = '22023';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN (
       'no_cart', 'cart_classes_not_in_show', 'paid_amount_mismatch',
       'cart_not_claimable', 'stale_checkout') THEN
    RAISE EXCEPTION 'queue_unfulfilled_charge_refund: unknown reason %', p_reason
      USING errcode = '22023';
  END IF;

  -- Lock order everywhere: entry_carts row first.
  IF p_cart_id IS NOT NULL THEN
    SELECT c.id INTO v_cart_id
      FROM public.entry_carts c
     WHERE c.id = p_cart_id
     FOR UPDATE;
  END IF;

  SELECT * INTO v_req
    FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = p_session_id
     AND r.kind = 'unfulfilled_charge'
     AND r.stripe_payment_intent_id = p_payment_intent_id;
  IF v_req.id IS NOT NULL THEN
    RETURN QUERY SELECT 'already_queued'::text, v_req.id, v_req.status, v_req.amount_cents,
      v_req.reason, v_req.stripe_payment_intent_id;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.refund_requests r
              WHERE r.stripe_checkout_session_id = p_session_id
                 OR r.stripe_payment_intent_id = p_payment_intent_id) THEN
    RETURN QUERY SELECT 'other_request'::text, NULL::uuid, NULL::text, NULL::integer,
      NULL::text, NULL::text;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.stripe_orders o
              WHERE o.stripe_checkout_session_id = p_session_id)
     OR EXISTS (SELECT 1 FROM public.cart_fulfillments f
                 WHERE f.stripe_checkout_session_id = p_session_id)
     OR EXISTS (SELECT 1 FROM public.entries e
                 WHERE e.stripe_payment_intent_id = p_payment_intent_id) THEN
    RETURN QUERY SELECT 'delivered'::text, NULL::uuid, NULL::text, NULL::integer,
      NULL::text, NULL::text;
    RETURN;
  END IF;

  IF p_show_id IS NOT NULL THEN
    SELECT s.id INTO v_show_id FROM public.shows s WHERE s.id = p_show_id;
  END IF;

  INSERT INTO public.refund_requests (
    kind, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents,
    reason, cart_id, show_id, detail
  )
  VALUES (
    'unfulfilled_charge', p_session_id, p_payment_intent_id, p_amount_cents,
    p_reason, v_cart_id, v_show_id,
    COALESCE(p_detail, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object('cart_id', p_cart_id, 'show_id', p_show_id))
  )
  -- No conflict target: either unique index (once per (session, kind), or
  -- one LIVE request per session / per payment intent, section 5) makes
  -- this a no-op, reported from what is there.
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  -- ON CONFLICT DO NOTHING may have yielded to ANOTHER row: report a request
  -- as ours only when it is this session's unfulfilled_charge on this intent.
  SELECT * INTO v_req
    FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = p_session_id
     AND r.kind = 'unfulfilled_charge'
     AND r.stripe_payment_intent_id = p_payment_intent_id;
  IF v_req.id IS NULL THEN
    RETURN QUERY SELECT 'other_request'::text, NULL::uuid, NULL::text, NULL::integer,
      NULL::text, NULL::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT
    CASE WHEN v_id IS NULL THEN 'already_queued' ELSE 'queued' END,
    v_req.id, v_req.status, v_req.amount_cents, v_req.reason, v_req.stripe_payment_intent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_unfulfilled_charge_refund(text, text, integer, text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_unfulfilled_charge_refund(text, text, integer, text, uuid, uuid, jsonb)
  TO service_role;

-- ============================================================================
-- 3. Approval refuses an unfulfilled_charge whose session was fulfilled
-- ============================================================================

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
  -- MYK9-963: an unfulfilled_charge request (a paid checkout that created
  -- nothing) is refused the same way, and also once a cart fulfillment run
  -- exists for its session. Its cart, if any, is locked first: the same lock
  -- begin_cart_fulfillment takes before it writes a run.
  IF v_req.kind IN ('abandoned_cart', 'unfulfilled_charge') THEN
    IF v_req.cart_id IS NOT NULL THEN
      SELECT c.status INTO v_cart_status
        FROM public.entry_carts c
       WHERE c.id = v_req.cart_id
       FOR UPDATE;
    END IF;
    IF (v_req.kind = 'abandoned_cart' AND v_req.cart_id IS NOT NULL
        AND v_cart_status IS DISTINCT FROM 'refund_pending')
       OR (v_req.kind = 'unfulfilled_charge'
           AND EXISTS (SELECT 1 FROM public.cart_fulfillments f
                        WHERE f.stripe_checkout_session_id = v_req.stripe_checkout_session_id))
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

REVOKE ALL ON FUNCTION public.begin_refund_attempt(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_refund_attempt(uuid, uuid) TO service_role;


-- ============================================================================
-- 4. Fulfillment refuses a session whose charge is queued as unfulfilled
-- ============================================================================

-- Copied from 20261004214700_myk9_964_replayable_cart_fulfillment.sql (its
-- only definition; matches the live body, 2026-10-05). Changed: the
-- not_claimable condition also covers an unfulfilled_charge request.
CREATE OR REPLACE FUNCTION public.begin_cart_fulfillment(
  p_cart_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_line_amounts jsonb
)
RETURNS TABLE (outcome text, cart_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_cart record;
  v_run public.cart_fulfillments%ROWTYPE;
  v_item_count integer;
  v_amount_count integer;
  v_priced_count integer;
BEGIN
  IF p_cart_id IS NULL OR p_session_id IS NULL OR p_payment_intent_id IS NULL
     OR p_line_amounts IS NULL OR jsonb_typeof(p_line_amounts) <> 'object' THEN
    RAISE EXCEPTION 'begin_cart_fulfillment: cart, session, intent and the line amounts are required'
      USING errcode = '22023';
  END IF;

  SELECT c.id, c.status, c.stripe_checkout_session_id, c.show_id, c.exhibitor_id
    INTO v_cart
    FROM public.entry_carts c
   WHERE c.id = p_cart_id
   FOR UPDATE;

  SELECT * INTO v_run
    FROM public.cart_fulfillments f
   WHERE f.stripe_checkout_session_id = p_session_id
   FOR UPDATE;
  IF v_run.stripe_checkout_session_id IS NOT NULL THEN
    IF v_run.cart_id IS NOT NULL AND v_run.cart_id IS DISTINCT FROM p_cart_id THEN
      RAISE EXCEPTION 'begin_cart_fulfillment: session % is being fulfilled for another cart', p_session_id
        USING errcode = '22023';
    END IF;
    RETURN QUERY SELECT
      CASE WHEN v_run.completed_at IS NULL THEN 'resumed' ELSE 'completed' END,
      v_cart.status::text;
    RETURN;
  END IF;

  -- MYK9-963 (Codex round 1 on #2758): a session whose charge is already
  -- queued as unfulfilled_charge is never fulfilled, whatever its cart says.
  -- Checked under the cart lock queue_unfulfilled_charge_refund also takes,
  -- after the run check: a run that began first is resumed (and the queue
  -- reports 'delivered' for it), so the two are exclusive in both orders.
  IF v_cart.id IS NULL
     OR v_cart.status IS DISTINCT FROM 'active'
     OR v_cart.stripe_checkout_session_id IS DISTINCT FROM p_session_id
     OR EXISTS (SELECT 1 FROM public.refund_requests r
                 WHERE r.stripe_checkout_session_id = p_session_id
                   AND r.kind = 'unfulfilled_charge') THEN
    RETURN QUERY SELECT 'not_claimable'::text, v_cart.status::text;
    RETURN;
  END IF;

  -- The verified amounts must price exactly the lines the cart holds now,
  -- each a whole, non-negative number of cents.
  SELECT count(*) INTO v_item_count
    FROM public.entry_cart_items i WHERE i.cart_id = p_cart_id;
  SELECT count(*) INTO v_amount_count FROM jsonb_object_keys(p_line_amounts);
  SELECT count(*) INTO v_priced_count
    FROM public.entry_cart_items i
   WHERE i.cart_id = p_cart_id
     AND jsonb_typeof(p_line_amounts -> i.id::text) = 'number'
     AND (p_line_amounts ->> i.id::text)::numeric >= 0
     AND (p_line_amounts ->> i.id::text)::numeric = trunc((p_line_amounts ->> i.id::text)::numeric);
  IF v_item_count = 0 OR v_amount_count <> v_item_count OR v_priced_count <> v_item_count THEN
    RAISE EXCEPTION 'begin_cart_fulfillment: the line amounts must price exactly the % line(s) of cart %',
      v_item_count, p_cart_id
      USING errcode = '22023';
  END IF;

  INSERT INTO public.cart_fulfillments (
    stripe_checkout_session_id, cart_id, show_id, exhibitor_id, stripe_payment_intent_id
  )
  VALUES (p_session_id, p_cart_id, v_cart.show_id, v_cart.exhibitor_id, p_payment_intent_id);

  INSERT INTO public.cart_fulfillment_lines (
    stripe_checkout_session_id, cart_item_id, line_no, dog_id, class_id, trial_id, handler_id,
    jump_height, special_requests, junior_fee_declared, existing_entry_id, line_amount_cents
  )
  SELECT p_session_id, i.id,
         row_number() OVER (ORDER BY i.created_at, i.id)::integer,
         i.dog_id, i.class_id, cl.trial_id, i.handler_id, i.jump_height, i.special_requests,
         i.junior_fee_declared, i.entry_id, (p_line_amounts ->> i.id::text)::integer
    FROM public.entry_cart_items i
    LEFT JOIN public.classes cl ON cl.id = i.class_id
   WHERE i.cart_id = p_cart_id;

  UPDATE public.entry_carts c
     SET status = 'fulfilling'
   WHERE c.id = p_cart_id;

  RETURN QUERY SELECT 'begun'::text, 'fulfilling'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_cart_fulfillment(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_cart_fulfillment(uuid, text, text, jsonb) TO service_role;

-- ============================================================================
-- 5. ONE live refund obligation per checkout session and per payment intent
-- ============================================================================

-- Codex round 2 on #2758: the guards above are pairwise (queue vs
-- fulfillment, queue vs approval), and an abandoned-cart claim could still
-- queue a second FULL-charge request beside an unfulfilled_charge one. The
-- invariant is enforced here instead, for every kind and every ordering: a
-- session (and its payment intent) carries at most one LIVE request. Closed
-- ones (refunded, resolved_without_refund) do not count, so a request a
-- person closed never blocks a later one. Every kind is included: none of
-- them may coexist live for one charge (a cart_overflow session has an order,
-- which the abandoned and unfulfilled paths both refuse; a payment-link
-- session never reaches the cart path). Verified on live 2026-10-05 (read
-- only): no session or intent has two live requests.
--
-- How each inserting function meets it:
--   queue_unfulfilled_charge_refund  ON CONFLICT DO NOTHING (any index) and
--                                    reports 'other_request' unless the row it
--                                    finds is its own (section 2).
--   claim_abandoned_cart_refund      below: inserts FIRST, moves the cart to
--                                    refund_pending only when its own insert
--                                    landed, otherwise 'not_refundable' with
--                                    the cart untouched.
--   queue_payment_link_refund,       unchanged. A cross-kind conflict there is
--   complete_cart_fulfillment        unreachable by the locks above; if it ever
--                                    happened, the 23505 rolls back the whole
--                                    latch (nothing half-written), the webhook
--                                    answers 5xx with its unconfirmed alert,
--                                    and nothing is silently dropped.
CREATE UNIQUE INDEX refund_requests_one_live_per_session
  ON public.refund_requests (stripe_checkout_session_id)
  WHERE status NOT IN ('refunded', 'resolved_without_refund');
CREATE UNIQUE INDEX refund_requests_one_live_per_intent
  ON public.refund_requests (stripe_payment_intent_id)
  WHERE status NOT IN ('refunded', 'resolved_without_refund');

-- Copied from 20261003013900_myk9_876_874_refund_requests.sql (its only
-- definition; matches the live body, 2026-10-05). Changed: the insert comes
-- first and tolerates any unique conflict; the cart moves only after it; an
-- existing abandoned_cart request is reported only when it is this cart's;
-- any other request for the session or intent makes it 'not_refundable'.
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

  -- The row lock serialises this against the fulfillment claim, the
  -- unfulfilled-charge queue and a concurrent re-delivery of the same session.
  SELECT c.id, c.status, c.stripe_checkout_session_id, c.show_id
    INTO v_cart
    FROM public.entry_carts c
   WHERE c.id = p_cart_id
   FOR UPDATE;

  -- Ours only when it is this cart's (a deleted cart reads back NULL).
  SELECT r.id, r.status INTO v_existing, v_existing_status
    FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = p_session_id
     AND r.kind = 'abandoned_cart'
     AND (r.cart_id IS NULL OR r.cart_id = p_cart_id);
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT 'already_pending'::text, v_existing, v_existing_status;
    RETURN;
  END IF;

  IF v_cart.id IS NULL
     OR v_cart.status NOT IN ('abandoned', 'expired')
     OR v_cart.stripe_checkout_session_id IS DISTINCT FROM p_session_id
     OR EXISTS (SELECT 1 FROM public.refund_requests r
                 WHERE r.stripe_checkout_session_id = p_session_id
                    OR r.stripe_payment_intent_id = p_payment_intent_id) THEN
    RETURN QUERY SELECT 'not_refundable'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  INSERT INTO public.refund_requests (
    kind, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents,
    reason, cart_id, show_id, detail
  )
  VALUES (
    'abandoned_cart', p_session_id, p_payment_intent_id, p_amount_cents,
    'cart_' || v_cart.status, p_cart_id, v_cart.show_id, COALESCE(p_detail, '{}'::jsonb)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  -- Another live request won the index: the cart stays exactly as it was.
  IF v_id IS NULL THEN
    RETURN QUERY SELECT 'not_refundable'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  UPDATE public.entry_carts
     SET status = 'refund_pending'
   WHERE id = p_cart_id;

  RETURN QUERY SELECT 'claimed'::text, v_id, 'pending'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_abandoned_cart_refund(uuid, text, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_abandoned_cart_refund(uuid, text, text, integer, jsonb)
  TO service_role;

COMMIT;
