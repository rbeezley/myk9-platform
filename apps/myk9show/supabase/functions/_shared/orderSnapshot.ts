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
// ── THE COLLECTION / ATTRIBUTION INVARIANT (do not break) ──────────────────
//   stripe_orders.amount_cents = the GROSS amount the customer was actually
//                                charged for this order (Stripe's
//                                session.amount_total / payment intent
//                                amount). It is NEVER pre-netted by a refund.
//
// Refunds split across TWO columns because they are economically OPPOSITE
// events. A single conflated column forced every consumer to re-derive the
// split as amount − subtotal − fee, and that derivation is unsound: it makes
// charge verification tautological, so an overflow order can never
// independently fail a tie-out. The split is now recorded EXPLICITLY at write
// time by whichever writer issues the refund.
//
//   make_whole_refunded_cents = returned for lines NEVER accepted (cart
//                               overflow / payment-link make-whole). The
//                               platform earned no fee and no club transfer
//                               occurred → NOT a platform loss.
//   refunded_cents            = POST-HOC refunds only (the entry WAS accepted,
//                               the club kept its transfer, the platform repays
//                               from its own balance) → a real platform loss.
//
//   collected = amount_cents − make_whole_refunded_cents − refunded_cents
//   ties out  = amount_cents == entry_subtotal_cents
//                             + platform_fee_cents
//                             + make_whole_refunded_cents
//
// Each refund is subtracted EXACTLY ONCE. Pre-netting a refund out of
// amount_cents *and* recording it in a refund column double-subtracts it and
// can drive a fully-refunded order negative (MYK9-54 review finding A).
//
// The snapshot fields (entry_subtotal_cents / platform_fee_cents) describe the
// services actually rendered (paid entries only) and the fee earned on them,
// whereas amount_cents and the refund columns describe cash movement. A cart
// with overflow lines charges for lines it then refunds, so
// amount_cents > entry_subtotal_cents + platform_fee_cents by exactly
// make_whole_refunded_cents — which is now the tie-out above, not a guess.

export interface OrderSnapshotInput {
  entrySubtotalCents?: number | null;
  platformFeeCents?: number | null;
  platformFeeRate?: number | null;
  /** Null/undefined => pending (balance transaction not yet available). */
  stripeProcessingFeeCents?: number | null;
  /** POST-HOC refunds only. */
  refundedCents?: number | null;
  /** Make-whole refunds only (lines never accepted). */
  makeWholeRefundedCents?: number | null;
}

/** Column-shaped snapshot ready to spread into a `stripe_orders` insert. */
export interface OrderSnapshotFields {
  entry_subtotal_cents: number | null;
  platform_fee_cents: number | null;
  platform_fee_rate: number | null;
  stripe_processing_fee_cents: number | null;
  refunded_cents: number;
  make_whole_refunded_cents: number;
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
 * - both refund columns default to 0 (an unrefunded order), never NULL.
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
    make_whole_refunded_cents: toCentsOrNull(input.makeWholeRefundedCents) ?? 0,
  };
}

// NOTE: `resolveCumulativeRefundedCents` (a single-column monotonic max) was
// REMOVED here. It could only maintain one conflated refund total, which is the
// bug this module now fixes. Use `resolveOrderRefundSplit` below — reintroducing
// a single-column helper would re-merge the two economically opposite refund
// kinds and make charge verification tautological again.

export interface OrderRefundSplit {
  makeWholeCents: number;
  postHocCents: number;
}

/**
 * Pure mirror of the `record_order_refund_cents` SQL (migration
 * 20260717120000). The DATABASE is the authority — this exists so the
 * attribution algebra is unit-testable without a Postgres round trip. Keep the
 * two in lockstep; if you change one, change the other.
 *
 * THE ATTRIBUTION PROBLEM: `charge.refunded` fires for BOTH kinds of refund and
 * Stripe reports a single CUMULATIVE `charge.amount_refunded`. Treating that
 * total as post-hoc would double count every make-whole refund, since the
 * make-whole writer already recorded its own amount.
 *
 * THE RULE: the cumulative charge total is the TOTAL across both columns, and
 * the post-hoc part is DERIVED as total − make_whole:
 *   newMakeWhole = max(storedMakeWhole, incomingMakeWhole)
 *   newTotal     = max(storedMakeWhole + storedPostHoc, incomingChargeTotal,
 *                      newMakeWhole)
 *   newPostHoc   = newTotal − newMakeWhole
 *
 * The stored total is recoverable as the sum of the two columns, so no extra
 * bookkeeping column is needed. Both inputs are monotonic and newPostHoc is a
 * pure function of them, so the row CONVERGES to the same values under any
 * delivery order:
 *   - a duplicate delivery re-applies identical values (no-op),
 *   - an out-of-order `charge.refunded` landing before its make-whole writer is
 *     provisionally booked as post-hoc, then REATTRIBUTED (not double counted)
 *     when the make-whole writer catches up,
 *   - neither column can be lowered by a stale/smaller delivery,
 *   - seeding newTotal with newMakeWhole keeps total >= makeWhole, so postHoc
 *     can never go negative even if `charge.refunded` never arrives.
 *
 * Pass `incomingChargeTotalCents: null` from a make-whole writer, which knows
 * its own refund amount but not the charge-wide cumulative total.
 */
export function resolveOrderRefundSplit(
  stored: { makeWholeCents?: number | null; postHocCents?: number | null },
  incoming: { makeWholeCents?: number | null; chargeTotalCents?: number | null }
): OrderRefundSplit {
  const storedMakeWhole = toCentsOrNull(stored.makeWholeCents) ?? 0;
  const storedPostHoc = toCentsOrNull(stored.postHocCents) ?? 0;
  const incomingMakeWhole = toCentsOrNull(incoming.makeWholeCents) ?? 0;
  const incomingChargeTotal = toCentsOrNull(incoming.chargeTotalCents) ?? 0;

  const makeWholeCents = Math.max(storedMakeWhole, incomingMakeWhole);
  const totalCents = Math.max(storedMakeWhole + storedPostHoc, incomingChargeTotal, makeWholeCents);
  return { makeWholeCents, postHocCents: totalCents - makeWholeCents };
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
 * CALLER CONTRACT: `absorbedRefundCents` is the POST-HOC absorbed amount, which is
 * now simply the order's `refunded_cents` column — pass it directly.
 *
 * Do NOT re-derive the split as
 *   overflowPortion = max(0, amount_cents − entry_subtotal_cents − platform_fee_cents)
 * as an earlier revision of this file instructed. That derivation was unsound: it
 * ASSUMES the tie-out it is supposed to check, which makes charge verification
 * tautological — an overflow order could never independently fail. Make-whole
 * refunds are recorded explicitly at write time in `make_whole_refunded_cents`
 * (see the attribution invariant at the top of this module), so the two kinds no
 * longer have to be teased apart after the fact.
 *
 * Make-whole refunds must NOT be passed here: the platform earned no fee on those
 * lines (`platform_fee_cents` covers `entry_subtotal_cents`, i.e. paid lines only)
 * and made no club transfer for them, so that money is collected-and-returned, not
 * a loss. Including it makes net income read falsely negative. A genuine post-hoc
 * refund can legitimately drive net negative.
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
