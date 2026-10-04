-- MYK9-997: platform income subtracts only the refunds the platform itself
-- funded; club-funded refunds come out of the club's payout.
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
-- 2. A CHARGE THE EXHIBITOR GOT NOTHING FOR is refunded in full (owner rule,
--    2026-10-04): a paid abandoned cart and a paid payment-link session with
--    no link row queue a refund request for the whole amount charged, service
--    fee included, and the platform absorbs Stripe's processing fee. That is
--    an edge-function change only (refundRequests.ts fullChargeRefundCents);
--    nothing in this migration books a kept fee for those charges, because
--    nothing is kept. Their absorbed Stripe processing fee is NOT reported:
--    with no order there is no balance transaction captured to report.
--
-- Live survey (2026-10-04, read-only): stripe_order_refunds and stripe_orders
-- are empty, and the one refund request (be225d32, test mode, 2026-10-03)
-- refunded the whole 3210 charge, which is what the rule now asks for.
-- Nothing to backfill.
--
-- DEPLOY ORDER: push this migration BEFORE deploying stripe-webhook,
-- stripe-refund-entry and stripe-refund-show. The one new parameter
-- (record_order_refund_cents.p_club_funded) is a trailing DEFAULT, so the
-- deployed functions' calls stay valid in between (they book nothing
-- club-funded until redeployed).
--
-- Each replaced function is copied from its LATEST definition:
--   recompute_order_refund_totals, record_order_refund_cents
--     20260717122000_stripe_order_snapshots.sql
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
-- 2. The reconciliation summary
-- ============================================================================

-- Copied from 20260717130000 (the latest definition) with two columns
-- APPENDED, so every existing column keeps its position and meaning:
--   club_funded_refunded_cents              entry orders' club-funded share
--                                           of refunded_cents
--   pending_fee_club_funded_refunded_cents  the same, on the orders whose
--                                           processing fee is not captured
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
  pending_fee_club_funded_refunded_cents bigint
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
      WHERE so.stripe_processing_fee_cents IS NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid)
  TO authenticated, service_role;

COMMIT;
