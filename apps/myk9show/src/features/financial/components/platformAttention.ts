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
//   - unrecordedRefundCount: orders with a POST-HOC refundedCents > 0 whose status
//     was never flipped to 'refunded' (stripe_orders.status stays 'succeeded'). A
//     refund that Stripe applied but the local record never reflected is a genuine
//     data-integrity drift, not a timing artifact — there is no "pending" state
//     for this field the way there is for processing fees. Cart-overflow
//     make-whole refunds are deliberately NOT counted: they are a normal part of
//     an accepted order's lifecycle and do not imply a status flip.
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
  unrecordedRefundCount: number;
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

  const unrecordedRefundCount = orders.filter(
    order => order.refundedCents > 0 && order.status !== 'refunded'
  ).length;

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
    unrecordedRefundCount,
    chargeMismatchCount,
    missingPlatformFeeSnapshotCount,
    totalCount:
      failedTransferCount +
      unrecordedRefundCount +
      chargeMismatchCount +
      missingPlatformFeeSnapshotCount,
  };
}
