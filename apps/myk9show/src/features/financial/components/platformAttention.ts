// Platform-scope attention classification (unified-financial-dashboard, MYK9-54,
// tasks 4.1/4.2). Presentation-layer classification ONLY — this reuses the
// existing shared money-math (summarizePayoutSettlement, the reconciliation RPC
// wrappers) and does not reimplement any dollar calculation.
//
// ── WHY THIS MODULE IS SMALL ───────────────────────────────────────────────
// It used to carry two more categories, `chargeMismatchCount` and
// `refundLedgerDriftCount`. Both were INFERENCES: they tried to conclude "this
// order's money is wrong" from local rows alone. Doing that correctly requires
// perfect knowledge of states the rows do not record —
//   - LEGACY orders written before the snapshot contract (no snapshot at all),
//   - MANUAL cash/check/desk payments and desk-recorded refunds that never
//     touched Stripe,
//   - PARTIAL refunds, which legitimately leave a 'succeeded' order with a
//     non-zero refund total,
//   - ROUNDING residue from the proportional refund split.
// Each of those rendered RED on a perfectly normal state, and every round of
// fixes to one heuristic re-broke another. On a calm-oversight surface a false
// red is worse than no signal at all (docs/INTENT.md, site-admin feeling), so
// the inference-based categories are DELETED rather than tuned again.
//
// A future version can do this properly, but it needs a RECORDED signal rather
// than a derived one — e.g. a stored Stripe-side reconciliation result, or an
// explicit operator-acknowledged discrepancy row. Until such a fact exists, this
// module reports only facts.
//
// ── WHAT REMAINS ───────────────────────────────────────────────────────────
//
//   - failedTransferCount: payouts whose badge resolves to "Needs attention" via
//     the EXISTING resolvePayoutBadge/summarizePayoutSettlement vocabulary,
//     grounded in the real show_payouts.status column. A "Retrying" self-healing
//     payout (resolvePayoutBadge's isSelfHealingFailure allowlist — a
//     card-clearing balance delay, a stale 'processing' row, or a transient
//     post-claim entries load) is EXCLUDED, same as the treasurer view.
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
//   - missingPlatformFeeSnapshotCount: a factual server-side COUNT, not an
//     inference — the RPC's snapshot_missing_count = count(*) WHERE
//     platform_fee_cents IS NULL OR entry_subtotal_cents IS NULL. These orders are
//     permanently rate-unverifiable because they pre-date the snapshot contract.
//     This is NOT a missing PROCESSING fee, and it is DIFFERENTLY calm than
//     processingFeePendingCount, which is a newly-charged order whose Stripe
//     balance-transaction fee simply hasn't been captured. That count stays part
//     of the calm "pending" net income state and is NEVER counted as attention
//     here — but note it does NOT self-heal: nothing retries the fee capture, so
//     clearing it requires a manual backfill. It is calm because a pending net
//     figure is honest, not because it fixes itself.
import type { FinancialReconciliationPayout } from '../financialReconciliation';
import { summarizePayoutSettlement } from '../payoutSettlement';

export interface PlatformAttentionSummary {
  failedTransferCount: number;
  /** Entry orders with no platform-fee snapshot at all (rate-unverifiable). */
  missingPlatformFeeSnapshotCount: number;
  totalCount: number;
}

export interface DerivePlatformAttentionInput {
  /** Legacy orders missing either snapshot column (permanently rate-unverifiable). */
  snapshotMissingCount: number;
  payouts: FinancialReconciliationPayout[];
}

export function derivePlatformAttention({
  snapshotMissingCount,
  payouts,
}: DerivePlatformAttentionInput): PlatformAttentionSummary {
  // Drop failed rows SUPERSEDED by a retry before classifying (see the
  // failedTransferCount note above). A show with any non-failed ("live") payout
  // row has already been retried, so its old failed row is history, not an open
  // item. Mirrors the reconciliation RPC's server-side rule.
  const showsWithLivePayout = new Set(
    payouts.filter(p => p.status !== 'failed' && p.showId).map(p => p.showId as string)
  );

  // REPEATED failures: show_payouts_one_live_per_show only bounds NON-failed
  // rows, so a show that fails, retries, and fails AGAIN holds two failed rows
  // and neither is superseded by a live row. Counting both would report the same
  // owed money once per retry attempt. Keep only the latest attempt per show —
  // the same rule the reconciliation RPC applies server-side, so the two views
  // cannot disagree.
  const latestFailedIdByShow = new Map<string, FinancialReconciliationPayout>();
  for (const p of payouts) {
    if (p.status !== 'failed' || !p.showId) continue;
    const current = latestFailedIdByShow.get(p.showId);
    if (!current || p.createdAt > current.createdAt) latestFailedIdByShow.set(p.showId, p);
  }

  const outstandingPayouts = payouts.filter(p => {
    if (p.status !== 'failed') return true;
    if (!p.showId) return true;
    if (showsWithLivePayout.has(p.showId)) return false; // superseded by a retry
    return latestFailedIdByShow.get(p.showId)?.payoutId === p.payoutId;
  });

  // payoutsEnabled only changes the DISPLAY LABEL for a 'pending' status
  // (Scheduled vs Waiting for account) — it never changes which bucket a row
  // lands in, so a fixed value is safe for attention counting across clubs.
  const settlement = summarizePayoutSettlement(outstandingPayouts, true);
  const failedTransferCount = settlement.attentionCount;
  const missingPlatformFeeSnapshotCount = snapshotMissingCount;

  return {
    failedTransferCount,
    missingPlatformFeeSnapshotCount,
    totalCount: failedTransferCount + missingPlatformFeeSnapshotCount,
  };
}
