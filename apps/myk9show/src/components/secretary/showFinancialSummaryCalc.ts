import { buildMoneyAttribution } from '@/features/financial/moneyRoot';
import type {
  ShowFinancialEntryRow,
  TrialFinancialEntryRow,
  TrialSubtotal,
} from './financialSummaryTypes';

/**
 * The rows this card actually reports on, with each run's money taken from
 * wherever it is recorded (MYK9-639).
 *
 * One row per RUN: the superseded half of a move-up is dropped, because the dog
 * enters the ring once. The surviving row keeps its OWN class, trial and dog —
 * that is where the run happens — and takes `entryFee`, `discountAmount`,
 * `paymentStatus`, `comped` and `compedReason` from its money root, because the
 * destination of a move-up is created money-neutral and the settlement stayed on
 * the entry the exhibitor paid for.
 *
 * Shared by the summary, the per-trial subtotals, the table and the CSV export,
 * so none of the four can end up reporting a different number from the others.
 */
export function resolveShowFinancialRows<T extends TrialFinancialEntryRow>(
  allEntries: readonly T[]
): { rows: T[]; unresolvedMoneyRootCount: number } {
  const attribution = buildMoneyAttribution(allEntries);
  const rows = attribution.live.map(entry => {
    const root = attribution.rootById.get(entry.id) ?? entry;
    if (root.id === entry.id) return entry;
    return {
      ...entry,
      entryFee: root.entryFee,
      discountAmount: root.discountAmount,
      paymentStatus: root.paymentStatus,
      comped: root.comped,
      compedReason: root.compedReason,
      promoCode: root.promoCode,
    };
  });

  return { rows, unresolvedMoneyRootCount: attribution.unresolved.length };
}

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
export function computeShowFinancialSummary(allEntries: ShowFinancialEntryRow[]): {
  summary: ShowFinancialSummaryTotals;
  trialSubtotals: TrialSubtotal[];
  trialOptions: [string, string][];
} {
  const { rows: entries } = resolveShowFinancialRows(allEntries);
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
