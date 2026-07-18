// Platform-scope attention classification (unified-financial-dashboard, MYK9-54,
// tasks 4.1/4.2). Presentation-layer classification ONLY — this reuses the
// existing shared money-math (summarizePayoutSettlement, the reconciliation RPC
// wrappers) and does not reimplement any dollar calculation.
//
// Three genuine attention categories, each deliberately distinguished from a calm
// or self-healing counterpart so a normal pending state never renders red:
//
//   - failedTransferCount: payouts whose badge resolves to "Needs attention" via
//     the EXISTING resolvePayoutBadge/summarizePayoutSettlement vocabulary. A
//     "Retrying" self-healing payout (resolvePayoutBadge's isSelfHealingFailure
//     allowlist — a card-clearing balance delay, a stale 'processing' row, or a
//     transient post-claim entries load) is EXCLUDED, same as the treasurer view.
//     SUPERSEDED failures are excluded too: cron-process-payouts leaves the failed
//     row in place and INSERTs a new row for the retry, so a show can hold an old
//     'failed' row AND a later completed/pending one. The unique index
//     `show_payouts_one_live_per_show` is `(show_id) WHERE status <> 'failed'`, so
//     a show has AT MOST ONE non-failed ("live") row — a failed row is therefore
//     genuinely outstanding only when its show has NO live row. Without this, a
//     historical failure that was retried and paid would be reported as an
//     attention item forever. Same rule the reconciliation RPC applies server-side
//     for payout_failed_cents/count, so the two views agree.
//
//   - refundLedgerDriftCount: orders whose OWN recorded refund ledger contradicts
//     itself. See the extended note on the rule below — the previous rule
//     ("refundedCents > 0 && status !== 'refunded'") fired on every normal
//     PARTIAL refund, which is the single most common in-app refund flow, and was
//     pinned as intended behavior by its own test.
//
//   - chargeMismatchCount: entry orders whose snapshot IS present but does not
//     tie — amount_cents != entry_subtotal + platform_fee + make_whole_refunded
//     beyond the rounding tolerance. Classified with the SAME
//     resolveOrderChargeVerification helper the club treasurer view uses, so
//     /admin/payouts and /club-admin/payments can never disagree about whether a
//     given order is a "Mismatch". Including the make-whole term is what stops
//     every legitimate cart-overflow order from being flagged here.
//
//   - missingPlatformFeeSnapshotCount: legacy entry orders with NO usable
//     snapshot (the RPC's snapshot_missing_count = count(*) WHERE
//     platform_fee_cents IS NULL OR entry_subtotal_cents IS NULL — permanently
//     rate-unverifiable, pre-dates the snapshot contract). This is NOT a missing
//     PROCESSING fee, and it is
//     DIFFERENTLY calm than processingFeePendingCount, which is a newly-charged
//     order whose Stripe balance-transaction fee simply hasn't been captured. That
//     count stays part of the calm "pending" net income state and is NEVER counted
//     as attention here — but note it does NOT self-heal: nothing retries the fee
//     capture, so clearing it requires a manual backfill. It is calm because a
//     pending net figure is honest, not because it fixes itself.
//
// Note the two snapshot buckets are disjoint by construction: an order with a
// null subtotal/fee is counted ONLY by missingPlatformFeeSnapshotCount (server
// side), never also as a charge mismatch, so nothing is double-reported.
import type {
  FinancialReconciliationOrder,
  FinancialReconciliationPayout,
} from '../financialReconciliation';
import { resolveOrderChargeVerification } from '../chargeVerification';
import { summarizePayoutSettlement } from '../payoutSettlement';

export interface PlatformAttentionSummary {
  failedTransferCount: number;
  /** Orders whose recorded refund total contradicts their own status or amount. */
  refundLedgerDriftCount: number;
  /** Entry orders whose present snapshot does not tie to the charged amount. */
  chargeMismatchCount: number;
  /** Entry orders with no platform-fee snapshot at all (rate-unverifiable). */
  missingPlatformFeeSnapshotCount: number;
  totalCount: number;
}

export interface DerivePlatformAttentionInput {
  /** Legacy orders missing either snapshot column (permanently rate-unverifiable). */
  snapshotMissingCount: number;
  payouts: FinancialReconciliationPayout[];
  orders: FinancialReconciliationOrder[];
}

/**
 * REFUND LEDGER DRIFT — the root fix for the false red on every normal refund.
 *
 * The old rule counted `refundedCents > 0 && status !== 'refunded'` as drift. A
 * PARTIAL in-app refund legitimately leaves the order 'succeeded' with a
 * non-zero post-hoc refund, so the most ordinary refund in the product produced
 * a permanent attention item — exactly the "cries wolf" failure this module's
 * header claims to protect against. Its own test asserted that count as correct,
 * so no test could ever have caught it.
 *
 * What the category was AIMING at — "Stripe applied a refund the local record
 * never reflected" — is NOT detectable from local rows alone: if the refund was
 * never recorded, `refundedCents` is simply 0 and the row looks like an
 * unrefunded order. Only a Stripe-side comparison could see it. So the rule is
 * re-grounded on what local rows CAN falsify: an order that disagrees with
 * ITSELF, under the webhook's refund-attribution invariant
 * (migration 20260717120000) that `status = 'refunded'` iff the order is fully
 * refunded.
 *
 * Drift, all three genuinely impossible for a well-formed order:
 *   1. Recorded refunds EXCEED the amount charged — arithmetic corruption.
 *   2. status = 'refunded' but the recorded refund total is short of the amount
 *      — flipped to refunded while the money was never (fully) booked.
 *   3. Fully refunded post-hoc (refunds sum to the whole charge) but the status
 *      was never flipped — the status write was lost.
 *
 * Deliberately NOT drift: a partial post-hoc refund on a 'succeeded' order, a
 * full refund on a 'refunded' order, and any make-whole refund. Those are the
 * normal shapes of both the in-app and Stripe-dashboard refund paths.
 */
export function isRefundLedgerDrift(order: FinancialReconciliationOrder): boolean {
  const refundedTotal = order.refundedCents + order.makeWholeRefundedCents;
  // More returned than was ever charged — impossible, always drift.
  if (refundedTotal > order.amountCents) return true;

  // Otherwise drift is exactly a violation of the documented status invariant
  // (see 20260717120000_stripe_order_snapshots.sql):
  //     status = 'refunded'  IFF  make_whole + post_hoc >= amount_cents
  // Keying on the invariant rather than on `refundedCents > 0` matters: an order
  // refunded ENTIRELY via make-whole must still be stamped 'refunded', so
  // requiring a post-hoc component would silently hide a lost or hand-edited
  // status update on exactly those orders (Codex round-4 finding).
  // A PARTIAL refund on a 'succeeded' order is NORMAL and must never be drift.
  const shouldBeRefunded = refundedTotal > 0 && refundedTotal === order.amountCents;
  return (order.status === 'refunded') !== shouldBeRefunded;
}

export function derivePlatformAttention({
  snapshotMissingCount,
  payouts,
  orders,
}: DerivePlatformAttentionInput): PlatformAttentionSummary {
  // Drop failed rows SUPERSEDED by a retry before classifying (see the
  // failedTransferCount note above). A show with any non-failed ("live") payout
  // row has already been retried, so its old failed row is history, not an open
  // item. Mirrors the reconciliation RPC's server-side rule.
  const showsWithLivePayout = new Set(
    payouts.filter(p => p.status !== 'failed' && p.showId).map(p => p.showId as string)
  );
  const outstandingPayouts = payouts.filter(
    p => !(p.status === 'failed' && p.showId && showsWithLivePayout.has(p.showId))
  );

  // payoutsEnabled only changes the DISPLAY LABEL for a 'pending' status
  // (Scheduled vs Waiting for account) — it never changes which bucket a row
  // lands in, so a fixed value is safe for attention counting across clubs.
  const settlement = summarizePayoutSettlement(outstandingPayouts, true);
  const failedTransferCount = settlement.attentionCount;

  const refundLedgerDriftCount = orders.filter(isRefundLedgerDrift).length;

  // Reuse the club view's rule verbatim. Orders with a null subtotal/fee are
  // already counted by the server's snapshot_missing_count, so they are skipped
  // here rather than double-counted as a mismatch.
  const chargeMismatchCount = orders.filter(
    order =>
      order.entrySubtotalCents != null &&
      order.platformFeeCents != null &&
      resolveOrderChargeVerification(order) === 'Mismatch'
  ).length;

  const missingPlatformFeeSnapshotCount = snapshotMissingCount;

  return {
    failedTransferCount,
    refundLedgerDriftCount,
    chargeMismatchCount,
    missingPlatformFeeSnapshotCount,
    totalCount:
      failedTransferCount +
      refundLedgerDriftCount +
      chargeMismatchCount +
      missingPlatformFeeSnapshotCount,
  };
}
