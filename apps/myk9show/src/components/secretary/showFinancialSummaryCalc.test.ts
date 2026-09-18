import { describe, expect, it } from 'vitest';
import { computeShowFinancialSummary } from './showFinancialSummaryCalc';
import { isSupersededMoveUpEntry } from '@/components/reports/financialReportTotals';
import type { ShowFinancialEntryRow } from './financialSummaryTypes';

function row(overrides: Partial<ShowFinancialEntryRow>): ShowFinancialEntryRow {
  return {
    id: 'entry-1',
    entryStatus: 'confirmed',
    trialId: 'trial-1',
    trialName: 'Thursday Trial 1',
    handler: 'Jane Handler',
    dogName: 'Acorn',
    ownerName: 'Jane Handler',
    className: 'Interior Novice A',
    entryFee: 35,
    discountAmount: 0,
    promoCode: null,
    paymentStatus: 'paid',
    comped: false,
    compedReason: null,
    ...overrides,
  };
}

describe('computeShowFinancialSummary — move-up supersession (MYK9-639)', () => {
  /**
   * The finding's own show: one dog, entered once, $35 paid by check, then moved
   * up. Both rows now carry `payment_status = 'paid'` and `entry_fee = 35`,
   * because the destination supersedes the source rather than being a fresh
   * waived entry — so the source has to be dropped before anything is summed.
   */
  const MOVED_UP_PAIR = [
    row({ id: 'source-moved', entryStatus: 'moved', className: 'Interior Novice A' }),
    row({ id: 'destination', entryStatus: 'confirmed', className: 'Interior Advanced A' }),
  ];

  it('counts the pair as ONE entry at the amount actually paid', () => {
    const { summary } = computeShowFinancialSummary(MOVED_UP_PAIR);

    expect(summary.totalEntries).toBe(1);
    expect(summary.totalFees).toBe(35);
    expect(summary.paidCount).toBe(1);
    expect(summary.paidAmount).toBe(35);
    expect(summary.netAmount).toBe(35);
  });

  it('keeps the per-trial subtotal to the one run as well', () => {
    const { trialSubtotals } = computeShowFinancialSummary(MOVED_UP_PAIR);

    expect(trialSubtotals).toHaveLength(1);
    expect(trialSubtotals[0]).toMatchObject({ entryCount: 1, totalFees: 35, netAmount: 35 });
  });

  it('still counts withdrawn and scratched money, which is real and reconcilable', () => {
    const { summary } = computeShowFinancialSummary([
      row({ id: 'withdrawn', entryStatus: 'withdrawn' }),
      row({ id: 'scratched', entryStatus: 'scratched' }),
    ]);

    expect(summary.totalEntries).toBe(2);
    expect(summary.paidAmount).toBe(70);
  });

  it('recognises only the superseded state, whatever its casing', () => {
    expect(isSupersededMoveUpEntry({ entryStatus: 'moved' })).toBe(true);
    expect(isSupersededMoveUpEntry({ entryStatus: ' MOVED ' })).toBe(true);
    expect(isSupersededMoveUpEntry({ entryStatus: 'move-up-requested' })).toBe(false);
    expect(isSupersededMoveUpEntry({ entryStatus: null })).toBe(false);
    expect(isSupersededMoveUpEntry({})).toBe(false);
  });
});
