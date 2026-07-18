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
    CHECK (make_whole_refunded_cents >= 0),
  -- Stripe refund ids already accumulated into make_whole_refunded_cents. The
  -- make-whole writers report a SINGLE refund's amount (a DELTA), so the ledger
  -- must add rather than max — and adding is only safe if a duplicate webhook
  -- delivery of the same refund cannot add twice. This set is the idempotency
  -- key (see the RPC contract below).
  ADD COLUMN IF NOT EXISTS make_whole_refund_ids text[] NOT NULL DEFAULT '{}',
  -- Stripe refund ids whose amount has already been REVERSED out of the ledger
  -- after a `refund.failed` webhook. The idempotency key for the reversal path
  -- (see reverse_order_refund_cents below): a duplicate `refund.failed`
  -- delivery for the same refund id must not subtract twice.
  ADD COLUMN IF NOT EXISTS reversed_refund_ids text[] NOT NULL DEFAULT '{}';

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
--
-- ── THE REFUND STATUS INVARIANT (MYK9-54 review finding 1) ─────────────────
--   status = 'refunded'  IFF  the order is FULLY refunded, i.e.
--     make_whole_refunded_cents + refunded_cents >= amount_cents
--
-- A PARTIALLY refunded order keeps status = 'succeeded' with a non-zero refund
-- column: that pair is NORMAL, not drift. Reconciliation must therefore read
-- the refund columns, never `status <> 'refunded'`, to decide whether money came
-- back.
--
-- The transition is stamped HERE, inside record_order_refund_cents, and nowhere
-- else. Every refund source (per-entry app refund, bulk show refund, cart /
-- payment-link make-whole, dashboard refund) funnels through this one RPC, so
-- the status can no longer disagree with the amounts: before this, the app's own
-- per-entry refunds recorded cents and returned early WITHOUT ever stamping the
-- status, leaving refunded_cents > 0 alongside status = 'succeeded' on the most
-- common refund flow in the system. Only 'succeeded' is promoted (a 'failed' or
-- already-'refunded' order is left alone) and, because both refund totals are
-- monotonic, the transition is one-way.

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
-- CALLER PRECONDITION (MYK9-54 review finding 3): `p_make_whole_cents` is the
-- amount of ONE Stripe refund (a DELTA), and `p_make_whole_refund_id` is that
-- refund's Stripe id. It is NOT a cumulative make-whole total. The previous
-- contract took a cumulative total but both callers passed a single
-- `refund.amount`, so two make-whole refunds on one intent (300 then 200) left
-- make_whole = GREATEST(300, 200) = 300 and the later cumulative
-- `charge.refunded` (500) misbooked the missing 200 as a POST-HOC platform loss.
--
-- Deltas can only be added safely if a duplicate delivery cannot add twice, so
-- the refund id is the idempotency key: the amount is accumulated only when its
-- id is not already in `make_whole_refund_ids`. Passing a NULL refund id falls
-- back to the old monotonic GREATEST — never double-counting, but unable to
-- accumulate a second make-whole either. Callers MUST pass the refund id.
--
-- Attribution, without double counting:
--   `charge.amount_refunded` is Stripe's CUMULATIVE total across BOTH kinds of
--   refund, so it is passed as p_charge_total_refunded_cents and the post-hoc
--   part is DERIVED as total − make_whole:
--     new_make_whole = stored_make_whole + delta   (once per refund id)
--     new_total      = GREATEST(stored_make_whole + stored_post_hoc,
--                               p_charge_total_refunded_cents,
--                               new_make_whole)
--     new_post_hoc   = new_total − new_make_whole
--   The stored total is recoverable as the sum of the two columns, so no extra
--   bookkeeping column is needed. Both quantities grow monotonically and
--   new_post_hoc is a pure function of them, so the row CONVERGES to the same
--   values regardless of delivery order: a `charge.refunded` that lands before
--   its make-whole writer is provisionally booked as post-hoc, then
--   REATTRIBUTED (not double counted) when the make-whole writer catches up.
--   Seeding new_total with new_make_whole keeps total >= make_whole, so the
--   derived post-hoc can never go negative even if `charge.refunded` never
--   arrives.
--
-- ATOMICITY: the rows are taken with SELECT ... FOR UPDATE inside this function
-- and held for the rest of the transaction, so the compare/accumulate happens
-- under the row lock. A concurrent delivery blocks on the lock and then re-reads
-- the committed winner — it can never interleave a stale read the way the
-- previous read-then-write in the edge function could.
--
-- Callers: the stripe-webhook edge function only (service_role). No client
-- needs this, and no client may write money columns.
DROP FUNCTION IF EXISTS public.record_order_refund_cents(text, integer, integer);

CREATE OR REPLACE FUNCTION public.record_order_refund_cents(
  p_payment_intent_id text,
  p_make_whole_cents integer DEFAULT 0,
  p_make_whole_refund_id text DEFAULT NULL,
  p_charge_total_refunded_cents integer DEFAULT NULL
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
  v_row record;
  v_delta integer := GREATEST(COALESCE(p_make_whole_cents, 0), 0);
  v_charge_total integer := GREATEST(COALESCE(p_charge_total_refunded_cents, 0), 0);
  v_already boolean;
  v_ids text[];
  v_make_whole integer;
  v_total integer;
  v_post_hoc integer;
  v_full boolean;
  v_status text;
BEGIN
  -- One payment intent can cover several orders; lock each before computing.
  FOR v_row IN
    SELECT o.id, o.status, o.amount_cents, o.refunded_at,
           COALESCE(o.make_whole_refunded_cents, 0) AS mw,
           COALESCE(o.refunded_cents, 0) AS ph,
           COALESCE(o.make_whole_refund_ids, '{}'::text[]) AS ids,
           o.order_type
      FROM public.stripe_orders AS o
     WHERE o.stripe_payment_intent_id = p_payment_intent_id
     ORDER BY o.id
       FOR UPDATE
  LOOP
    v_ids := v_row.ids;
    v_already := p_make_whole_refund_id IS NOT NULL
                 AND p_make_whole_refund_id = ANY (v_ids);

    IF v_delta = 0 THEN
      v_make_whole := v_row.mw;
    ELSIF p_make_whole_refund_id IS NULL THEN
      -- Unkeyed fallback: monotonic max, never additive (cannot dedupe).
      v_make_whole := GREATEST(v_row.mw, v_delta);
    ELSIF v_already THEN
      v_make_whole := v_row.mw;
    ELSE
      v_make_whole := v_row.mw + v_delta;
      v_ids := array_append(v_ids, p_make_whole_refund_id);
    END IF;

    v_total := GREATEST(v_row.mw + v_row.ph, v_charge_total, v_make_whole);
    v_post_hoc := v_total - v_make_whole;
    v_full := COALESCE(v_row.amount_cents, 0) > 0 AND v_total >= v_row.amount_cents;
    -- One-way promotion only: a 'failed' or already-'refunded' order is left as is.
    v_status := CASE WHEN v_full AND v_row.status = 'succeeded' THEN 'refunded' ELSE v_row.status END;

    UPDATE public.stripe_orders AS o
       SET make_whole_refunded_cents = v_make_whole,
           refunded_cents = v_post_hoc,
           make_whole_refund_ids = v_ids,
           status = v_status,
           refunded_at = CASE WHEN v_full THEN COALESCE(o.refunded_at, now()) ELSE o.refunded_at END
     WHERE o.id = v_row.id;

    order_id := v_row.id;
    order_type := v_row.order_type;
    order_status := v_status;
    order_amount_cents := v_row.amount_cents;
    make_whole_cents := v_make_whole;
    post_hoc_cents := v_post_hoc;
    fully_refunded := v_full;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_refund_cents(text, integer, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_order_refund_cents(text, integer, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_refund_cents(text, integer, text, integer) TO service_role;

-- ── REFUND LEDGER REVERSAL (refund.failed) ─────────────────────────────────
-- `stripe.refunds.create` can return a PENDING refund that Stripe later fails.
-- By then `charge.refunded` has already booked the amount here and may have
-- stamped `status = 'refunded'` — so reconciliation keeps subtracting a refund
-- the customer never received, and the club's payout stays docked for money
-- that never left. `record_order_refund_cents` is deliberately MONOTONIC
-- (GREATEST / accumulate-once) and therefore structurally cannot lower a value,
-- so the reversal needs its own explicit path.
--
-- IDEMPOTENCY: keyed on the Stripe refund id, consistent with the make-whole
-- key. The amount is subtracted only when `p_refund_id` is not already in
-- `reversed_refund_ids`; a second delivery of the same `refund.failed` is a
-- no-op that still returns the row's current state.
--
-- ATTRIBUTION: if the id is in `make_whole_refund_ids`, the amount was booked as
-- MAKE-WHOLE and is subtracted from that column (and the id removed, so the
-- ledger's own record of which refunds are live stays truthful). Otherwise it
-- was booked as POST-HOC (the derived remainder of `charge.amount_refunded`) and
-- comes off `refunded_cents`. Both are floored at 0: a reversal larger than what
-- was ever booked (e.g. the failure arriving before the booking) must not push a
-- money column negative and violate its CHECK constraint.
--
-- STATUS: re-derived, not assumed. The order is fully refunded iff
-- make_whole + post_hoc >= amount_cents; when the reversal drops it below that
-- line, a 'refunded' order is DEMOTED back to 'succeeded' and `refunded_at` is
-- cleared. This is the one place the status is allowed to move backwards, and it
-- only ever moves 'refunded' -> 'succeeded' — a 'failed' or 'cancelled' order is
-- never resurrected.
--
-- ATOMICITY: same SELECT ... FOR UPDATE row-lock discipline as the forward path,
-- so a reversal racing a booking serializes rather than interleaving.
--
-- Callers: the stripe-webhook edge function only (service_role).
CREATE OR REPLACE FUNCTION public.reverse_order_refund_cents(
  p_payment_intent_id text,
  p_refund_id text,
  p_amount_cents integer
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
  v_row record;
  v_amount integer := GREATEST(COALESCE(p_amount_cents, 0), 0);
  v_make_whole integer;
  v_post_hoc integer;
  v_mw_ids text[];
  v_rev_ids text[];
  v_did boolean;
  v_full boolean;
  v_status text;
BEGIN
  IF p_refund_id IS NULL THEN
    -- Without the idempotency key a reversal cannot be made safe; refuse rather
    -- than risk subtracting the same amount on every redelivery.
    RETURN;
  END IF;

  FOR v_row IN
    SELECT o.id, o.status, o.amount_cents, o.refunded_at,
           COALESCE(o.make_whole_refunded_cents, 0) AS mw,
           COALESCE(o.refunded_cents, 0) AS ph,
           COALESCE(o.make_whole_refund_ids, '{}'::text[]) AS mw_ids,
           COALESCE(o.reversed_refund_ids, '{}'::text[]) AS rev_ids
      FROM public.stripe_orders AS o
     WHERE o.stripe_payment_intent_id = p_payment_intent_id
     ORDER BY o.id
       FOR UPDATE
  LOOP
    v_make_whole := v_row.mw;
    v_post_hoc := v_row.ph;
    v_mw_ids := v_row.mw_ids;
    v_rev_ids := v_row.rev_ids;
    v_did := false;

    IF NOT (p_refund_id = ANY (v_rev_ids)) THEN
      IF p_refund_id = ANY (v_mw_ids) THEN
        v_make_whole := GREATEST(v_make_whole - v_amount, 0);
        v_mw_ids := array_remove(v_mw_ids, p_refund_id);
      ELSE
        v_post_hoc := GREATEST(v_post_hoc - v_amount, 0);
      END IF;
      v_rev_ids := array_append(v_rev_ids, p_refund_id);
      v_did := true;
    END IF;

    v_full := COALESCE(v_row.amount_cents, 0) > 0
              AND (v_make_whole + v_post_hoc) >= v_row.amount_cents;
    -- Demote ONLY a 'refunded' order that is no longer fully refunded.
    v_status := CASE
                  WHEN v_row.status = 'refunded' AND NOT v_full THEN 'succeeded'
                  ELSE v_row.status
                END;

    IF v_did THEN
      UPDATE public.stripe_orders AS o
         SET make_whole_refunded_cents = v_make_whole,
             refunded_cents = v_post_hoc,
             make_whole_refund_ids = v_mw_ids,
             reversed_refund_ids = v_rev_ids,
             status = v_status,
             refunded_at = CASE WHEN v_full THEN o.refunded_at ELSE NULL END
       WHERE o.id = v_row.id;
    END IF;

    order_id := v_row.id;
    order_status := v_status;
    order_amount_cents := v_row.amount_cents;
    make_whole_cents := v_make_whole;
    post_hoc_cents := v_post_hoc;
    reversed := v_did;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_order_refund_cents(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_order_refund_cents(text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_order_refund_cents(text, text, integer) TO service_role;

-- Reversible down path (run manually to roll back — migrations are not
-- auto-reverted in this project):
--   DROP FUNCTION IF EXISTS public.record_order_refund_cents(text, integer, text, integer);
--   DROP FUNCTION IF EXISTS public.reverse_order_refund_cents(text, text, integer);
--   DROP INDEX IF EXISTS public.idx_stripe_orders_processing_fee_pending;
--   ALTER TABLE public.stripe_orders
--     DROP COLUMN IF EXISTS entry_subtotal_cents,
--     DROP COLUMN IF EXISTS platform_fee_cents,
--     DROP COLUMN IF EXISTS platform_fee_rate,
--     DROP COLUMN IF EXISTS stripe_processing_fee_cents,
--     DROP COLUMN IF EXISTS refunded_cents,
--     DROP COLUMN IF EXISTS make_whole_refunded_cents,
--     DROP COLUMN IF EXISTS make_whole_refund_ids,
--     DROP COLUMN IF EXISTS reversed_refund_ids;
