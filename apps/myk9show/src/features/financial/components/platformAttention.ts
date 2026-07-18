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
//
//   - unrecordedRefundCount: orders with refundedCents > 0 whose status was never
//     flipped to 'refunded' (stripe_orders.status stays 'succeeded'). A refund
//     that Stripe applied but the local record never reflected is a genuine
//     data-integrity drift, not a timing artifact — there is no "pending" state
//     for this field the way there is for processing fees.
//
//   - missingProcessingFeeCount: legacy orders with NO platform-fee snapshot at
//     all (snapshotMissingCount — permanently rate-unverifiable, pre-dates the
//     snapshot contract). This is DIFFERENTLY calm than
//     processingFeePendingCount, which is a newly-charged order whose Stripe
//     balance-transaction fee simply hasn't arrived yet and self-heals once the
//     webhook/backfill runs — that count stays part of the calm "pending" net
//     income state and is NEVER counted as attention here.
import type {
  FinancialReconciliationOrder,
  FinancialReconciliationPayout,
} from '../financialReconciliation';
import { summarizePayoutSettlement } from '../payoutSettlement';

export interface PlatformAttentionSummary {
  failedTransferCount: number;
  unrecordedRefundCount: number;
  missingProcessingFeeCount: number;
  totalCount: number;
}

export interface DerivePlatformAttentionInput {
  /** Legacy orders with no platform-fee snapshot (permanently rate-unverifiable). */
  snapshotMissingCount: number;
  payouts: FinancialReconciliationPayout[];
  orders: FinancialReconciliationOrder[];
}

export function derivePlatformAttention({
  snapshotMissingCount,
  payouts,
  orders,
}: DerivePlatformAttentionInput): PlatformAttentionSummary {
  // payoutsEnabled only changes the DISPLAY LABEL for a 'pending' status
  // (Scheduled vs Waiting for account) — it never changes which bucket a row
  // lands in, so a fixed value is safe for attention counting across clubs.
  const settlement = summarizePayoutSettlement(payouts, true);
  const failedTransferCount = settlement.attentionCount;

  const unrecordedRefundCount = orders.filter(
    order => order.refundedCents > 0 && order.status !== 'refunded'
  ).length;

  const missingProcessingFeeCount = snapshotMissingCount;

  return {
    failedTransferCount,
    unrecordedRefundCount,
    missingProcessingFeeCount,
    totalCount: failedTransferCount + unrecordedRefundCount + missingProcessingFeeCount,
  };
}
