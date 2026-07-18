// Pure helpers for the immutable Stripe order snapshot (financial-reconciliation,
// MYK9-54). Keep this module free of Deno/npm imports so the colocated vitest
// runs under Node — same contract as platformFee.ts.
//
// The snapshot records the authoritative, cent-based financial facts of a single
// online charge AT CHARGE TIME so a later platform_fee_percent change never
// rewrites historical income:
//   - entry_subtotal_cents        the paid entry service amount
//   - platform_fee_cents          the platform fee charged
//   - platform_fee_rate           the fee percent applied (immutable)
//   - stripe_processing_fee_cents Stripe's balance-transaction fee, or NULL when
//                                 not yet available (explicitly PENDING, never 0)
//   - refunded_cents              total refunded to the customer (0 until refunded)
//
// A missing processing fee is PENDING (null), never an estimated zero: net
// income cannot be finalized until Stripe's actual balance-transaction fee is
// captured.
//
// ── THE COLLECTION INVARIANT (do not break) ────────────────────────────────
//   stripe_orders.amount_cents   = the GROSS amount the customer was actually
//                                  charged for this order (Stripe's
//                                  session.amount_total / payment intent
//                                  amount). It is NEVER pre-netted by a refund.
//   stripe_orders.refunded_cents = the CUMULATIVE amount returned to the
//                                  customer on that charge, from ANY source:
//                                  per-entry app refunds, cart-overflow /
//                                  payment-link make-whole auto-refunds, bulk
//                                  show-cancellation refunds, and Stripe
//                                  dashboard refunds alike.
// Therefore  collected = amount_cents − refunded_cents  subtracts a refund
// EXACTLY ONCE. Pre-netting a refund out of amount_cents *and* recording it in
// refunded_cents double-subtracts it and can drive a fully-refunded order
// negative (MYK9-54 review finding A).
//
// The snapshot fields (entry_subtotal_cents / platform_fee_cents) are a
// different measure and intentionally do NOT have to sum to amount_cents: they
// describe the services actually rendered (paid entries only) and the fee
// earned on them, whereas amount_cents/refunded_cents describe cash movement.
// A cart with overflow lines charges for lines it then refunds, so
// amount_cents > entry_subtotal_cents + platform_fee_cents by the refunded
// share. That gap is the refund, and it is reported by refunded_cents.

export interface OrderSnapshotInput {
  entrySubtotalCents?: number | null;
  platformFeeCents?: number | null;
  platformFeeRate?: number | null;
  /** Null/undefined => pending (balance transaction not yet available). */
  stripeProcessingFeeCents?: number | null;
  refundedCents?: number | null;
}

/** Column-shaped snapshot ready to spread into a `stripe_orders` insert. */
export interface OrderSnapshotFields {
  entry_subtotal_cents: number | null;
  platform_fee_cents: number | null;
  platform_fee_rate: number | null;
  stripe_processing_fee_cents: number | null;
  refunded_cents: number;
}

/** Coerce to a non-negative integer cent value, or null when absent/invalid. */
function toCentsOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded < 0 ? 0 : rounded;
}

/**
 * Normalize raw charge-time values into the immutable snapshot column shape.
 *
 * - Cent fields round to integers and clamp negatives to 0.
 * - `stripe_processing_fee_cents` stays NULL when the fee is not yet known — a
 *   missing processing fee is explicitly pending, NEVER coerced to 0.
 * - `refunded_cents` defaults to 0 (an unrefunded order), never NULL.
 * - `platform_fee_rate` is preserved as-is when finite, else NULL.
 */
export function buildOrderSnapshotFields(input: OrderSnapshotInput): OrderSnapshotFields {
  const rate = input.platformFeeRate;
  return {
    entry_subtotal_cents: toCentsOrNull(input.entrySubtotalCents),
    platform_fee_cents: toCentsOrNull(input.platformFeeCents),
    platform_fee_rate: typeof rate === 'number' && Number.isFinite(rate) ? rate : null,
    // Distinct from the cent fields: preserve NULL as "pending", do not clamp
    // an absent value into 0.
    stripe_processing_fee_cents: toCentsOrNull(input.stripeProcessingFeeCents),
    refunded_cents: toCentsOrNull(input.refundedCents) ?? 0,
  };
}

/**
 * Reconcile a cumulative refunded total onto an order, enforcing the collection
 * invariant documented at the top of this module.
 *
 * Stripe's `charge.amount_refunded` is CUMULATIVE and only ever grows, so the
 * resolved value is monotonic: it never lowers an already-recorded total. That
 * makes every writer safe and order-independent —
 *   - a duplicate `charge.refunded` delivery re-applies the same value (no-op),
 *   - an out-of-order delivery (partial refund event arriving after the second
 *     partial) cannot roll the total back,
 *   - the cart-overflow auto-refund writer and the `charge.refunded` handler
 *     can race without either clobbering the other's larger total.
 *
 * Non-finite / negative inputs clamp to 0 rather than corrupting money math.
 */
export function resolveCumulativeRefundedCents(
  existingCents: number | null | undefined,
  incomingCents: number | null | undefined
): number {
  return Math.max(toCentsOrNull(existingCents) ?? 0, toCentsOrNull(incomingCents) ?? 0);
}

/**
 * Extract Stripe's processing fee (cents) from a charge's balance transaction.
 * Returns null when the balance transaction is not expanded or not yet
 * available (delayed data) — the caller must treat null as PENDING, not zero.
 */
export function extractProcessingFeeCents(
  charge:
    | {
        balance_transaction?: string | { fee?: number | null } | null;
      }
    | null
    | undefined
): number | null {
  const bt = charge?.balance_transaction;
  // A string is the unexpanded id; absence means the fee is not yet retrievable.
  if (!bt || typeof bt === 'string') return null;
  const fee = bt.fee;
  return typeof fee === 'number' && Number.isFinite(fee) ? Math.round(fee) : null;
}

/**
 * Split a charged total (entry subtotal + platform fee) back into its parts
 * given the applied fee percent. Used where only the paid total is on hand (the
 * entry payment-link path). Inverse of `total = subtotal + round(subtotal*pct/100)`;
 * may differ by at most 1 cent from the original subtotal in rounding-boundary
 * cases, which is acceptable for a historical snapshot.
 */
export function deriveEntryFeeFromTotalCents(
  totalCents: number | null | undefined,
  feePercent: number | null | undefined
): { entrySubtotalCents: number; platformFeeCents: number } {
  const total =
    typeof totalCents === 'number' && Number.isFinite(totalCents) ? Math.round(totalCents) : 0;
  if (total <= 0) return { entrySubtotalCents: 0, platformFeeCents: 0 };
  if (typeof feePercent !== 'number' || !Number.isFinite(feePercent) || feePercent <= 0) {
    return { entrySubtotalCents: total, platformFeeCents: 0 };
  }
  const subtotal = Math.round((total * 100) / (100 + feePercent));
  return { entrySubtotalCents: subtotal, platformFeeCents: total - subtotal };
}

/** Platform GROSS fee income for one order: the fee charged, before costs. */
export function platformGrossFeeCents(fields: { platform_fee_cents: number | null }): number {
  return fields.platform_fee_cents ?? 0;
}

export type PlatformNetIncome =
  { status: 'available'; netCents: number } | { status: 'pending'; grossCents: number };

/**
 * Platform NET income for one order:
 *   gross platform fee − captured Stripe processing fee − platform-absorbed refund.
 *
 * Refund architecture (verified against stripe-refund-entry / stripe-refund-show):
 * neither refund path passes `reverse_transfer` or `refund_application_fee`, so
 * the full customer refund is paid from the PLATFORM balance while the club keeps
 * its transfer. The platform therefore absorbs the ENTIRE amount of such a refund,
 * not merely the fee portion.
 *
 * CALLER CONTRACT: `absorbedRefundCents` must be the POST-HOC absorbed amount, NOT
 * the order's raw `refunded_cents`. That column is the cumulative record of every
 * refund and also includes cart-overflow "make-whole" auto-refunds for lines that
 * were denied / waitlisted / never served. The platform earned no fee on those
 * lines (`platform_fee_cents` covers `entry_subtotal_cents`, i.e. paid lines only)
 * and made no club transfer for them, so that money is collected-and-returned, not
 * a loss. Passing the raw total makes net income read falsely negative. Derive it
 * per order as:
 *   overflowPortion   = max(0, amount_cents − entry_subtotal_cents − platform_fee_cents)
 *   absorbedRefund    = max(0, refunded_cents − overflowPortion)
 * For a normal order (amount = subtotal + fee) this equals `refunded_cents`.
 * A genuine post-hoc refund can legitimately drive net negative.
 *
 * When the Stripe processing fee has not been captured yet the result is
 * `pending` (never treated as zero) so a dashboard can label the pending
 * component rather than overstating net income.
 */
export function platformNetIncomeCents(
  fields: {
    platform_fee_cents: number | null;
    stripe_processing_fee_cents: number | null;
  },
  reversals: { absorbedRefundCents?: number } = {}
): PlatformNetIncome {
  const gross = platformGrossFeeCents(fields);
  if (fields.stripe_processing_fee_cents === null) {
    return { status: 'pending', grossCents: gross };
  }
  const absorbedRefund = reversals.absorbedRefundCents ?? 0;
  return {
    status: 'available',
    netCents: gross - fields.stripe_processing_fee_cents - absorbedRefund,
  };
}
