-- Immutable Stripe order financial snapshot (financial-reconciliation, MYK9-54).
--
-- Records the authoritative, cent-based facts of each online charge AT CHARGE
-- TIME so a later `platform_settings.platform_fee_percent` change never rewrites
-- historical income. The webhook populates these at every stripe_orders insert
-- site; the refund path updates ONLY refunded_cents, never the original charge
-- facts.
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
  -- POST-HOC refunds only, in cents (see the refund-attribution invariant
  -- below). Defaults to 0 (unrefunded); the refund path updates ONLY the two
  -- refund columns, never the immutable charge facts above.
  ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0
    CHECK (refunded_cents >= 0),
  -- Make-whole refunds only, in cents (see the refund-attribution invariant
  -- below). Economically the OPPOSITE of refunded_cents.
  ADD COLUMN IF NOT EXISTS make_whole_refunded_cents integer NOT NULL DEFAULT 0
    CHECK (make_whole_refunded_cents >= 0);

-- ── THE REFUND-ATTRIBUTION INVARIANT (do not break) ────────────────────────
-- `refunded_cents` used to conflate two economically OPPOSITE events, forcing
-- every consumer to re-derive the split from amount − subtotal − fee. That
-- derivation is unsound: it makes charge verification tautological (an overflow
-- order can never independently fail a tie-out check). The split is therefore
-- recorded EXPLICITLY at write time.
--
--   amount_cents              GROSS amount the customer was charged. Never
--                             pre-netted by a refund.
--   make_whole_refunded_cents Returned for lines that were NEVER accepted
--                             (cart overflow / payment-link make-whole). The
--                             platform earned no fee and no club transfer
--                             occurred, so this is NOT a platform loss — it is
--                             money collected and handed straight back.
--   refunded_cents            POST-HOC refunds only: the entry WAS accepted,
--                             the club kept its transfer, and the platform
--                             repays the customer from its own balance. This
--                             IS a real platform loss.
--
--   collected = amount_cents − make_whole_refunded_cents − refunded_cents
--   ties out  = amount_cents == entry_subtotal_cents
--                             + platform_fee_cents
--                             + make_whole_refunded_cents
--
-- Because the two columns are now recorded independently, the tie-out above is
-- a genuine, falsifiable check rather than an identity.

-- Attention-item lookup: succeeded orders whose processing fee has not been
-- captured yet (net income pending). Partial index keeps it small — the vast
-- majority of orders have their fee resolved and are excluded.
CREATE INDEX IF NOT EXISTS idx_stripe_orders_processing_fee_pending
  ON public.stripe_orders (created_at)
  WHERE stripe_processing_fee_cents IS NULL AND status = 'succeeded';

-- Explicit grants, tightened to the real access pattern: all client code reads
-- stripe_orders only (RLS: select-own / platform-admin-manage); every write goes
-- through service_role edge functions (webhook + refund functions), which bypass
-- RLS. Grants were never declared explicitly for this table — declare them now
-- at the minimum level actually used.
REVOKE INSERT, UPDATE, DELETE ON public.stripe_orders FROM authenticated, anon;
GRANT SELECT ON public.stripe_orders TO authenticated;
GRANT ALL ON public.stripe_orders TO service_role;

-- ── ATOMIC REFUND LEDGER WRITE ─────────────────────────────────────────────
-- Stripe explicitly permits duplicate and OUT-OF-ORDER webhook delivery, and
-- the make-whole writer races the `charge.refunded` handler. A read-then-write
-- max in the edge function is NOT atomic: two concurrent deliveries can both
-- read 0 and the smaller write silently clobbers the larger. The compare must
-- therefore happen inside a single UPDATE statement, which takes the row lock
-- and (under READ COMMITTED) re-evaluates against the committed winner.
--
-- Attribution, without double counting:
--   `charge.amount_refunded` is Stripe's CUMULATIVE total across BOTH kinds of
--   refund, so it is passed as p_charge_total_refunded_cents and the post-hoc
--   part is DERIVED as total − make_whole. Both inputs are monotonic:
--     new_make_whole = GREATEST(stored_make_whole, p_make_whole_cents)
--     new_total      = GREATEST(stored_make_whole + stored_post_hoc,
--                               p_charge_total_refunded_cents,
--                               new_make_whole)
--     new_post_hoc   = new_total − new_make_whole
--   The stored total is recoverable as the sum of the two columns, so no extra
--   bookkeeping column is needed. Because new_post_hoc is a pure function of
--   two monotonically-growing quantities, the row CONVERGES to the same values
--   regardless of delivery order: a `charge.refunded` that lands before its
--   make-whole writer is provisionally booked as post-hoc, then reattributed
--   (not double counted) when the make-whole writer raises make_whole. Seeding
--   new_total with new_make_whole keeps total >= make_whole, so the derived
--   post-hoc can never go negative even if `charge.refunded` never arrives.
--
-- Callers: the stripe-webhook edge function only (service_role). No client
-- needs this, and no client may write money columns.
CREATE OR REPLACE FUNCTION public.record_order_refund_cents(
  p_payment_intent_id text,
  p_make_whole_cents integer DEFAULT 0,
  p_charge_total_refunded_cents integer DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  make_whole_cents integer,
  post_hoc_cents integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Single statement: the GREATEST comparisons read the row under its own
  -- write lock, so a concurrent delivery cannot interleave a stale read.
  -- References to o.<col> on the right-hand side of SET are the OLD values;
  -- RETURNING yields the NEW ones.
  RETURN QUERY
  UPDATE public.stripe_orders AS o
     SET make_whole_refunded_cents = GREATEST(
           COALESCE(o.make_whole_refunded_cents, 0),
           GREATEST(COALESCE(p_make_whole_cents, 0), 0)
         ),
         refunded_cents = GREATEST(
             COALESCE(o.make_whole_refunded_cents, 0) + COALESCE(o.refunded_cents, 0),
             GREATEST(COALESCE(p_charge_total_refunded_cents, 0), 0),
             GREATEST(
               COALESCE(o.make_whole_refunded_cents, 0),
               GREATEST(COALESCE(p_make_whole_cents, 0), 0)
             )
           )
           - GREATEST(
               COALESCE(o.make_whole_refunded_cents, 0),
               GREATEST(COALESCE(p_make_whole_cents, 0), 0)
             )
   WHERE o.stripe_payment_intent_id = p_payment_intent_id
  RETURNING o.id, o.make_whole_refunded_cents, o.refunded_cents;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_refund_cents(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_order_refund_cents(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_refund_cents(text, integer, integer) TO service_role;

-- Reversible down path (run manually to roll back — migrations are not
-- auto-reverted in this project):
--   DROP FUNCTION IF EXISTS public.record_order_refund_cents(text, integer, integer);
--   DROP INDEX IF EXISTS public.idx_stripe_orders_processing_fee_pending;
--   ALTER TABLE public.stripe_orders
--     DROP COLUMN IF EXISTS entry_subtotal_cents,
--     DROP COLUMN IF EXISTS platform_fee_cents,
--     DROP COLUMN IF EXISTS platform_fee_rate,
--     DROP COLUMN IF EXISTS stripe_processing_fee_cents,
--     DROP COLUMN IF EXISTS refunded_cents,
--     DROP COLUMN IF EXISTS make_whole_refunded_cents;
