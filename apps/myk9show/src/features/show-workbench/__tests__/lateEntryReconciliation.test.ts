import { describe, expect, it } from 'vitest';
import { summarizeLateEntryReconciliation } from '../lateEntryReconciliationSummary';

describe('summarizeLateEntryReconciliation', () => {
  it('totals day-of paid, check, cash, and waived entries', () => {
    const summary = summarizeLateEntryReconciliation([
      {
        id: 'early-entry',
        is_day_of_show: false,
        entry_fee: 30,
        payment_status: 'paid',
        payment_method: 'online',
      },
      {
        id: 'cash-entry',
        is_day_of_show: true,
        entry_fee: 35,
        payment_status: 'paid',
        payment_method: 'cash',
      },
      {
        id: 'check-entry',
        is_day_of_show: true,
        entry_fee: '40',
        payment_status: 'paid',
        payment_method: 'check',
      },
      {
        id: 'waived-entry',
        is_day_of_show: true,
        entry_fee: 0,
        payment_status: 'waived',
        payment_method: 'waived',
      },
    ]);

    expect(summary.entryCount).toBe(3);
    expect(summary.collectedAmount).toBe(75);
    expect(summary.waivedCount).toBe(1);
    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 35 });
    expect(summary.byMethod.check).toEqual({ count: 1, amount: 40 });
    expect(summary.byMethod.waived).toEqual({ count: 1, amount: 0 });
  });

  it('falls back to payment status when old day-of rows have no method', () => {
    const summary = summarizeLateEntryReconciliation([
      {
        id: 'old-paid-entry',
        is_day_of_show: true,
        entry_fee: 25,
        payment_status: 'paid',
        payment_method: null,
      },
    ]);

    expect(summary.entryCount).toBe(1);
    expect(summary.collectedAmount).toBe(25);
    expect(summary.byMethod.paid).toEqual({ count: 1, amount: 25 });
  });

  it('does not count cash or check entries as collected until payment is marked paid', () => {
    const summary = summarizeLateEntryReconciliation([
      {
        id: 'cash-pending-entry',
        is_day_of_show: true,
        entry_fee: 35,
        payment_status: 'pending',
        payment_method: 'cash',
      },
    ]);

    expect(summary.entryCount).toBe(1);
    expect(summary.collectedAmount).toBe(0);
    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 35 });
  });
});
