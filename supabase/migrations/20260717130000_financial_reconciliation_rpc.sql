-- Scoped, PII-free financial reconciliation RPCs (financial-reconciliation,
-- MYK9-54, task 1.6).
--
-- The client must NEVER read stripe_orders directly to build a cross-scope
-- financial view: that table's RLS only exposes a caller's OWN orders (or, for
-- a platform admin, all of them), and PostgREST caps a single response at the
-- configured row limit — so a client-side SUM over "all rows" can silently
-- UNDERSTATE totals for a large club or the whole platform. Instead these
-- SECURITY DEFINER functions:
--
--   1. Authorize the requested scope ON THE SERVER (platform => is_site_admin();
--      club => is_club_admin(club_id); show => can_manage_show(show_id)) and
--      RAISE for an unauthorized caller — an unauthorized request is an explicit
--      error, never a silent empty result that could be mistaken for "$0".
--   2. Aggregate totals in SQL (SUM/count in the function body) so the row cap
--      can never truncate a total.
--   3. Return ONLY reconciliation fields — amounts, statuses, scope ids, and the
--      Stripe payment-intent / transfer ids needed to match against Stripe.
--      They expose NO customer-identifying PII (the reconciliation-no-PII
--      source test enforces the exact excluded column list).
--   4. Keep CHARGE verification (stripe_orders) SEPARATE from PAYOUT settlement
--      (show_payouts). A pending processing fee (NULL) surfaces as a pending
--      COUNT, never folded into the captured-fee SUM as a zero.
--
-- Pattern mirrors resolve_operator_alert (20260709130000): SECURITY DEFINER,
-- SET search_path = '', REVOKE ALL FROM PUBLIC, GRANT EXECUTE TO authenticated.
--
-- Detail-row functions use keyset pagination on the stable (created_at, id)
-- ordering so a caller can page to completion without shifting rows.
--
-- New migration only; rollback = a follow-up migration that DROPs these
-- functions. No table or column is changed here.

-- -----------------------------------------------------------------------------
-- 0. Shared scope authorization. Internal to the reconciliation functions
--    below (which run as SECURITY DEFINER); not granted to authenticated.
--    RAISEs 42501 for an unauthorized caller so no scope ever returns rows
--    without a server-side permission check.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._financial_reconciliation_authorize(
  p_scope   text,
  p_club_id uuid,
  p_show_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_scope = 'platform' THEN
    IF NOT (SELECT public.is_site_admin()) THEN
      RAISE EXCEPTION 'Not authorized for platform financial scope'
        USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope = 'club' THEN
    IF p_club_id IS NULL THEN
      RAISE EXCEPTION 'club financial scope requires a club id'
        USING ERRCODE = '22004';
    END IF;
    IF NOT (SELECT public.is_club_admin(p_club_id)) THEN
      RAISE EXCEPTION 'Not authorized for this club financial scope'
        USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope = 'show' THEN
    IF p_show_id IS NULL THEN
      RAISE EXCEPTION 'show financial scope requires a show id'
        USING ERRCODE = '22004';
    END IF;
    IF NOT (SELECT public.can_manage_show(p_show_id)) THEN
      RAISE EXCEPTION 'Not authorized for this show financial scope'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown financial scope: %', p_scope
      USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._financial_reconciliation_authorize(text, uuid, uuid) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 1. Summary: server-side aggregated totals for the authorized scope.
--    Charge facts (stripe_orders) and payout settlement (show_payouts) are
--    reported as SEPARATE totals — never conflated into one number. All SUM/
--    count happen in SQL so the PostgREST row cap cannot understate them.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financial_reconciliation_summary(
  p_scope   text,
  p_club_id uuid DEFAULT NULL,
  p_show_id uuid DEFAULT NULL
)
RETURNS TABLE (
  -- Charge verification side (stripe_orders)
  order_count                  bigint,
  gross_charged_cents          bigint,
  entry_subtotal_cents         bigint,
  platform_fee_cents           bigint,
  processing_fee_cents         bigint,  -- SUM of CAPTURED fees only (NULLs excluded)
  processing_fee_pending_count bigint,  -- orders whose fee is not yet captured (pending, not zero)
  refunded_cents               bigint,
  snapshot_missing_count       bigint,  -- legacy orders with no platform-fee snapshot
  -- Payout settlement side (show_payouts) — kept independent of charge facts
  payout_count                 bigint,
  payout_completed_cents       bigint,
  payout_pending_cents         bigint,
  payout_failed_count          bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  PERFORM public._financial_reconciliation_authorize(p_scope, p_club_id, p_show_id);

  RETURN QUERY
  WITH scoped_orders AS (
    SELECT o.amount_cents,
           o.entry_subtotal_cents,
           o.platform_fee_cents,
           o.stripe_processing_fee_cents,
           o.refunded_cents
    FROM public.stripe_orders o
    WHERE o.status IN ('succeeded', 'refunded')
      AND (
        p_scope = 'platform'
        OR (p_scope = 'show' AND o.show_id = p_show_id)
        OR (p_scope = 'club' AND o.show_id IN (
              SELECT s.id FROM public.shows s WHERE s.club_id = p_club_id))
      )
  ),
  scoped_payouts AS (
    SELECT sp.amount_cents, sp.status
    FROM public.show_payouts sp
    WHERE (
        p_scope = 'platform'
        OR (p_scope = 'show' AND sp.show_id = p_show_id)
        OR (p_scope = 'club' AND sp.show_id IN (
              SELECT s.id FROM public.shows s WHERE s.club_id = p_club_id))
      )
  )
  SELECT
    (SELECT count(*)                                        FROM scoped_orders),
    (SELECT COALESCE(SUM(amount_cents), 0)                  FROM scoped_orders),
    (SELECT COALESCE(SUM(entry_subtotal_cents), 0)          FROM scoped_orders),
    (SELECT COALESCE(SUM(platform_fee_cents), 0)            FROM scoped_orders),
    -- NULL processing fees are pending, NOT zero: SUM ignores them here and the
    -- pending COUNT below surfaces them so net income can be labeled pending.
    (SELECT COALESCE(SUM(stripe_processing_fee_cents), 0)   FROM scoped_orders),
    (SELECT count(*) FROM scoped_orders WHERE stripe_processing_fee_cents IS NULL),
    (SELECT COALESCE(SUM(refunded_cents), 0)                FROM scoped_orders),
    (SELECT count(*) FROM scoped_orders WHERE platform_fee_cents IS NULL),
    (SELECT count(*)                                        FROM scoped_payouts),
    (SELECT COALESCE(SUM(amount_cents), 0) FROM scoped_payouts WHERE status = 'completed'),
    (SELECT COALESCE(SUM(amount_cents), 0) FROM scoped_payouts WHERE status IN ('pending', 'processing')),
    (SELECT count(*) FROM scoped_payouts WHERE status = 'failed');
END;
$$;

REVOKE ALL ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Order detail rows — PII-free charge facts, keyset-paginated to completion.
--    Returns amounts, statuses, and the Stripe payment-intent id (needed to
--    match a charge in Stripe) but no customer-identifying columns.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financial_reconciliation_orders(
  p_scope            text,
  p_club_id          uuid        DEFAULT NULL,
  p_show_id          uuid        DEFAULT NULL,
  p_limit            integer     DEFAULT 200,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id         uuid        DEFAULT NULL
)
RETURNS TABLE (
  order_id                    uuid,
  show_id                     uuid,
  status                      text,
  order_type                  text,
  amount_cents                integer,
  entry_subtotal_cents        integer,
  platform_fee_cents          integer,
  platform_fee_rate           numeric,
  stripe_processing_fee_cents integer,
  refunded_cents              integer,
  stripe_payment_intent_id    text,
  created_at                  timestamptz,
  paid_at                     timestamptz,
  refunded_at                 timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
BEGIN
  PERFORM public._financial_reconciliation_authorize(p_scope, p_club_id, p_show_id);

  RETURN QUERY
  SELECT o.id, o.show_id, o.status, o.order_type, o.amount_cents,
         o.entry_subtotal_cents, o.platform_fee_cents, o.platform_fee_rate,
         o.stripe_processing_fee_cents, o.refunded_cents, o.stripe_payment_intent_id,
         o.created_at, o.paid_at, o.refunded_at
  FROM public.stripe_orders o
  WHERE (
      p_scope = 'platform'
      OR (p_scope = 'show' AND o.show_id = p_show_id)
      OR (p_scope = 'club' AND o.show_id IN (
            SELECT s.id FROM public.shows s WHERE s.club_id = p_club_id))
    )
    -- Keyset: strictly after the (created_at, id) cursor for stable paging.
    AND (
      p_after_created_at IS NULL
      OR (o.created_at, o.id) > (p_after_created_at, p_after_id)
    )
  ORDER BY o.created_at ASC, o.id ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.financial_reconciliation_orders(text, uuid, uuid, integer, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financial_reconciliation_orders(text, uuid, uuid, integer, timestamptz, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Payout detail rows — PII-free settlement facts, keyset-paginated. Carries
--    the copyable stripe_transfer_id used to reconcile a transfer against
--    Stripe. Independent of the charge-verification rows above.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financial_reconciliation_payouts(
  p_scope            text,
  p_club_id          uuid        DEFAULT NULL,
  p_show_id          uuid        DEFAULT NULL,
  p_limit            integer     DEFAULT 200,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id         uuid        DEFAULT NULL
)
RETURNS TABLE (
  payout_id          uuid,
  show_id            uuid,
  status             text,
  amount_cents       integer,
  stripe_transfer_id text,
  scheduled_date     date,
  completed_at       timestamptz,
  failure_reason     text,
  created_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
BEGIN
  PERFORM public._financial_reconciliation_authorize(p_scope, p_club_id, p_show_id);

  RETURN QUERY
  SELECT sp.id, sp.show_id, sp.status, sp.amount_cents, sp.stripe_transfer_id,
         sp.scheduled_date, sp.completed_at, sp.failure_reason, sp.created_at
  FROM public.show_payouts sp
  WHERE (
      p_scope = 'platform'
      OR (p_scope = 'show' AND sp.show_id = p_show_id)
      OR (p_scope = 'club' AND sp.show_id IN (
            SELECT s.id FROM public.shows s WHERE s.club_id = p_club_id))
    )
    AND (
      p_after_created_at IS NULL
      OR (sp.created_at, sp.id) > (p_after_created_at, p_after_id)
    )
  ORDER BY sp.created_at ASC, sp.id ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.financial_reconciliation_payouts(text, uuid, uuid, integer, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financial_reconciliation_payouts(text, uuid, uuid, integer, timestamptz, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Supporting indexes for the scope filters and keyset ordering. stripe_orders
--    already has (show_id) and shows has (club_id); show_payouts lacks a plain
--    show_id index (only a partial-unique one that excludes failed rows), and
--    neither table has a (show_id, created_at, id) composite for the keyset scan.
--    Add them so scoped aggregation and detail paging stay index-backed as the
--    platform-scope dataset grows (design.md: "add indexes based on query plans").
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS show_payouts_show_id_idx
  ON public.show_payouts (show_id);
CREATE INDEX IF NOT EXISTS stripe_orders_show_created_id_idx
  ON public.stripe_orders (show_id, created_at, id);
CREATE INDEX IF NOT EXISTS show_payouts_show_created_id_idx
  ON public.show_payouts (show_id, created_at, id);

-- Reload PostgREST schema cache so the new RPCs are callable immediately.
NOTIFY pgrst, 'reload schema';

-- Reversible down path (run manually to roll back):
--   DROP INDEX IF EXISTS public.show_payouts_show_created_id_idx;
--   DROP INDEX IF EXISTS public.stripe_orders_show_created_id_idx;
--   DROP INDEX IF EXISTS public.show_payouts_show_id_idx;
--   DROP FUNCTION IF EXISTS public.financial_reconciliation_payouts(text, uuid, uuid, integer, timestamptz, uuid);
--   DROP FUNCTION IF EXISTS public.financial_reconciliation_orders(text, uuid, uuid, integer, timestamptz, uuid);
--   DROP FUNCTION IF EXISTS public.financial_reconciliation_summary(text, uuid, uuid);
--   DROP FUNCTION IF EXISTS public._financial_reconciliation_authorize(text, uuid, uuid);
