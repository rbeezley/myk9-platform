-- Immutable Stripe order financial snapshot + per-refund ledger
-- (financial-reconciliation, MYK9-54).
--
-- Records the authoritative, cent-based facts of each online charge AT CHARGE
-- TIME so a later `platform_settings.platform_fee_percent` change never rewrites
-- historical income. The webhook populates these at every stripe_orders insert
-- site; the refund path updates ONLY the derived refund columns, never the
-- original charge facts.
--
-- No historical backfill: pre-existing orders keep NULL snapshot columns and are
-- reported as rate-unverifiable / net-pending. They are intentionally NOT filled
-- from the current fee setting (doing so would rewrite history).

ALTER TABLE public.stripe_orders
  -- The paid entry service amount (excludes platform fee); NULL for legacy rows.
  ADD COLUMN IF NOT EXISTS entry_subtotal_cents integer
    CHECK (entry_subtotal_cents IS NULL OR entry_subtotal_cents >= 0),
  -- Platform fee charged, in cents, as applied at charge time.
  ADD COLUMN IF NOT EXISTS platform_fee_cents integer
    CHECK (platform_fee_cents IS NULL OR platform_fee_cents >= 0),
  -- The fee percent applied at charge time (immutable); e.g. 7.00.
  ADD COLUMN IF NOT EXISTS platform_fee_rate numeric(5, 2)
    CHECK (platform_fee_rate IS NULL OR platform_fee_rate >= 0),
  -- Stripe's balance-transaction processing fee in cents. NULL = PENDING (the
  -- balance transaction was not yet available); it is never an estimated zero.
  ADD COLUMN IF NOT EXISTS stripe_processing_fee_cents integer
    CHECK (stripe_processing_fee_cents IS NULL OR stripe_processing_fee_cents >= 0),
  -- DERIVED CACHE of POST-HOC refunds, in cents (see the refund-attribution
  -- invariant below). RECOMPUTED from public.stripe_order_refunds, never
  -- incremented. Defaults to 0 (unrefunded).
  ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0
    CHECK (refunded_cents >= 0),
  -- DERIVED CACHE of MAKE-WHOLE refunds, in cents. Economically the OPPOSITE of
  -- refunded_cents. Also recomputed, never incremented.
  ADD COLUMN IF NOT EXISTS make_whole_refunded_cents integer NOT NULL DEFAULT 0
    CHECK (make_whole_refunded_cents >= 0);

-- The `make_whole_refund_ids` / `reversed_refund_ids` array columns are GONE.
-- They were the idempotency keys for an ADDITIVE forward path and a SUBTRACTIVE
-- reversal path that shared no state, and that split is exactly what made the
-- ledger unsound (see the structural note below). The refund ledger's PRIMARY
-- KEY replaces both.
ALTER TABLE public.stripe_orders
  DROP COLUMN IF EXISTS make_whole_refund_ids,
  DROP COLUMN IF EXISTS reversed_refund_ids;

-- ── WHY A ROW PER REFUND (the structural fix) ──────────────────────────────
-- The previous design kept only two monotonic counters and mutated them with
-- GREATEST/accumulate on the forward path and a subtraction on the reversal
-- path. Monotonic counters cannot represent "this refund was UN-done", so the
-- two paths fought each other. Executed sequences that were provably wrong:
--
--   charge.refunded(4000) -> post_hoc 4000; refund.failed(re_B,4000) -> 0;
--   charge.refunded REDELIVERED -> 4000 again (the reversal silently undone).
--
--   record(500,re_A) -> mw 500; reverse(re_A,500) -> mw 0 AND re_A removed from
--   make_whole_refund_ids; record(500,re_A) redelivered -> mw 500 (the dedupe
--   key had been destroyed by the reversal).
--
--   an unkeyed make-whole followed by a reversal debited the WRONG column,
--   floored at 0, and burned the reversal key forever.
--
--   reverse() applied to a refund it had never booked, and cleared refunded_at
--   on an order that was only PARTIALLY refunded.
--
-- Stripe retries deliveries for up to three days and guarantees no ordering, and
-- there is no processed-events table. So the fix is not a smarter counter: it is
-- to stop keeping counters at all. ONE ROW PER STRIPE REFUND, keyed on the
-- Stripe refund id, and DERIVE the totals. Idempotency is then a property of the
-- PRIMARY KEY rather than of an algorithm, and recomputation is order
-- independent by construction.
CREATE TABLE IF NOT EXISTS public.stripe_order_refunds (
  -- IDEMPOTENCY BY CONSTRUCTION: a webhook redelivery is an upsert of this row.
  stripe_refund_id text PRIMARY KEY,
  stripe_payment_intent_id text NOT NULL,
  order_id uuid REFERENCES public.stripe_orders (id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  -- 'make_whole' = lines NEVER accepted (money handed straight back, no platform
  -- loss). 'post_hoc' = the entry WAS accepted and the platform repays from its
  -- own balance (a real loss).
  kind text NOT NULL CHECK (kind IN ('make_whole', 'post_hoc')),
  -- A FAILED refund is a STATE CHANGE, never a subtraction. The row is RETAINED
  -- so the history stays auditable.
  state text NOT NULL DEFAULT 'succeeded' CHECK (state IN ('succeeded', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_order_refunds_order
  ON public.stripe_order_refunds (order_id);
CREATE INDEX IF NOT EXISTS idx_stripe_order_refunds_intent
  ON public.stripe_order_refunds (stripe_payment_intent_id);

-- Money table: NO client grants at all. Every read that reaches a client goes
-- through the SECURITY DEFINER reconciliation RPC, which reads the derived
-- columns on stripe_orders. RLS is enabled (and FORCEd) with NO permissive
-- policy, so even a future accidental grant denies every row; service_role and
-- the function owner carry BYPASSRLS.
ALTER TABLE public.stripe_order_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_order_refunds FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_order_refunds FROM PUBLIC;
REVOKE ALL ON public.stripe_order_refunds FROM anon, authenticated;
GRANT ALL ON public.stripe_order_refunds TO service_role;

-- ── THE REFUND-ATTRIBUTION INVARIANT (do not break) ────────────────────────
-- `refunded_cents` used to conflate two economically OPPOSITE events, forcing
-- every consumer to re-derive the split from amount − subtotal − fee. That
-- derivation is unsound: it makes charge verification tautological (an overflow
-- order can never independently fail a tie-out check). The split is therefore
-- recorded EXPLICITLY per refund, as `kind`, and summed into the two columns.
--
--   amount_cents              GROSS amount the customer was charged. Never
--                             pre-netted by a refund.
--   make_whole_refunded_cents SUM(amount) WHERE kind='make_whole'
--                                          AND state='succeeded'.
--                             Returned for lines that were NEVER accepted (cart
--                             overflow / payment-link make-whole). The platform
--                             earned no fee and no club transfer occurred, so
--                             this is NOT a platform loss.
--   refunded_cents            SUM(amount) WHERE kind='post_hoc'
--                                          AND state='succeeded'.
--                             POST-HOC refunds only: the entry WAS accepted, the
--                             club kept its transfer, and the platform repays the
--                             customer from its own balance. A real loss.
--
--   collected = amount_cents − make_whole_refunded_cents − refunded_cents
--   ties out  = amount_cents == entry_subtotal_cents
--                             + platform_fee_cents
--                             + make_whole_refunded_cents
--
-- ── THE REFUND STATUS INVARIANT ────────────────────────────────────────────
--   status = 'refunded'  IFF  make_whole_refunded_cents + refunded_cents
--                             >= amount_cents
--   refunded_at IS NOT NULL  IFF  the same condition holds.
--
-- Both are RE-DERIVED on every recompute, so the transition now correctly
-- DEMOTES ('refunded' -> 'succeeded') as well as promotes when a refund fails.
-- A PARTIALLY refunded order keeps status = 'succeeded' with a non-zero refund
-- column: that pair is NORMAL, not drift. Reconciliation must therefore read the
-- refund columns, never `status <> 'refunded'`, to decide whether money came
-- back. Only 'succeeded' <-> 'refunded' ever move; a 'failed', 'pending' or
-- 'cancelled' order is never rewritten.

-- Attention-item lookup: succeeded orders whose processing fee has not been
-- captured yet (net income pending). Partial index keeps it small.
CREATE INDEX IF NOT EXISTS idx_stripe_orders_processing_fee_pending
  ON public.stripe_orders (created_at)
  WHERE stripe_processing_fee_cents IS NULL AND status = 'succeeded';

-- Explicit grants, tightened to the real access pattern: all client code reads
-- stripe_orders only (RLS: select-own / platform-admin-manage); every write goes
-- through service_role edge functions (webhook + refund functions), which bypass
-- RLS.
REVOKE INSERT, UPDATE, DELETE ON public.stripe_orders FROM authenticated, anon;
GRANT SELECT ON public.stripe_orders TO authenticated;
GRANT ALL ON public.stripe_orders TO service_role;

-- ── THE RECOMPUTE (the single writer of both derived columns) ──────────────
-- Sums the ledger for every order of a payment intent and rewrites the derived
-- columns, the status and refunded_at from that sum. Idempotent and ORDER
-- INDEPENDENT: replaying any set of events in any order lands on the same row.
--
-- SCOPE: only orders that HAVE at least one ledger row are rewritten. An order
-- with no ledger rows is left exactly as it is, so pre-ledger rows are never
-- silently zeroed by an unrelated refund on the same intent.
--
-- Callers hold the row locks (both RPCs below take SELECT ... FOR UPDATE on the
-- intent's orders first), so concurrent deliveries serialize instead of
-- interleaving.
--
-- Every reference is ALIAS-QUALIFIED: the RETURNS TABLE columns are plpgsql
-- variables and a bare `order_id` / `order_type` would raise "column reference
-- is ambiguous" at RUNTIME, not at create time.
DROP FUNCTION IF EXISTS public.recompute_order_refund_totals(text);

CREATE FUNCTION public.recompute_order_refund_totals(p_payment_intent_id text)
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
             FILTER (WHERE f.kind = 'post_hoc' AND f.state = 'succeeded'), 0)::integer AS ph
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
           status = v_status,
           -- refunded_at IS NOT NULL IFF fully refunded — derived from the same
           -- condition as the status, so the two can never disagree. The old
           -- reversal path cleared this on orders that were never full.
           refunded_at = CASE WHEN v_full THEN COALESCE(o.refunded_at, now()) ELSE NULL END
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

-- ── BOOK ONE STRIPE REFUND ─────────────────────────────────────────────────
-- Upserts exactly one ledger row, then recomputes. The caller passes ONE Stripe
-- refund (id + amount + kind), never a cumulative total: guessing the split from
-- `charge.amount_refunded` is what forced the monotonic counters in the first
-- place, and the individual refunds are available on `charge.refunds.data`.
--
-- PRECEDENCE RULES, both enforced by the ON CONFLICT clause:
--   * `kind` is NEVER overwritten. The make-whole writers book their own refund
--     id with kind='make_whole' at creation time, so the later `charge.refunded`
--     delivery — which cannot tell the kinds apart — must not demote it.
--   * `state` is NEVER overwritten. FAILED IS TERMINAL: a redelivered success
--     event for a refund Stripe already failed must not resurrect it. Stripe
--     only moves a refund succeeded -> failed, never back, so a `failed` row is
--     the newer truth regardless of which delivery arrives last.
--
-- Callers: the stripe-webhook edge function only (service_role).
DROP FUNCTION IF EXISTS public.record_order_refund_cents(text, integer, integer);
DROP FUNCTION IF EXISTS public.record_order_refund_cents(text, integer, text, integer);
DROP FUNCTION IF EXISTS public.record_order_refund_cents(text, text, integer, text);

CREATE FUNCTION public.record_order_refund_cents(
  p_payment_intent_id text,
  p_refund_id text,
  p_amount_cents integer,
  p_kind text DEFAULT 'post_hoc'
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
  v_target uuid;
BEGIN
  IF p_payment_intent_id IS NULL OR p_refund_id IS NULL THEN
    RETURN;
  END IF;

  -- Lock every order on the intent for the rest of the transaction.
  PERFORM 1
     FROM public.stripe_orders AS o
    WHERE o.stripe_payment_intent_id = p_payment_intent_id
      FOR UPDATE;

  -- One payment intent normally covers exactly one order; when it covers
  -- several, the refund is attributed to the lowest-id order deterministically
  -- (booking it against every order would count the same money N times).
  SELECT o.id INTO v_target
    FROM public.stripe_orders AS o
   WHERE o.stripe_payment_intent_id = p_payment_intent_id
   ORDER BY o.id
   LIMIT 1;

  INSERT INTO public.stripe_order_refunds AS r
    (stripe_refund_id, stripe_payment_intent_id, order_id, amount_cents, kind, state)
  VALUES (p_refund_id, p_payment_intent_id, v_target, v_amount, v_kind, 'succeeded')
  ON CONFLICT (stripe_refund_id) DO UPDATE
     SET stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
         -- Late-attach an order that did not exist on the first delivery, but
         -- never re-point a row that already found its order.
         order_id = COALESCE(r.order_id, EXCLUDED.order_id),
         amount_cents = EXCLUDED.amount_cents,
         -- kind and state are deliberately ABSENT here (see precedence above).
         updated_at = now();

  RETURN QUERY
    SELECT t.order_id, t.order_type, t.order_status, t.order_amount_cents,
           t.make_whole_cents, t.post_hoc_cents, t.fully_refunded
      FROM public.recompute_order_refund_totals(p_payment_intent_id) AS t;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_refund_cents(text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_order_refund_cents(text, text, integer, text)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_refund_cents(text, text, integer, text)
  TO service_role;

-- ── FAIL ONE STRIPE REFUND (refund.failed) ─────────────────────────────────
-- `stripe.refunds.create` can return a PENDING refund that Stripe later fails.
-- This flips that ledger row's state to 'failed' and recomputes. It is NOT a
-- subtraction, so it cannot be undone by a redelivered booking event and it can
-- never drive a money column negative.
--
-- An out-of-order `refund.failed` arriving BEFORE the booking event writes a
-- TOMBSTONE row (state='failed') rather than doing nothing. An earlier version
-- of this comment claimed a redelivered failure would settle it; that was WRONG —
-- Stripe redelivers only on a non-2xx response and this webhook always returns
-- 200, so the failure is delivered exactly once and doing nothing loses it
-- permanently, leaving a phantom refund on the order. `p_amount_cents` is
-- accepted for the tombstone amount, call-site symmetry
-- and audit logging only: the amount already lives on the ledger row, and taking
-- it from the event is precisely how the old path could subtract the wrong
-- number.
--
-- Callers: the stripe-webhook edge function only (service_role).
DROP FUNCTION IF EXISTS public.reverse_order_refund_cents(text, text, integer);

CREATE FUNCTION public.reverse_order_refund_cents(
  p_payment_intent_id text,
  p_refund_id text,
  p_amount_cents integer DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  order_status text,
  order_amount_cents integer,
  make_whole_cents integer,
  post_hoc_cents integer,
  reversed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_flipped bigint := 0;
  v_did boolean := false;
BEGIN
  IF p_payment_intent_id IS NULL OR p_refund_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM 1
     FROM public.stripe_orders AS o
    WHERE o.stripe_payment_intent_id = p_payment_intent_id
      FOR UPDATE;

  -- TOMBSTONE on out-of-order arrival. A `refund.failed` can arrive BEFORE the
  -- event that books the refund. Doing nothing here loses the failure PERMANENTLY:
  -- Stripe redelivers only on a non-2xx response, and the webhook catches,
  -- alerts, and returns 200 — so the failure is consumed exactly once. The later
  -- booking would then insert the refund as 'succeeded' and the order would
  -- forever report money returned that the customer never received.
  --
  -- So record the failure even with no row to flip. `state` is never overwritten
  -- by the booking upsert, so this tombstone is authoritative: a later booking
  -- fills in amount/kind/order_id but CANNOT resurrect it. amount_cents is left
  -- 0 when unknown — a failed row contributes nothing to either total, and the
  -- booking supplies the real amount for audit.
  INSERT INTO public.stripe_order_refunds AS r (
    stripe_refund_id, stripe_payment_intent_id, order_id,
    amount_cents, kind, state
  )
  VALUES (
    p_refund_id, p_payment_intent_id,
    (SELECT o.id FROM public.stripe_orders o
      WHERE o.stripe_payment_intent_id = p_payment_intent_id
      ORDER BY o.id LIMIT 1),
    COALESCE(GREATEST(p_amount_cents, 0), 0), 'post_hoc', 'failed'
  )
  ON CONFLICT (stripe_refund_id) DO UPDATE
     SET state = 'failed',
         updated_at = now()
   -- The intent guard is load-bearing: a refund id must never be failed through
   -- the WRONG payment intent, or one order's failure corrupts another's ledger.
   WHERE r.state <> 'failed'
     AND r.stripe_payment_intent_id = p_payment_intent_id;
  GET DIAGNOSTICS v_flipped = ROW_COUNT;
  v_did := v_flipped > 0;

  RETURN QUERY
    SELECT t.order_id, t.order_status, t.order_amount_cents,
           t.make_whole_cents, t.post_hoc_cents, v_did
      FROM public.recompute_order_refund_totals(p_payment_intent_id) AS t;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_order_refund_cents(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_order_refund_cents(text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_order_refund_cents(text, text, integer) TO service_role;

-- Reversible down path (run manually to roll back — migrations are not
-- auto-reverted in this project):
--   DROP FUNCTION IF EXISTS public.record_order_refund_cents(text, text, integer, text);
--   DROP FUNCTION IF EXISTS public.reverse_order_refund_cents(text, text, integer);
--   DROP FUNCTION IF EXISTS public.recompute_order_refund_totals(text);
--   DROP TABLE IF EXISTS public.stripe_order_refunds;
--   DROP INDEX IF EXISTS public.idx_stripe_orders_processing_fee_pending;
--   ALTER TABLE public.stripe_orders
--     DROP COLUMN IF EXISTS entry_subtotal_cents,
--     DROP COLUMN IF EXISTS platform_fee_cents,
--     DROP COLUMN IF EXISTS platform_fee_rate,
--     DROP COLUMN IF EXISTS stripe_processing_fee_cents,
--     DROP COLUMN IF EXISTS refunded_cents,
--     DROP COLUMN IF EXISTS make_whole_refunded_cents;
