import type { ShowFinancialEntryRow, TrialSubtotal } from './financialSummaryTypes';

export interface ShowFinancialSummaryTotals {
  totalEntries: number;
  totalFees: number;
  totalDiscounts: number;
  totalComped: number;
  netAmount: number;
  paidCount: number;
  paidAmount: number;
  pendingCount: number;
  pendingAmount: number;
  refundedCount: number;
  refundedAmount: number;
  compedCount: number;
}

/**
 * Single-pass: compute the show-level summary, per-trial subtotals, and the
 * trial filter options together. Accumulates in integer cents — summing
 * binary-float dollars drifts by a penny on large shows (MP-26) — and
 * divides once at the end.
 */
export function computeShowFinancialSummary(entries: ShowFinancialEntryRow[]): {
  summary: ShowFinancialSummaryTotals;
  trialSubtotals: TrialSubtotal[];
  trialOptions: [string, string][];
} {
  const acc: ShowFinancialSummaryTotals = {
    totalEntries: entries.length,
    totalFees: 0,
    totalDiscounts: 0,
    totalComped: 0,
    netAmount: 0,
    paidCount: 0,
    paidAmount: 0,
    pendingCount: 0,
    pendingAmount: 0,
    refundedCount: 0,
    refundedAmount: 0,
    compedCount: 0,
  };
  const subtotalMap = new Map<string, TrialSubtotal>();

  const toCents = (dollars: number) => Math.round(dollars * 100);
  for (const e of entries) {
    const feeCents = toCents(e.entryFee);
    const discountCents = toCents(e.discountAmount);
    acc.totalFees += feeCents;
    acc.totalDiscounts += discountCents;

    if (e.comped) {
      acc.compedCount++;
      acc.totalComped += feeCents;
    } else if (e.paymentStatus === 'paid') {
      acc.paidCount++;
      acc.paidAmount += feeCents - discountCents;
    } else if (e.paymentStatus === 'pending') {
      acc.pendingCount++;
      acc.pendingAmount += feeCents - discountCents;
    } else if (e.paymentStatus === 'refunded') {
      acc.refundedCount++;
      acc.refundedAmount += feeCents;
    }

    let sub = subtotalMap.get(e.trialId);
    if (!sub) {
      sub = {
        trialId: e.trialId,
        trialName: e.trialName,
        entryCount: 0,
        totalFees: 0,
        totalDiscounts: 0,
        totalComped: 0,
        netAmount: 0,
      };
      subtotalMap.set(e.trialId, sub);
    }
    sub.entryCount++;
    sub.totalFees += feeCents;
    sub.totalDiscounts += discountCents;
    if (e.comped) sub.totalComped += feeCents;
  }

  acc.netAmount = acc.totalFees - acc.totalDiscounts - acc.totalComped;
  acc.totalFees /= 100;
  acc.totalDiscounts /= 100;
  acc.totalComped /= 100;
  acc.netAmount /= 100;
  acc.paidAmount /= 100;
  acc.pendingAmount /= 100;
  acc.refundedAmount /= 100;

  const trialSubtotals: TrialSubtotal[] = [];
  const trialOptions: [string, string][] = [];
  for (const sub of subtotalMap.values()) {
    sub.netAmount = (sub.totalFees - sub.totalDiscounts - sub.totalComped) / 100;
    sub.totalFees /= 100;
    sub.totalDiscounts /= 100;
    sub.totalComped /= 100;
    trialSubtotals.push(sub);
    trialOptions.push([sub.trialId, sub.trialName]);
  }
  trialSubtotals.sort((a, b) => a.trialName.localeCompare(b.trialName));
  trialOptions.sort((a, b) => a[1].localeCompare(b[1]));

  return { summary: acc, trialSubtotals, trialOptions };
}
