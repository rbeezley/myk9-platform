import {
  calculatePlatformFeeCents,
  normalizePlatformFeeRates,
  type PlatformFeeRates,
} from './platformFee.ts';

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
// ── ZERO IS ALWAYS A REAL ZERO (MYK9-232, traced 2026-08-22) ───────────────
// `entry_subtotal_cents` and `platform_fee_cents` distinguish "captured" from
// "not captured" by NULL, and two readers depend on it —
// `aggregateShowOrders` (net-to-club goes `pending` on NULL) and
// `resolveOrderChargeVerification` (NULL → `NoFeeBreakdown`). Both would read a
// stored 0 as a captured value, so the question is whether an UNCAPTURED
// value can ever land as 0. It cannot. Every write path was traced:
//
//   * `resolveAcceptedEntrySnapshot` is the only producer, reached from
//     exactly two call sites (the stripe-webhook cart path and the
//     payment-link path). When any accepted entry is missing a fee it returns
//     status 'unverifiable' with BOTH columns null — ignorance stays NULL.
//   * Its zero case is the deliberate one below: nothing accepted, so no
//     service was rendered and no fee earned. A known zero, not a gap.
//   * The subtotal is a sum of `Math.max(0, round(fee))` terms, so it cannot
//     be negative; `calculatePlatformFeeCents` returns 0 for a non-positive
//     subtotal or rate and a positive round otherwise. Neither can go below 0.
//   * `toCentsOrNull` therefore never sees a negative for THESE two columns —
//     its `rounded < 0 ? 0` clamp is unreachable from here. Leave the clamp:
//     it guards the other cent fields, and a guard that is dead over today's
//     inputs is exactly the kind that wakes up when the set is partitioned.
//
// So a 0 in either column means a genuine zero-dollar order, and no read site
// needs a special case. What IS reachable is a legitimately-zero order
// reaching `resolveOrderChargeVerification` and earning the confident label:
// a fully make-whole-refunded order stores 0/0 (four exist on staging). The
// arithmetic is right — the club is owed nothing — but the badge claims a
// Stripe check over a charge of nothing. That is MYK9-230's subject, not a
// defect in these columns.
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

// ── THE REFUND STATUS INVARIANT (MYK9-54 review finding 1) ────────────────
//   stripe_orders.status = 'refunded'  IFF  the order is FULLY refunded, i.e.
//     make_whole_refunded_cents + refunded_cents >= amount_cents
//
// A PARTIALLY refunded order keeps status = 'succeeded' with a non-zero refund
// column; that pair is NORMAL, not drift. Reconciliation must read the refund
// COLUMNS, never `status <> 'refunded'`, to decide whether money came back.
//
// The transition is stamped in ONE place — `recompute_order_refund_totals`, which
// both refund RPCs funnel through. It is RE-DERIVED from the refund ledger on
// every terminal event, so it DEMOTES ('refunded' -> 'succeeded') when a refund
// fails just as readily as it promotes. `refunded_at` follows the derived status;
// pending/processing/failed/cancelled orders retain their status and no timestamp.

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

export interface AcceptedEntrySnapshot {
  /** `derived` = authoritative; `unverifiable` = a fee was missing, columns NULL. */
  status: 'derived' | 'unverifiable';
  entrySubtotalCents: number | null;
  platformFeeCents: number | null;
  missingFeeEntryIds: string[];
}

/**
 * Build the snapshot money fields for a payment-LINK order from the ACCEPTED
 * entries and their authoritative Checkout line-item fees — the same shape the
 * cart path uses (paid lines summed, fee computed on that subtotal at the
 * stamped rate).
 *
 * REPLACES `deriveEntryFeeFromTotalCents` (MYK9-54 review finding 2), which
 * back-derived the split from the FULL session total. That total includes lines
 * that were never accepted (deleted / inactive / already-paid entries the
 * webhook then make-whole refunds), so it (a) overstated `platform_fee_cents` on
 * every partial-invalid link order, and (b) made `subtotal + fee == amount` true
 * BY CONSTRUCTION — so the tie-out
 *   amount == subtotal + fee + make_whole
 * failed by exactly the refund whenever make_whole > 0, and was a pure tautology
 * whenever it was 0. Deriving from accepted entries makes both sides independent
 * and the tie-out genuinely falsifiable.
 *
 * When any accepted entry has no line-item fee (Stripe's 100-item page cap, or
 * missing price/product metadata) the amounts are reported `unverifiable` and
 * the columns stay NULL. NULL already means "rate-unverifiable / net-pending"
 * for legacy rows; a guessed number would silently enter income reporting.
 */
export function resolveAcceptedEntrySnapshot(
  acceptedEntryIds: string[],
  entryFeesById: Map<string, number>,
  feeRates: PlatformFeeRates | null | undefined
): AcceptedEntrySnapshot {
  const missingFeeEntryIds = acceptedEntryIds.filter(id => !entryFeesById.has(id));
  if (acceptedEntryIds.length === 0) {
    // Nothing was accepted: no service rendered, no fee earned. That is a known
    // zero, not an unverifiable gap (the whole charge is make-whole refunded).
    return {
      status: 'derived',
      entrySubtotalCents: 0,
      platformFeeCents: 0,
      missingFeeEntryIds: [],
    };
  }
  if (missingFeeEntryIds.length > 0) {
    return {
      status: 'unverifiable',
      entrySubtotalCents: null,
      platformFeeCents: null,
      missingFeeEntryIds,
    };
  }
  const entrySubtotalCents = acceptedEntryIds.reduce(
    (sum, id) => sum + Math.max(0, Math.round(entryFeesById.get(id) ?? 0)),
    0
  );
  // The WHOLE fee on the accepted subtotal — flat per-checkout component and
  // floor included — is booked here, because the platform earned both the moment
  // the charge happened and neither belongs to any particular line.
  //
  // THIS IS ONLY CONSISTENT BECAUSE THE MAKE-WHOLE WRITERS AGREE. The tie-out
  //   amount_cents == entry_subtotal_cents + platform_fee_cents + make_whole_refunded_cents
  // balances only if the refund leaves the flat and the floor on this side.
  // An earlier revision of this comment claimed the flat "cancels out of the
  // make-whole difference exactly as the percentage share does" — it does not,
  // and it did not: both writers then split the charge PROPORTIONALLY over the
  // full session total, spreading the flat and the floor across the invalid
  // lines. Executed at flat = 30¢ on a 2-entry $25 link with one entry invalid,
  // that refunded 15¢ of the platform's own flat fee and booked 205¢ here
  // against 190¢ actually retained; at minCents = 2000 on two $1 entries the
  // gap was $10. Both writers now go through `makeWholeRefundCents`
  // (MYK9-197 adversarial review, B1), which derives the refund from the entry
  // fee data as invalidSubtotal + (fee(full) − fee(accepted)).
  //
  // So: do not change `makeWholeRefundCents` back to a proportional split, and
  // do not book a partial fee here, without breaking the other. The tie-out
  // cases in orderSnapshot.test.ts run at non-zero flat AND non-zero floor
  // precisely so the pair cannot drift apart again.
  const rates = normalizePlatformFeeRates(
    feeRates ?? { percent: 0, flatCents: 0, minCents: 0 }
  );
  return {
    status: 'derived',
    entrySubtotalCents,
    platformFeeCents: calculatePlatformFeeCents(entrySubtotalCents, rates),
    missingFeeEntryIds: [],
  };
}

/**
 * Signed tie-out residual for one order, in cents:
 *   amount_cents − (entry_subtotal_cents + platform_fee_cents + make_whole_refunded_cents)
 * Returns null when the snapshot columns are NULL (legacy / unverifiable rows),
 * which are not checkable rather than failing.
 *
 * TOLERANCE: both refund writers split a charge PROPORTIONALLY
 * (round(total × invalidSubtotal / subtotal)), and the fee itself is rounded, so
 * a healthy partially-refunded order can land up to
 * `ORDER_TIE_OUT_TOLERANCE_CENTS` off. Anything beyond that is genuine drift.
 */
export function orderTieOutDeltaCents(order: {
  amount_cents: number | null;
  entry_subtotal_cents: number | null;
  platform_fee_cents: number | null;
  make_whole_refunded_cents?: number | null;
}): number | null {
  if (order.entry_subtotal_cents === null || order.platform_fee_cents === null) return null;
  return (
    (order.amount_cents ?? 0) -
    (order.entry_subtotal_cents + order.platform_fee_cents + (order.make_whole_refunded_cents ?? 0))
  );
}

/** Rounding slack allowed on the tie-out; see `orderTieOutDeltaCents`. */
export const ORDER_TIE_OUT_TOLERANCE_CENTS = 2;

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

// NOTE: `deriveEntryFeeFromTotalCents` was REMOVED here (MYK9-54 review finding
// 2). It back-derived the entry/fee split from the FULL Checkout session total,
// which includes lines that were never accepted — overstating platform fee
// income and making the tie-out either tautological or permanently failed. Use
// `resolveAcceptedEntrySnapshot` above; do not reintroduce a total-derived
// split.

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

/**
 * Metadata key stamped on a Stripe refund the platform issues to MAKE THE
 * CUSTOMER WHOLE for lines that were never accepted (cart overflow /
 * payment-link make-whole).
 *
 * Why it lives on the STRIPE OBJECT and not only in our ledger: the
 * `charge.refunded` sweep can arrive BEFORE the writer that issued the refund
 * books its own row, and the ledger upsert deliberately never overwrites `kind`
 * (so a redelivery cannot relabel history). Without a marker Stripe carries on
 * every delivery, whichever event lands first decides the kind — and a
 * make-whole refund booked as `post_hoc` is permanently counted as a platform
 * loss and can understate the club payout.
 */
export const MAKE_WHOLE_METADATA_KEY = 'myk9_make_whole';

export type OrderRefundKind = 'make_whole' | 'post_hoc';

/**
 * Decide a refund's kind from the Stripe object. Defaults to `post_hoc`: an
 * ordinary refund (secretary-issued, dashboard, show cancellation) IS a real
 * platform loss, and only the platform's own make-whole writers stamp the key.
 */
export function refundKindFromMetadata(refund: {
  metadata?: Record<string, string> | null;
}): OrderRefundKind {
  return refund?.metadata?.[MAKE_WHOLE_METADATA_KEY] === 'true' ? 'make_whole' : 'post_hoc';
}
