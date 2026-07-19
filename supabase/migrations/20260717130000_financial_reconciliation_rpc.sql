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
-- ORDER-TYPE SCOPING (deliberate decision, MYK9-54 review finding 1).
-- stripe_orders holds more than show entries: handleOneTimePaymentCompleted
-- writes order_type = 'payment' rows that carry a REAL amount_cents and a REAL
-- stripe_processing_fee_cents but NO platform-fee snapshot. Folding those into
-- the entry figures would (a) count them as online ENTRY collections and (b)
-- subtract their Stripe processing cost from platform fee income they never
-- contributed to, understating net platform income. So EVERY entry/fee figure
-- below (gross_charged, entry_subtotal, platform_fee, processing_fee + its
-- pending count, refunded, snapshot_missing) covers exactly one population:
-- (status IN ('succeeded','refunded') OR recorded refund cents > 0)
-- AND order_type = 'entry'. A refund-bearing pending/processing row is already
-- financially active; excluding it would make its gross, fee, and refund all
-- disappear instead of netting together.
-- Non-entry orders are NOT silently dropped — they are reported as their own
-- clearly labeled group (non_entry_order_count / non_entry_gross_cents plus
-- non_entry_refunded_cents / non_entry_make_whole_refunded_cents) so the money
-- is still visible, just never mixed into entry accounting. Legacy rows
-- with a NULL order_type fall into the non-entry bucket by the same rule.
--
-- NON-ENTRY REFUNDS (review finding 3). non_entry_gross_cents alone reported a
-- fully-refunded one-time payment at its FULL gross forever: the refund SUMs
-- covered entry orders only, so refunded non-entry money was recorded and
-- subtracted nowhere. Both refund columns are therefore SUMmed over the
-- non-entry population too, on exactly the same explicit-column basis as the
-- entry side, so a consumer can report a non-entry net
-- (gross − refunded − make_whole) without deriving anything. The two
-- populations stay separate — a non-entry refund is never mixed into the entry
-- refund totals.
-- The orders DETAIL function applies the IDENTICAL predicate, so detail rows and
-- the aggregates always describe the same population.
--
-- REFUND SPLIT (refunded_cents vs make_whole_refunded_cents) — EXPLICIT COLUMNS.
-- Two economically OPPOSITE refund events used to share one conflated
-- `refunded_cents` column, forcing every consumer to RE-DERIVE the split as
-- `amount − entry_subtotal − platform_fee`. That derivation was unsound: it is an
-- identity for a well-formed order, so a cart-overflow order could never
-- independently FAIL a tie-out check, and charge verification was tautological.
--
-- Migration 20260717122000 therefore records the split EXPLICITLY at write time:
--
--   amount_cents              GROSS amount the customer was charged.
--   make_whole_refunded_cents Returned for lines that were NEVER accepted (cart
--                             overflow / payment-link make-whole). The platform
--                             earned no fee and no club transfer occurred, so
--                             this is NOT a platform loss — money collected and
--                             handed straight back.
--   refunded_cents            POST-HOC refunds only: the entry WAS accepted, the
--                             club kept its transfer, and the platform repays the
--                             customer from its own balance. A REAL platform loss.
--
--   collected = amount_cents − make_whole_refunded_cents − refunded_cents
--   ties out  = amount_cents == entry_subtotal_cents + platform_fee_cents
--                             + make_whole_refunded_cents
--
-- So this function READS BOTH COLUMNS DIRECTLY and derives nothing. There is no
-- post_hoc_refunded_cents output any more: `refunded_cents` IS the post-hoc total,
-- and `make_whole_refunded_cents` is its own SUMmed total. Consumers subtract
-- refunded_cents from net platform income and BOTH columns from money collected.
-- Because the two columns are recorded independently rather than derived from the
-- tie-out, the tie-out above is now a genuine, falsifiable check.
--
-- NULL-SNAPSHOT ORDERS need no special refund handling for the same reason: both
-- refund columns are NOT NULL DEFAULT 0 and are recorded independently of the
-- (possibly NULL) subtotal/fee snapshot, so a legacy row's refunds attribute
-- correctly without any derivation. Those rows are still surfaced separately via
-- snapshot_missing_count, which counts a NULL in EITHER snapshot column — the
-- same "missing" definition the snapshot contract and the client resolver use
-- (an order with only one of the two is equally rate-unverifiable).
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
-- RE-RUNNABILITY. `CREATE OR REPLACE FUNCTION` CANNOT change the return type of
-- an existing function ("cannot change return type of existing function / Row
-- type defined by OUT parameters is different") — and these RETURNS TABLE
-- signatures do evolve. Drop first so the migration is safely re-runnable and a
-- signature change never wedges an apply. Verified by executing this file twice
-- against a scratch Postgres: without these DROPs the second apply FAILS.
-- The GRANT/REVOKE statements below re-establish privileges after each create.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.financial_reconciliation_summary(text, uuid, uuid);
DROP FUNCTION IF EXISTS public.financial_reconciliation_orders(text, uuid, uuid, integer, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.financial_reconciliation_payouts(text, uuid, uuid, integer, timestamptz, uuid);
DROP FUNCTION IF EXISTS public._financial_reconciliation_authorize(text, uuid, uuid);

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
  -- Charge verification side (stripe_orders, ENTRY orders only — see header)
  order_count                  bigint,
  gross_charged_cents          bigint,
  entry_subtotal_cents         bigint,
  platform_fee_cents           bigint,
  processing_fee_cents         bigint,  -- SUM of CAPTURED fees only (NULLs excluded)
  processing_fee_pending_count bigint,  -- orders whose fee is not yet captured (pending, not zero)
  -- PENDING-FEE RESIDUAL (review finding 2). Net platform income used to latch to
  -- "pending" SCOPE-WIDE the moment ANY single order's balance transaction was
  -- delayed — and nothing retries the fee capture, so the first delayed fee in
  -- platform history permanently disabled the headline number. These two sums
  -- restrict the entry totals to exactly the orders whose processing fee is NOT
  -- captured, so a consumer can report an HONEST net over the orders that ARE
  -- captured plus a separately labeled pending residual:
  --   available net    = (platform_fee − pending_fee_platform_fee)
  --                      − processing_fee
  --                      − (refunded − pending_fee_refunded)
  --   pending residual = pending_fee_platform_fee − pending_fee_refunded
  -- The residual is EXCLUDED from the available net, never silently treated as
  -- zero and never added in as if it had already netted out.
  pending_fee_platform_fee_cents bigint,
  pending_fee_refunded_cents     bigint,
  refunded_cents               bigint,  -- POST-HOC refunds: the loss the PLATFORM absorbed (see REFUND SPLIT)
  make_whole_refunded_cents    bigint,  -- cart-overflow make-whole: returned, but NOT a platform loss
  snapshot_missing_count       bigint,  -- legacy ENTRY orders missing EITHER snapshot column
  -- Non-entry charges (order_type <> 'entry' or NULL) — reported separately so
  -- one-time 'payment' money is visible but never counted as entry collections.
  -- Their refunds are reported too (see NON-ENTRY REFUNDS in the header): without
  -- them a fully-refunded one-time payment reads at full gross forever.
  non_entry_order_count        bigint,
  non_entry_gross_cents        bigint,
  non_entry_refunded_cents     bigint,
  non_entry_make_whole_refunded_cents bigint,
  -- Payout settlement side (show_payouts) — kept independent of charge facts
  payout_count                 bigint,
  payout_completed_cents       bigint,
  payout_pending_cents         bigint,
  -- A failed transfer is money still owed to the club ONLY while it has not been
  -- retried — see the SUPERSEDED FAILED PAYOUTS note in the body. Reported as its
  -- own labeled total (never merged into payout_pending_cents) so the UI can
  -- present outstanding liability = pending + genuinely-outstanding failed.
  payout_failed_cents          bigint,
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
  WITH scoped_charges AS (
    SELECT o.order_type,
           o.amount_cents,
           o.entry_subtotal_cents,
           o.platform_fee_cents,
           o.stripe_processing_fee_cents,
           o.refunded_cents,
           o.make_whole_refunded_cents
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
  -- Entry accounting covers ENTRY orders only (see ORDER-TYPE SCOPING header).
  scoped_orders AS (
    SELECT * FROM scoped_charges WHERE order_type = 'entry'
  ),
  scoped_non_entry AS (
    SELECT * FROM scoped_charges WHERE order_type IS DISTINCT FROM 'entry'
  ),
  -- SUPERSEDED FAILED PAYOUTS (review finding 3). cron-process-payouts does NOT
  -- update a failed row on retry: it leaves the failed row in place and INSERTs a
  -- new one. So a show can carry an old `failed` row AND a later
  -- pending/processing/completed row. Summing EVERY failed row would keep an
  -- already-retried-and-paid show counting as outstanding liability forever and
  -- report a historical, resolved failure as a permanent attention item.
  --
  -- The unique index `show_payouts_one_live_per_show` is
  -- `(show_id) WHERE status <> 'failed'`, so a show has AT MOST ONE non-failed
  -- ("live") payout row. A failed row is therefore genuinely outstanding if and
  -- only if its show has NO live row — the existence of any live row means the
  -- transfer was retried and that live row already carries the liability (as
  -- pending/processing, or as settled when completed). `has_live_payout` below
  -- encodes exactly that rule; the failed aggregates filter on it so a retried
  -- failure is neither double-counted nor reported as attention.
  --
  -- The EXISTS probes the FULL show_payouts table, not the scoped set: liveness is
  -- a property of the show, and every payout for a show is inside the same scope
  -- anyway (scope filters by show_id / club_id), so this cannot leak cross-scope
  -- amounts — it only reads a boolean.
  scoped_payouts AS (
    SELECT sp.amount_cents,
           sp.status,
           EXISTS (
             SELECT 1 FROM public.show_payouts live
             WHERE live.show_id = sp.show_id
               AND live.status <> 'failed'
           ) AS has_live_payout,
           -- REPEATED failures: the live-row unique index only bounds NON-failed
           -- rows, so a show that fails, retries, and fails again holds TWO
           -- failed rows and `has_live_payout` is false for BOTH. Summing every
           -- historical attempt would count the same owed money once per retry.
           -- Only the LATEST failed attempt per show represents the outstanding
           -- liability; earlier attempts are superseded history.
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
  -- EVERY column reference below is qualified with a CTE alias (so_/ne_/sp_).
  -- This is REQUIRED, not style: the RETURNS TABLE output columns above become
  -- PL/pgSQL variables, and several of them (entry_subtotal_cents,
  -- platform_fee_cents, refunded_cents, make_whole_refunded_cents) share a name
  -- with a CTE column. An
  -- unqualified reference raises "column reference ... is ambiguous" at RUNTIME
  -- on every call — a failure no source-pin test or CREATE FUNCTION check can
  -- catch. Keep every reference alias-qualified.
  SELECT
    (SELECT count(*)                                            FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.amount_cents), 0)                   FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.entry_subtotal_cents), 0)           FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.platform_fee_cents), 0)             FROM scoped_orders so),
    -- NULL processing fees are pending, NOT zero: SUM ignores them here and the
    -- pending COUNT below surfaces them so net income can be labeled pending.
    (SELECT COALESCE(SUM(so.stripe_processing_fee_cents), 0)    FROM scoped_orders so),
    (SELECT count(*) FROM scoped_orders so WHERE so.stripe_processing_fee_cents IS NULL),
    -- Pending-fee residual inputs: the SAME two entry figures, restricted to the
    -- orders whose processing fee is NOT captured. Subtracting these from the
    -- scope-wide totals yields a net over exactly the captured-fee orders, which
    -- is what stops one delayed balance transaction from latching the whole
    -- headline figure to "pending" forever (review finding 2).
    (SELECT COALESCE(SUM(so.platform_fee_cents), 0) FROM scoped_orders so
      WHERE so.stripe_processing_fee_cents IS NULL),
    (SELECT COALESCE(SUM(so.refunded_cents), 0)     FROM scoped_orders so
      WHERE so.stripe_processing_fee_cents IS NULL),
    -- POST-HOC refunds — read DIRECTLY from the explicit column, never derived.
    -- This is the platform's real absorbed loss (see REFUND SPLIT in the header).
    (SELECT COALESCE(SUM(so.refunded_cents), 0)                 FROM scoped_orders so),
    -- Cart-overflow make-whole refunds — also read directly. Money returned to the
    -- customer, but NOT a platform loss: no fee was earned and no transfer made on
    -- those lines. Consumers subtract it from "collected", never from net income.
    (SELECT COALESCE(SUM(so.make_whole_refunded_cents), 0)      FROM scoped_orders so),
    -- Snapshot missing = EITHER snapshot column is NULL (review finding 6). The
    -- snapshot contract and the client-side charge-verification resolver both
    -- treat a null entry_subtotal_cents OR a null platform_fee_cents as missing
    -- (an order with only one of the two cannot tie out either), so counting only
    -- platform_fee_cents would under-report rate-unverifiable orders.
    (SELECT count(*) FROM scoped_orders so
      WHERE so.platform_fee_cents IS NULL OR so.entry_subtotal_cents IS NULL),
    (SELECT count(*)                                            FROM scoped_non_entry ne),
    (SELECT COALESCE(SUM(ne.amount_cents), 0)                   FROM scoped_non_entry ne),
    -- Non-entry refunds, same explicit-column basis as the entry side. Without
    -- these a fully-refunded one-time payment reported its full gross forever
    -- (review finding 3). Kept in the non-entry population, never merged into the
    -- entry refund totals above.
    (SELECT COALESCE(SUM(ne.refunded_cents), 0)                 FROM scoped_non_entry ne),
    (SELECT COALESCE(SUM(ne.make_whole_refunded_cents), 0)      FROM scoped_non_entry ne),
    (SELECT count(*)                                            FROM scoped_payouts sp),
    (SELECT COALESCE(SUM(sp.amount_cents), 0) FROM scoped_payouts sp WHERE sp.status = 'completed'),
    (SELECT COALESCE(SUM(sp.amount_cents), 0) FROM scoped_payouts sp WHERE sp.status IN ('pending', 'processing')),
    -- Failed transfers are still owed to the club — but ONLY when not superseded
    -- by a retry (see SUPERSEDED FAILED PAYOUTS above). Summed separately, never
    -- merged into payout_pending_cents.
    (SELECT COALESCE(SUM(sp.amount_cents), 0) FROM scoped_payouts sp
      WHERE sp.status = 'failed' AND NOT sp.has_live_payout AND sp.is_latest_failed),
    (SELECT count(*) FROM scoped_payouts sp
      WHERE sp.status = 'failed' AND NOT sp.has_live_payout AND sp.is_latest_failed);
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
  -- The show's display name (review finding 5). NOT PII — it is the public show
  -- title already rendered on every public show page — and it stays scoped by the
  -- same authorized predicate as the row it travels with. Carried here because a
  -- show can have paid orders and NO payout row yet (a normal pre-settlement
  -- state), and borrowing names from payout history alone left those shows
  -- labeled with the generic fallback "Show".
  show_name                   text,
  status                      text,
  order_type                  text,
  amount_cents                integer,
  entry_subtotal_cents        integer,
  platform_fee_cents          integer,
  platform_fee_rate           numeric,
  stripe_processing_fee_cents integer,
  -- Both refund columns travel with the detail row: a per-row tie-out check needs
  -- make_whole_refunded_cents (amount == subtotal + fee + make_whole), and per-row
  -- net-to-club needs the post-hoc refunded_cents. Deriving either client-side
  -- would reintroduce the tautology this split exists to remove.
  refunded_cents              integer,
  make_whole_refunded_cents   integer,
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
  -- s.name is alias-qualified for the same reason every summary aggregate is:
  -- `show_name` is a RETURNS TABLE output variable here.
  SELECT o.id, o.show_id, sh.name, o.status, o.order_type, o.amount_cents,
         o.entry_subtotal_cents, o.platform_fee_cents, o.platform_fee_rate,
         o.stripe_processing_fee_cents, o.refunded_cents, o.make_whole_refunded_cents,
         o.stripe_payment_intent_id,
         o.created_at, o.paid_at, o.refunded_at
  FROM public.stripe_orders o
  -- LEFT so an order with a null/dangling show_id still returns its charge facts;
  -- the name is simply NULL and the client falls back to its generic label.
  -- Alias `sh`, not `s`: the club-scope predicate below uses its own `s` and a
  -- same-named outer alias would shadow confusingly.
  LEFT JOIN public.shows sh ON sh.id = o.show_id
  -- IDENTICAL population to the summary's scoped_orders CTE: without this
  -- predicate, failed/pending/cancelled and non-entry orders would enter
  -- client-side grouping and per-show net math and disagree with the aggregates.
  WHERE (
      o.status IN ('succeeded', 'refunded')
      OR o.refunded_cents > 0
      OR o.make_whole_refunded_cents > 0
    )
    AND o.order_type = 'entry'
    AND (
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
