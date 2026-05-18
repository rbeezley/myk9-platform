import { describe, expect, it } from 'vitest';
import { summarizeShowDayReconciliation } from '../showDayReconciliationSummary';

describe('summarizeShowDayReconciliation', () => {
  it('totals day-of paid, check, cash, and waived entries', () => {
    const summary = summarizeShowDayReconciliation([
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

    expect(summary.lateEntryCount).toBe(3);
    expect(summary.collectedAmount).toBe(75);
    expect(summary.waivedCount).toBe(1);
    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 35 });
    expect(summary.byMethod.check).toEqual({ count: 1, amount: 40 });
    expect(summary.byMethod.waived).toEqual({ count: 1, amount: 0 });
  });

  it('falls back to payment status when old day-of rows have no method', () => {
    const summary = summarizeShowDayReconciliation([
      {
        id: 'old-paid-entry',
        is_day_of_show: true,
        entry_fee: 25,
        payment_status: 'paid',
        payment_method: null,
      },
    ]);

    expect(summary.lateEntryCount).toBe(1);
    expect(summary.collectedAmount).toBe(25);
    expect(summary.byMethod.paid).toEqual({ count: 1, amount: 25 });
  });

  it('does not count cash or check entries as collected until payment is marked paid', () => {
    const summary = summarizeShowDayReconciliation([
      {
        id: 'cash-pending-entry',
        is_day_of_show: true,
        entry_fee: 35,
        payment_status: 'pending',
        payment_method: 'cash',
      },
    ]);

    expect(summary.lateEntryCount).toBe(1);
    expect(summary.collectedAmount).toBe(0);
    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 35 });
  });

  it('totals pulled entries that need manual refund review', () => {
    const summary = summarizeShowDayReconciliation([
      {
        id: 'paid-scratch',
        entry_fee: 35,
        entry_status: 'scratched',
        check_in_status: 'pulled',
        payment_status: 'paid',
      },
      {
        id: 'pending-pull',
        entry_fee: 30,
        check_in_status: 'pulled',
        payment_status: 'pending',
      },
    ]);

    expect(summary.pulledCount).toBe(2);
    expect(summary.refundReviewCount).toBe(1);
    expect(summary.refundReviewAmount).toBe(35);
  });

  it('totals already-refunded pulled entries separately', () => {
    const summary = summarizeShowDayReconciliation([
      {
        id: 'refunded-scratch',
        entry_fee: '40',
        entry_status: 'withdrawn',
        payment_status: 'Refunded',
      },
    ]);

    expect(summary.pulledCount).toBe(1);
    expect(summary.refundedCount).toBe(1);
    expect(summary.refundedAmount).toBe(40);
    expect(summary.refundReviewCount).toBe(0);
  });

  it('normalizes payment status case for collected and refund-review totals', () => {
    const summary = summarizeShowDayReconciliation([
      {
        id: 'paid-pull',
        entry_fee: 35,
        check_in_status: 'pulled',
        payment_status: 'Paid',
      },
      {
        id: 'paid-late-entry',
        is_day_of_show: true,
        entry_fee: 40,
        payment_status: 'Paid',
      },
    ]);

    expect(summary.refundReviewCount).toBe(1);
    expect(summary.refundReviewAmount).toBe(35);
    expect(summary.collectedAmount).toBe(40);
  });
});
