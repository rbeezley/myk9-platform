import { calculatePlatformFeeCents } from './platformFee.ts';

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

// ── THE REFUND STATUS INVARIANT (MYK9-54 review finding 1) ────────────────
//   stripe_orders.status = 'refunded'  IFF  the order is FULLY refunded, i.e.
//     make_whole_refunded_cents + refunded_cents >= amount_cents
//
// A PARTIALLY refunded order keeps status = 'succeeded' with a non-zero refund
// column; that pair is NORMAL, not drift. Reconciliation must read the refund
// COLUMNS, never `status <> 'refunded'`, to decide whether money came back.
//
// The transition is stamped in ONE place — `recompute_order_refund_totals`, which
// both refund RPCs funnel through — so status and amounts cannot disagree. It is
// RE-DERIVED from the refund ledger on every event, so it DEMOTES ('refunded' ->
// 'succeeded') when a refund fails just as readily as it promotes. `refunded_at`
// is derived from the same condition, so the two can never drift apart.

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

// NOTE: `resolveCumulativeRefundedCents` (a single conflated monotonic max) and
// `resolveOrderRefundSplit` (two monotonic counters mutated by a GREATEST
// forward path and a subtractive reversal path) were both REMOVED here. Counters
// cannot represent "this refund was UN-done", so the forward and reverse paths
// fought each other under Stripe's duplicate / out-of-order redelivery. Use the
// LEDGER helpers below: one row per Stripe refund, totals DERIVED. Do not
// reintroduce a counter-mutating helper.

export type OrderRefundKind = 'make_whole' | 'post_hoc';
export type OrderRefundState = 'succeeded' | 'failed';

/** One row of `public.stripe_order_refunds` — one Stripe refund. */
export interface OrderRefundLedgerRow {
  /** Stripe refund id. The PRIMARY KEY: idempotency BY CONSTRUCTION. */
  refundId: string;
  amountCents: number;
  kind: OrderRefundKind;
  state: OrderRefundState;
}

export interface OrderRefundTotals {
  makeWholeCents: number;
  postHocCents: number;
}

/**
 * Pure mirror of the `record_order_refund_cents` upsert (migration
 * 20260717120000). The DATABASE is the authority — this exists so the
 * precedence rules are unit-testable without a Postgres round trip. Keep the two
 * in lockstep; if you change one, change the other.
 *
 * A redelivery is an upsert of the SAME row, so it is a no-op on the totals.
 * Two precedence rules, matching the SQL `ON CONFLICT ... DO UPDATE`:
 *   - `kind` is NEVER overwritten. The make-whole writers book their own refund
 *     id with kind='make_whole' at creation time, and the later `charge.refunded`
 *     delivery — which cannot tell the kinds apart — must not demote it.
 *   - `state` is NEVER overwritten. FAILED IS TERMINAL: a redelivered success
 *     event for a refund Stripe already failed must not resurrect it. Stripe only
 *     moves a refund succeeded -> failed, never back, so the `failed` row is the
 *     newer truth no matter which delivery arrives last.
 */
export function upsertOrderRefund(
  ledger: readonly OrderRefundLedgerRow[],
  incoming: { refundId: string; amountCents?: number | null; kind?: OrderRefundKind }
): OrderRefundLedgerRow[] {
  const amountCents = toCentsOrNull(incoming.amountCents) ?? 0;
  const existing = ledger.find(row => row.refundId === incoming.refundId);
  if (!existing) {
    return [
      ...ledger,
      {
        refundId: incoming.refundId,
        amountCents,
        kind: incoming.kind ?? 'post_hoc',
        state: 'succeeded',
      },
    ];
  }
  return ledger.map(row =>
    row.refundId === incoming.refundId
      ? // kind and state are carried forward, never rewritten.
        { ...row, amountCents }
      : row
  );
}

/**
 * Pure mirror of `reverse_order_refund_cents`: a failed refund is a STATE CHANGE
 * on an EXISTING row, never a subtraction, and never an invented row. An
 * out-of-order `refund.failed` arriving before the booking event therefore
 * changes nothing — Stripe redelivers for three days and the later failure
 * settles it.
 */
export function failOrderRefund(
  ledger: readonly OrderRefundLedgerRow[],
  refundId: string
): OrderRefundLedgerRow[] {
  return ledger.map(row => (row.refundId === refundId ? { ...row, state: 'failed' } : row));
}

/**
 * Pure mirror of `recompute_order_refund_totals`. The derived cache columns:
 *   make_whole_refunded_cents = SUM(amount) WHERE kind='make_whole' AND succeeded
 *   refunded_cents            = SUM(amount) WHERE kind='post_hoc'   AND succeeded
 * Recomputation is idempotent and ORDER INDEPENDENT — that is the whole point.
 */
export function deriveOrderRefundTotals(
  ledger: readonly OrderRefundLedgerRow[]
): OrderRefundTotals {
  let makeWholeCents = 0;
  let postHocCents = 0;
  for (const row of ledger) {
    if (row.state !== 'succeeded') continue;
    if (row.kind === 'make_whole') makeWholeCents += row.amountCents;
    else postHocCents += row.amountCents;
  }
  return { makeWholeCents, postHocCents };
}

/**
 * Pure mirror of the status/`refunded_at` transition the recompute stamps.
 *   status = 'refunded'      IFF make_whole + post_hoc >= amount_cents
 *   refunded_at IS NOT NULL  IFF the same condition
 *
 * Because it is RE-DERIVED (not accumulated) it can now correctly DEMOTE as well
 * as promote: when a refund fails, a 'refunded' order falls back to 'succeeded'.
 * Only that pair ever moves — a 'failed', 'pending' or 'cancelled' order is never
 * rewritten. A partial refund stays 'succeeded' with non-zero refund columns,
 * which is NORMAL, not drift.
 */
export function resolveOrderStatusAfterRefund(
  order: { status: string; amountCents: number | null },
  refunds: OrderRefundTotals
): { status: string; fullyRefunded: boolean; refundedAt: 'set' | 'clear' } {
  const amount = order.amountCents ?? 0;
  const fullyRefunded = amount > 0 && refunds.makeWholeCents + refunds.postHocCents >= amount;
  let status = order.status;
  if (fullyRefunded && order.status === 'succeeded') status = 'refunded';
  else if (!fullyRefunded && order.status === 'refunded') status = 'succeeded';
  return { status, fullyRefunded, refundedAt: fullyRefunded ? 'set' : 'clear' };
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
  feePercent: number | null | undefined
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
  const pct = typeof feePercent === 'number' && Number.isFinite(feePercent) ? feePercent : 0;
  return {
    status: 'derived',
    entrySubtotalCents,
    platformFeeCents: calculatePlatformFeeCents(entrySubtotalCents, pct),
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
