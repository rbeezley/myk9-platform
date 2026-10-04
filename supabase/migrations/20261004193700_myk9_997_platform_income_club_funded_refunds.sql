-- MYK9-997: platform income counts the service fee the platform keeps, and
-- subtracts only the refunds the platform itself funded.
--
-- Owner decision (2026-10-04, option (a) on MYK9-997):
--
-- 1. CLUB-FUNDED REFUNDS. A show-cancellation refund (stripe-refund-show) and a
--    secretary's per-entry refund (stripe-refund-entry) return entry fees that
--    come out of the CLUB's payout: each stamps entries.refund_amount, the
--    payout cron deducts it, and both functions refuse once the show's payout
--    is processing or completed. They were booked as plain `post_hoc` and
--    `derivePlatformIncome` subtracted them from platform net income as if the
--    platform had absorbed them.
--
--    Both functions now stamp `myk9_club_funded: 'true'` on the Stripe refund
--    (orderSnapshot.ts CLUB_FUNDED_METADATA_KEY), the webhook passes it to
--    record_order_refund_cents, and the ledger row carries it as
--    `club_funded`. The recompute derives
--      stripe_orders.club_funded_refunded_cents
--        = SUM(amount) WHERE kind = 'post_hoc' AND club_funded AND succeeded
--    a SUBSET of refunded_cents. refunded_cents keeps its meaning (every
--    post-hoc refund) so every reader of it (collected, net-to-club, receipts,
--    My Payments) is unchanged. Platform income subtracts
--      refunded_cents - club_funded_refunded_cents
--    the refunds the platform actually funded (a Stripe dashboard refund, or
--    any refund nothing marked club-funded).
--
--    `club_funded` is an immutable refund fact, like `kind`: the booking
--    upsert never overwrites it. Stripe carries the metadata on every
--    delivery of the refund, so every delivery agrees.
--
-- 2. THE KEPT FEE ON A CHARGE WITH NO ORDER. A paid abandoned cart (MYK9-874)
--    and a paid payment-link session with no link row have no stripe_orders
--    row, so the service fee the platform keeps on them (MYK9-966: the refund
--    is the entry fees only) never reached income reporting. The refund
--    request now records what Stripe charged, `charged_cents`, and the kept
--    fee is charged_cents - amount_cents. The webhook passes it as
--    `charged_cents` in the p_detail both claim_abandoned_cart_refund and
--    queue_payment_link_refund already take; each lifts it into the typed,
--    CHECKed column (refund_request_charged_cents) and out of `detail`. Their
--    signatures are unchanged, so no caller, ACL or overload moves.
--
--    financial_reconciliation_summary books it in scope as
--    unfulfilled_charge_kept_fee_cents (with a count), for every request that
--    has a charged amount and NO stripe_orders row for its session or intent
--    (an order, if one ever appears, already books the full fee on its own
--    snapshot). The kept fee is the charge less the refunds that actually went
--    out on the intent, with the obligation standing in only until its
--    approved refund is issued (see scoped_unfulfilled below).
--
--    Stripe's processing fee on those charges is never captured (there is no
--    order to hold it), so the client reports the kept fee in the labeled
--    pending residual, never in the available net (financialSummary.ts).
--
-- Live survey (2026-10-04, read-only): stripe_order_refunds and stripe_orders
-- are empty, and the one refund request (be225d32, test mode, 2026-10-03)
-- refunded the whole 3210 charge before MYK9-966. Nothing to backfill: its
-- charged amount was never recorded, so it stays NULL and books nothing.
--
-- DEPLOY ORDER: push this migration BEFORE deploying stripe-webhook,
-- stripe-refund-entry and stripe-refund-show. The one new parameter
-- (record_order_refund_cents.p_club_funded) is a trailing DEFAULT, so the
-- deployed functions' calls stay valid in between (they book nothing
-- club-funded and no kept fee until redeployed).
--
-- Each replaced function is copied from its LATEST definition:
--   recompute_order_refund_totals, record_order_refund_cents
--     20260717122000_stripe_order_snapshots.sql
--   claim_abandoned_cart_refund (same signature)
--     20261003013900_myk9_876_874_refund_requests.sql
--   queue_payment_link_refund (same signature)
--     20261004174300_myk9_968_payment_link_offer_resolves_atomically.sql
--   financial_reconciliation_summary
--     20260717130000_financial_reconciliation_rpc.sql (grants restated from
--     20260728120000_advisor_grant_regrowth_guard.sql)
-- A changed signature or return type (record_order_refund_cents,
-- financial_reconciliation_summary) is DROPped first, old and new signatures,
-- so the file re-runs: CREATE OR REPLACE cannot change a return type, and an
-- added parameter would leave an overload that makes every named-argument
-- call ambiguous. Grants are restated exactly.
--
-- Behavioral coverage (runs in CI only):
-- supabase/tests/myk9_997_platform_income_club_funded_refunds_test.sql

BEGIN;

-- ============================================================================
-- 1. Club-funded refunds
-- ============================================================================

ALTER TABLE public.stripe_order_refunds
  ADD COLUMN IF NOT EXISTS club_funded boolean NOT NULL DEFAULT false;

-- Only a post-hoc refund can be club-funded: a make-whole refund returns lines
-- that never became paid entries, so there is no club payout to come out of.
ALTER TABLE public.stripe_order_refunds
  DROP CONSTRAINT IF EXISTS stripe_order_refunds_club_funded_post_hoc;
ALTER TABLE public.stripe_order_refunds
  ADD CONSTRAINT stripe_order_refunds_club_funded_post_hoc
  CHECK (NOT club_funded OR kind = 'post_hoc');

-- DERIVED CACHE, like refunded_cents: recomputed from the ledger, never
-- incremented. A subset of refunded_cents.
ALTER TABLE public.stripe_orders
  ADD COLUMN IF NOT EXISTS club_funded_refunded_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.stripe_orders
  DROP CONSTRAINT IF EXISTS stripe_orders_club_funded_refunded_cents_check;
ALTER TABLE public.stripe_orders
  ADD CONSTRAINT stripe_orders_club_funded_refunded_cents_check
  CHECK (club_funded_refunded_cents >= 0 AND club_funded_refunded_cents <= refunded_cents);

-- Same signature and return type, so CREATE OR REPLACE keeps the ACL. Adds
-- the club-funded sum; everything else is unchanged.
CREATE OR REPLACE FUNCTION public.recompute_order_refund_totals(p_payment_intent_id text)
RETURNS TABLE (
  order_id uuid,
  order_type text,
  order_status text,
  order_amount_cents integer,
  make_whole_cents integer,
  post_hoc_cents integer,
  fully_refunded boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row record;
  v_full boolean;
  v_status text;
BEGIN
  FOR v_row IN
    SELECT o.id AS oid,
           o.order_type AS otype,
           o.status AS ostatus,
           o.amount_cents AS oamount,
           COALESCE(SUM(f.amount_cents)
             FILTER (WHERE f.kind = 'make_whole' AND f.state = 'succeeded'), 0)::integer AS mw,
           COALESCE(SUM(f.amount_cents)
             FILTER (WHERE f.kind = 'post_hoc' AND f.state = 'succeeded'), 0)::integer AS ph,
           -- MYK9-997: the post-hoc refunds the CLUB funded (its payout is
           -- docked), a subset of ph. Platform income subtracts ph - cf.
           COALESCE(SUM(f.amount_cents)
             FILTER (WHERE f.kind = 'post_hoc' AND f.club_funded
                       AND f.state = 'succeeded'), 0)::integer AS cf
      FROM public.stripe_orders AS o
      JOIN public.stripe_order_refunds AS f ON f.order_id = o.id
     WHERE o.stripe_payment_intent_id = p_payment_intent_id
     GROUP BY o.id, o.order_type, o.status, o.amount_cents
     ORDER BY o.id
  LOOP
    v_full := COALESCE(v_row.oamount, 0) > 0 AND (v_row.mw + v_row.ph) >= v_row.oamount;
    v_status := CASE
                  WHEN v_full AND v_row.ostatus = 'succeeded' THEN 'refunded'
                  WHEN NOT v_full AND v_row.ostatus = 'refunded' THEN 'succeeded'
                  ELSE v_row.ostatus
                END;

    UPDATE public.stripe_orders AS o
       SET make_whole_refunded_cents = v_row.mw,
           refunded_cents = v_row.ph,
           club_funded_refunded_cents = v_row.cf,
           status = v_status,
           -- refunded_at follows the DERIVED STATUS, not v_full alone. A local
           -- pending/processing order keeps that status and must not receive a
           -- timestamp that claims it is refunded.
           refunded_at = CASE
             WHEN v_status = 'refunded' THEN COALESCE(o.refunded_at, now())
             ELSE NULL
           END
     WHERE o.id = v_row.oid;

    order_id := v_row.oid;
    order_type := v_row.otype;
    order_status := v_status;
    order_amount_cents := v_row.oamount;
    make_whole_cents := v_row.mw;
    post_hoc_cents := v_row.ph;
    fully_refunded := v_full;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_order_refund_totals(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_order_refund_totals(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_order_refund_totals(text) TO service_role;

-- record_order_refund_cents gains a trailing p_club_funded. Callers: the
-- stripe-webhook booking paths (club-funded from the refund's metadata) and
-- refundSettlement.ts (make-whole, never club-funded).
DROP FUNCTION IF EXISTS public.record_order_refund_cents(text, text, integer, text);
DROP FUNCTION IF EXISTS public.record_order_refund_cents(text, text, integer, text, boolean);

CREATE FUNCTION public.record_order_refund_cents(
  p_payment_intent_id text,
  p_refund_id text,
  p_amount_cents integer,
  p_kind text DEFAULT 'post_hoc',
  p_club_funded boolean DEFAULT false
)
RETURNS TABLE (
  order_id uuid,
  order_type text,
  order_status text,
  order_amount_cents integer,
  make_whole_cents integer,
  post_hoc_cents integer,
  fully_refunded boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amount integer := GREATEST(COALESCE(p_amount_cents, 0), 0);
  v_kind text := CASE WHEN p_kind = 'make_whole' THEN 'make_whole' ELSE 'post_hoc' END;
  -- Only a post-hoc refund can be club-funded (the table CHECK agrees).
  v_club_funded boolean := COALESCE(p_club_funded, false)
                           AND p_kind IS DISTINCT FROM 'make_whole';
  v_target uuid;
BEGIN
  IF p_payment_intent_id IS NULL OR p_refund_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_payment_intent_id, 0)
  );

  -- Lock every order on the intent for the rest of the transaction.
  PERFORM 1
     FROM public.stripe_orders AS o
    WHERE o.stripe_payment_intent_id = p_payment_intent_id
      FOR UPDATE;

  -- `stripe_orders.stripe_payment_intent_id` is UNIQUE, so an intent matches at
  -- most one order. Do not add an ORDER BY/LIMIT tie-break that implies a
  -- multi-order state the schema forbids.
  SELECT o.id INTO v_target
    FROM public.stripe_orders AS o
   WHERE o.stripe_payment_intent_id = p_payment_intent_id;

  INSERT INTO public.stripe_order_refunds AS r
    (stripe_refund_id, stripe_payment_intent_id, order_id, amount_cents, kind, state,
     club_funded)
  VALUES (p_refund_id, p_payment_intent_id, v_target, v_amount, v_kind, 'succeeded',
          v_club_funded)
  ON CONFLICT (stripe_refund_id) DO UPDATE
     SET -- Late-attach an order that did not exist on the first delivery, but
         -- only through the same immutable payment intent and never re-point a
         -- row that already found its order.
         order_id = CASE
           WHEN r.stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id
             THEN COALESCE(r.order_id, EXCLUDED.order_id)
           ELSE r.order_id
         END,
         -- intent, amount, kind, state and club_funded are deliberately ABSENT:
         -- Stripe refund facts are immutable audit history, not redelivery
         -- inputs.
         updated_at = now();

  RETURN QUERY
    SELECT t.order_id, t.order_type, t.order_status, t.order_amount_cents,
           t.make_whole_cents, t.post_hoc_cents, t.fully_refunded
      FROM public.recompute_order_refund_totals(p_payment_intent_id) AS t;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_refund_cents(text, text, integer, text, boolean)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_order_refund_cents(text, text, integer, text, boolean)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_refund_cents(text, text, integer, text, boolean)
  TO service_role;

-- ============================================================================
-- 2. The kept fee on a charge with no order
-- ============================================================================

-- What Stripe charged for the session. NULL = not recorded (requests written
-- before MYK9-997); such a request books no kept fee.
ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS charged_cents integer;
ALTER TABLE public.refund_requests
  DROP CONSTRAINT IF EXISTS refund_requests_charged_covers_refund;
ALTER TABLE public.refund_requests
  ADD CONSTRAINT refund_requests_charged_covers_refund
  CHECK (charged_cents IS NULL OR charged_cents >= amount_cents);

COMMENT ON COLUMN public.refund_requests.charged_cents IS
  'MYK9-997: what Stripe charged for the session; charged_cents - amount_cents is the service fee the platform keeps (MYK9-966). NULL = not recorded.';

-- What a refund request's p_detail says Stripe charged (MYK9-997). Absent =
-- not recorded (NULL). Present, it must be a whole number of cents: anything
-- else is refused rather than guessed, like every other malformed input.
CREATE OR REPLACE FUNCTION public.refund_request_charged_cents(p_detail jsonb)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_raw jsonb := p_detail -> 'charged_cents';
BEGIN
  IF v_raw IS NULL OR jsonb_typeof(v_raw) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v_raw) <> 'number' OR (v_raw #>> '{}')::numeric <> trunc((v_raw #>> '{}')::numeric) THEN
    RAISE EXCEPTION 'refund request: charged_cents must be a whole number of cents'
      USING errcode = '22023';
  END IF;
  RETURN (v_raw #>> '{}')::integer;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_request_charged_cents(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_request_charged_cents(jsonb) TO service_role;

-- Copied from 20261003013900 (the latest definition). Same signature, so
-- CREATE OR REPLACE keeps the ACL; the only change is p_detail.charged_cents
-- lifted into the column (and out of detail).
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
  v_charged integer := public.refund_request_charged_cents(p_detail);
BEGIN
  IF p_cart_id IS NULL OR p_session_id IS NULL OR p_payment_intent_id IS NULL
     OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'claim_abandoned_cart_refund: cart, session, intent and a positive amount are required'
      USING errcode = '22023';
  END IF;
  IF v_charged < p_amount_cents THEN
    RAISE EXCEPTION 'claim_abandoned_cart_refund: the charge cannot be less than the refund'
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
    reason, cart_id, show_id, detail, charged_cents
  )
  VALUES (
    'abandoned_cart', p_session_id, p_payment_intent_id, p_amount_cents,
    'cart_' || v_cart.status, p_cart_id, v_cart.show_id,
    COALESCE(p_detail, '{}'::jsonb) - 'charged_cents',
    v_charged
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT 'claimed'::text, v_id, 'pending'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_abandoned_cart_refund(uuid, text, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_abandoned_cart_refund(uuid, text, text, integer, jsonb)
  TO service_role;

-- Copied from 20261004174300 (the latest definition). Same signature, so
-- CREATE OR REPLACE keeps the ACL; the only change is p_detail.charged_cents
-- lifted into the column (and out of detail).
-- MYK9-876 (Codex rounds 13-14 on #2689): the payment-link refund obligation
-- and order, ATOMIC with the link's fulfillment latch. In ONE transaction:
--   * with p_link_id and p_close_from, the link moves p_close_from -> 'paid'
--     (the webhook's idempotency latch for this session);
--   * with p_order, the session's stripe_orders row is inserted from the
--     webhook's column values (ON CONFLICT DO NOTHING: an order that already
--     exists stays as it is), so a closed latch always has its order;
--   * with p_amount_cents, the entry_payment_link refund request is inserted,
--     idempotent on (session, kind), with p_detail.charged_cents (MYK9-997)
--     when the session has no order to book its kept fee;
--   * with p_paid_entry_ids (MYK9-968), the waitlist offers promoted into
--     those entries move offered/expired -> 'accepted';
-- and it returns the link's status and the session's request, if any. With
-- none of them it only READS, which a redelivery uses to find the request. So a
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
  p_order jsonb DEFAULT NULL,
  p_paid_entry_ids uuid[] DEFAULT NULL
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
  v_charged integer := public.refund_request_charged_cents(p_detail);
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
  IF v_charged IS NOT NULL
     AND (p_amount_cents IS NULL OR v_charged < p_amount_cents) THEN
    RAISE EXCEPTION 'queue_payment_link_refund: a charge needs a refund it covers'
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

  -- MYK9-968: the paid entries' waitlist offers resolve with the latch, the
  -- same transition the webhook's separate write made. Only open offers
  -- change, so a repeat is a no-op.
  IF cardinality(p_paid_entry_ids) > 0 THEN
    UPDATE public.waitlist_entries w
       SET status = 'accepted',
           updated_at = now()
     WHERE w.promoted_entry_id = ANY (p_paid_entry_ids)
       AND w.status IN ('offered', 'expired');
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
      reason, entry_payment_link_id, show_id, detail, charged_cents
    )
    VALUES (
      'entry_payment_link', p_session_id, p_payment_intent_id, p_amount_cents, p_reason,
      (SELECT l.id FROM public.entry_payment_links l WHERE l.id = p_link_id),
      (SELECT sh.id FROM public.shows sh WHERE sh.id = p_show_id),
      (COALESCE(p_detail, '{}'::jsonb) - 'charged_cents')
        || jsonb_strip_nulls(jsonb_build_object(
             'entry_payment_link_id', p_link_id,
             'show_id', p_show_id)),
      v_charged
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

REVOKE ALL ON FUNCTION public.queue_payment_link_refund(text, uuid, text, text, integer, text, jsonb, uuid, jsonb, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_payment_link_refund(text, uuid, text, text, integer, text, jsonb, uuid, jsonb, uuid[])
  TO service_role;

-- ============================================================================
-- 3. The reconciliation summary
-- ============================================================================

-- Copied from 20260717130000 (the latest definition) with four columns
-- APPENDED, so every existing column keeps its position and meaning:
--   club_funded_refunded_cents              entry orders' club-funded share
--                                           of refunded_cents
--   pending_fee_club_funded_refunded_cents  the same, on the orders whose
--                                           processing fee is not captured
--   unfulfilled_charge_kept_fee_cents       the service fee kept on charges
--                                           with no order (section 2)
--   unfulfilled_charge_count                how many such charges
-- A changed return type needs the DROP; grants restated from
-- 20260728120000_advisor_grant_regrowth_guard.sql.
DROP FUNCTION IF EXISTS public.financial_reconciliation_summary(text, uuid, uuid);

CREATE FUNCTION public.financial_reconciliation_summary(
  p_scope   text,
  p_club_id uuid DEFAULT NULL,
  p_show_id uuid DEFAULT NULL
)
RETURNS TABLE (
  -- Charge verification side (stripe_orders, ENTRY orders only)
  order_count                  bigint,
  gross_charged_cents          bigint,
  entry_subtotal_cents         bigint,
  platform_fee_cents           bigint,
  processing_fee_cents         bigint,  -- SUM of CAPTURED fees only (NULLs excluded)
  processing_fee_pending_count bigint,  -- orders whose fee is not yet captured (pending, not zero)
  -- PENDING-FEE RESIDUAL inputs: the entry totals restricted to the orders whose
  -- processing fee is NOT captured (see 20260717130000 for the derivation).
  pending_fee_platform_fee_cents bigint,
  pending_fee_refunded_cents     bigint,
  refunded_cents               bigint,  -- every POST-HOC refund (club- and platform-funded)
  make_whole_refunded_cents    bigint,  -- cart-overflow make-whole: returned, but NOT a platform loss
  snapshot_missing_count       bigint,  -- legacy ENTRY orders missing EITHER snapshot column
  non_entry_order_count        bigint,
  non_entry_gross_cents        bigint,
  non_entry_refunded_cents     bigint,
  non_entry_make_whole_refunded_cents bigint,
  -- Payout settlement side (show_payouts) — kept independent of charge facts
  payout_count                 bigint,
  payout_completed_cents       bigint,
  payout_pending_cents         bigint,
  payout_failed_cents          bigint,
  payout_failed_count          bigint,
  -- MYK9-997 (appended)
  club_funded_refunded_cents             bigint,
  pending_fee_club_funded_refunded_cents bigint,
  unfulfilled_charge_kept_fee_cents      bigint,
  unfulfilled_charge_count               bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  PERFORM public._financial_reconciliation_authorize(p_scope, p_club_id, p_show_id);

  RETURN QUERY
  WITH scoped_charges AS (
    SELECT o.order_type,
           o.amount_cents,
           o.entry_subtotal_cents,
           o.platform_fee_cents,
           o.stripe_processing_fee_cents,
           o.refunded_cents,
           o.make_whole_refunded_cents,
           o.club_funded_refunded_cents
    FROM public.stripe_orders o
    WHERE (
        o.status IN ('succeeded', 'refunded')
        OR o.refunded_cents > 0
        OR o.make_whole_refunded_cents > 0
      )
      AND (
        p_scope = 'platform'
        OR (p_scope = 'show' AND o.show_id = p_show_id)
        OR (p_scope = 'club' AND o.show_id IN (
              SELECT s.id FROM public.shows s WHERE s.club_id = p_club_id))
      )
  ),
  -- Entry accounting covers ENTRY orders only (see ORDER-TYPE SCOPING in
  -- 20260717130000).
  scoped_orders AS (
    SELECT * FROM scoped_charges WHERE order_type = 'entry'
  ),
  scoped_non_entry AS (
    SELECT * FROM scoped_charges WHERE order_type IS DISTINCT FROM 'entry'
  ),
  -- SUPERSEDED FAILED PAYOUTS: see 20260717130000. A failed row is
  -- outstanding only when its show has no live payout row and it is the
  -- show's latest failed attempt.
  scoped_payouts AS (
    SELECT sp.amount_cents,
           sp.status,
           EXISTS (
             SELECT 1 FROM public.show_payouts live
             WHERE live.show_id = sp.show_id
               AND live.status <> 'failed'
           ) AS has_live_payout,
           NOT EXISTS (
             SELECT 1 FROM public.show_payouts newer
             WHERE newer.show_id = sp.show_id
               AND newer.status = 'failed'
               AND (newer.created_at, newer.id) > (sp.created_at, sp.id)
           ) AS is_latest_failed
    FROM public.show_payouts sp
    WHERE (
        p_scope = 'platform'
        OR (p_scope = 'show' AND sp.show_id = p_show_id)
        OR (p_scope = 'club' AND sp.show_id IN (
              SELECT s.id FROM public.shows s WHERE s.club_id = p_club_id))
      )
  ),
  -- MYK9-997: charges the platform kept a service fee on but recorded NO
  -- order for (a paid abandoned cart, a paid payment link with no link row).
  -- A request whose session or intent DOES have an order is excluded: that
  -- order's own platform_fee_cents already books the fee. Scoped through the
  -- request's show like every other figure here; a request with no show is
  -- platform-scope only.
  --
  -- WHAT WAS KEPT is measured from the refunds that actually went out on the
  -- request's payment intent, never from the obligation alone (Codex round 1
  -- on #2741: an approved refund topped up by a dashboard refund of the rest
  -- kept nothing, yet charged − obligation still booked the fee). An
  -- order-less charge's refunds land in two places:
  --   * the APPROVED refund: refund_request_attempts (status 'succeeded'). It
  --     is never booked in stripe_order_refunds (routeRefundByCurrentState
  --     stops order-less approved refunds as 'no_order'), and Stripe issued it
  --     for exactly the request's amount_cents (refundApproval.ts);
  --   * ANY OTHER refund on the intent (a dashboard refund): the charge.refunded
  --     / refund.updated sweep books it in stripe_order_refunds with a NULL
  --     order_id, keyed on the intent.
  --   kept = charged − amount_cents − (the ledger's other succeeded refunds
  --          on the intent, excluding the attempts' own refund ids)
  --
  -- amount_cents counts exactly ONCE, in either of two states:
  --   * issued: an attempt succeeded, and its refund was for amount_cents;
  --   * not yet issued: the obligation still stands. It is owed back to the
  --     customer (pending, awaiting Stripe, failed) or, resolved without
  --     refund, honored by hand to the club. Either way it is not the
  --     platform's to keep, and counting it keeps a pending request from
  --     reporting the whole charge as kept.
  -- Floored at 0: the obligation can never take more than is still on the
  -- charge (Stripe refuses a refund past it), so a dashboard refund of the
  -- whole charge leaves nothing kept, not a negative.
  scoped_unfulfilled AS (
    SELECT GREATEST(
             r.charged_cents - r.amount_cents - COALESCE(other.refunded_cents, 0),
             0
           ) AS kept_fee_cents
    FROM public.refund_requests r
    LEFT JOIN LATERAL (
      SELECT SUM(f.amount_cents) AS refunded_cents
      FROM public.stripe_order_refunds f
      WHERE f.stripe_payment_intent_id = r.stripe_payment_intent_id
        AND f.state = 'succeeded'
        AND NOT EXISTS (
          SELECT 1 FROM public.refund_request_attempts a
          WHERE a.request_id = r.id AND a.stripe_refund_id = f.stripe_refund_id
        )
    ) AS other ON true
    WHERE r.charged_cents IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.stripe_orders o
        WHERE o.stripe_checkout_session_id = r.stripe_checkout_session_id
           OR o.stripe_payment_intent_id = r.stripe_payment_intent_id
      )
      AND (
        p_scope = 'platform'
        OR (p_scope = 'show' AND r.show_id = p_show_id)
        OR (p_scope = 'club' AND r.show_id IN (
              SELECT s.id FROM public.shows s WHERE s.club_id = p_club_id))
      )
  )
  -- EVERY column reference below is qualified with a CTE alias: the RETURNS
  -- TABLE output columns are PL/pgSQL variables, and an unqualified reference
  -- raises "column reference ... is ambiguous" at RUNTIME.
  SELECT
    (SELECT count(*)                                            FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.amount_cents), 0)                   FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.entry_subtotal_cents), 0)           FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.platform_fee_cents), 0)             FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.stripe_processing_fee_cents), 0)    FROM scoped_orders so),
    (SELECT count(*) FROM scoped_orders so WHERE so.stripe_processing_fee_cents IS NULL),
    (SELECT COALESCE(SUM(so.platform_fee_cents), 0) FROM scoped_orders so
      WHERE so.stripe_processing_fee_cents IS NULL),
    (SELECT COALESCE(SUM(so.refunded_cents), 0)     FROM scoped_orders so
      WHERE so.stripe_processing_fee_cents IS NULL),
    (SELECT COALESCE(SUM(so.refunded_cents), 0)                 FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.make_whole_refunded_cents), 0)      FROM scoped_orders so),
    (SELECT count(*) FROM scoped_orders so
      WHERE so.platform_fee_cents IS NULL OR so.entry_subtotal_cents IS NULL),
    (SELECT count(*)                                            FROM scoped_non_entry ne),
    (SELECT COALESCE(SUM(ne.amount_cents), 0)                   FROM scoped_non_entry ne),
    (SELECT COALESCE(SUM(ne.refunded_cents), 0)                 FROM scoped_non_entry ne),
    (SELECT COALESCE(SUM(ne.make_whole_refunded_cents), 0)      FROM scoped_non_entry ne),
    (SELECT count(*)                                            FROM scoped_payouts sp),
    (SELECT COALESCE(SUM(sp.amount_cents), 0) FROM scoped_payouts sp WHERE sp.status = 'completed'),
    (SELECT COALESCE(SUM(sp.amount_cents), 0) FROM scoped_payouts sp WHERE sp.status IN ('pending', 'processing')),
    (SELECT COALESCE(SUM(sp.amount_cents), 0) FROM scoped_payouts sp
      WHERE sp.status = 'failed' AND NOT sp.has_live_payout AND sp.is_latest_failed),
    (SELECT count(*) FROM scoped_payouts sp
      WHERE sp.status = 'failed' AND NOT sp.has_live_payout AND sp.is_latest_failed),
    -- MYK9-997: the club-funded share of the post-hoc refunds above, overall
    -- and on the not-yet-captured orders. Net income subtracts only the rest.
    (SELECT COALESCE(SUM(so.club_funded_refunded_cents), 0)     FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.club_funded_refunded_cents), 0)     FROM scoped_orders so
      WHERE so.stripe_processing_fee_cents IS NULL),
    -- ::bigint: kept_fee_cents is bigint (it subtracts a SUM), and SUM(bigint)
    -- is numeric, which RETURNS TABLE refuses at call time.
    (SELECT COALESCE(SUM(uf.kept_fee_cents), 0)::bigint         FROM scoped_unfulfilled uf),
    (SELECT count(*)                                            FROM scoped_unfulfilled uf);
END;
$$;

REVOKE ALL ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid)
  TO authenticated, service_role;

COMMIT;
