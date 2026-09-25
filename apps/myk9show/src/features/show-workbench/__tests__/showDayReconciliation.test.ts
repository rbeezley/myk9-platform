import { describe, expect, it } from 'vitest';
import type { ShowPaymentLedgerRow } from '@/features/payments/showPaymentLedger';
import {
  summarizeShowDayReconciliation,
  type DeskCollectionWindow,
} from '../showDayReconciliationSummary';

/** A two-day show, 2026-09-17..18 in New York (stored as midnight UTC). */
const WINDOW: DeskCollectionWindow = {
  showStartDate: '2026-09-17T00:00:00+00:00',
  showEndDate: '2026-09-18T00:00:00+00:00',
  timeZone: 'America/New_York',
};
/** Mid-morning on show day at the venue. */
const AT_SHOW = '2026-09-17T14:00:00Z';
/** A pre-entry, well before the show. */
const EARLY = '2026-08-20T14:00:00Z';

/** A desk late entry's own ledger row (MYK9-677), received on the first show day. */
function deskRow(entryId: string, amount: number, method: 'cash' | 'check'): ShowPaymentLedgerRow {
  return {
    id: `row-${entryId}`,
    enrollment_id: null,
    entry_id: entryId,
    kind: 'payment',
    amount,
    method,
    received_on: '2026-09-17',
  };
}

describe('summarizeShowDayReconciliation', () => {
  it('totals at-show paid, check, cash, and waived entries', () => {
    const summary = summarizeShowDayReconciliation(
      [
        {
          id: 'early-entry',
          submitted_at: EARLY,
          entry_fee: 30,
          payment_status: 'paid',
          payment_method: 'online',
        },
        {
          id: 'cash-entry',
          submitted_at: AT_SHOW,
          entry_fee: 35,
          payment_status: 'paid',
          payment_method: 'cash',
        },
        {
          id: 'check-entry',
          submitted_at: AT_SHOW,
          entry_fee: '40',
          payment_status: 'paid',
          payment_method: 'check',
        },
        {
          id: 'waived-entry',
          submitted_at: AT_SHOW,
          entry_fee: 0,
          payment_status: 'waived',
          payment_method: 'waived',
        },
      ],
      WINDOW,
      [deskRow('cash-entry', 35, 'cash'), deskRow('check-entry', 40, 'check')]
    );

    expect(summary.totalEntryCount).toBe(4);
    expect(summary.lateEntryCount).toBe(3);
    expect(summary.collectedAmount).toBe(75);
    expect(summary.waivedCount).toBe(1);
    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 35 });
    expect(summary.byMethod.check).toEqual({ count: 1, amount: 40 });
    expect(summary.byMethod.waived).toEqual({ count: 1, amount: 0 });
  });

  it('falls back to payment status when an at-show row has no method', () => {
    const summary = summarizeShowDayReconciliation(
      [
        {
          id: 'old-paid-entry',
          submitted_at: AT_SHOW,
          entry_fee: 25,
          payment_status: 'paid',
          payment_method: null,
        },
      ],
      WINDOW
    );

    expect(summary.totalEntryCount).toBe(1);
    expect(summary.lateEntryCount).toBe(1);
    expect(summary.collectedAmount).toBe(25);
    expect(summary.byMethod.paid).toEqual({ count: 1, amount: 25 });
  });

  it('does not count a cash or check entry until the ledger records its payment', () => {
    const summary = summarizeShowDayReconciliation(
      [
        {
          id: 'cash-pending-entry',
          submitted_at: AT_SHOW,
          entry_fee: 35,
          payment_status: 'pending',
          payment_method: 'cash',
        },
      ],
      WINDOW
    );

    expect(summary.lateEntryCount).toBe(0);
    expect(summary.collectedAmount).toBe(0);
    expect(summary.byMethod.cash).toEqual({ count: 0, amount: 0 });
  });

  it('totals pulled entries that need manual refund review', () => {
    const summary = summarizeShowDayReconciliation(
      [
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
      ],
      WINDOW
    );

    expect(summary.pulledCount).toBe(2);
    expect(summary.refundReviewCount).toBe(1);
    expect(summary.refundReviewAmount).toBe(35);
  });

  it('totals already-refunded pulled entries separately', () => {
    const summary = summarizeShowDayReconciliation(
      [
        {
          id: 'refunded-scratch',
          entry_fee: '40',
          entry_status: 'withdrawn',
          payment_status: 'Refunded',
        },
      ],
      WINDOW
    );

    expect(summary.pulledCount).toBe(1);
    expect(summary.refundedCount).toBe(1);
    expect(summary.refundedAmount).toBe(40);
    expect(summary.refundReviewCount).toBe(0);
  });

  it('normalizes payment status case for collected and refund-review totals', () => {
    const summary = summarizeShowDayReconciliation(
      [
        {
          id: 'paid-pull',
          entry_fee: 35,
          check_in_status: 'pulled',
          payment_status: 'Paid',
        },
        {
          id: 'paid-late-entry',
          submitted_at: AT_SHOW,
          entry_fee: 40,
          payment_status: 'Paid',
        },
      ],
      WINDOW
    );

    expect(summary.refundReviewCount).toBe(1);
    expect(summary.refundReviewAmount).toBe(35);
    expect(summary.collectedAmount).toBe(40);
  });

  // Cash and check are read from the ledger (showDayReconciliation.paymentTiming
  // .test.ts). A generic "paid by secretary" row names no method, so it is
  // still dated from the entry: these pin that calendar.
  describe('which entries are desk money (MYK9-677)', () => {
    const paidCheck = (submittedAt: string | null, createdAt: string | null = null) => ({
      id: `entry-${submittedAt ?? createdAt ?? 'none'}`,
      entry_fee: 35,
      payment_status: 'paid',
      payment_method: 'secretary_paid',
      submitted_at: submittedAt,
      created_at: createdAt,
    });

    it('leaves out a mail-in keyed after entries closed but weeks before the show', () => {
      // The registry bucket calls this day-of-show (it arrived after close), so
      // the old `is_day_of_show` gate counted its check as desk cash.
      const summary = summarizeShowDayReconciliation([paidCheck('2026-09-01T15:00:00Z')], WINDOW);

      expect(summary.lateEntryCount).toBe(0);
      expect(summary.collectedAmount).toBe(0);
      expect(summary.byMethod.paid).toEqual({ count: 0, amount: 0 });
      expect(summary.totalEntryCount).toBe(1);
    });

    it("reads the day on the show's own calendar, not UTC", () => {
      // 01:30 UTC on the 17th is 21:30 on the 16th in New York: the night
      // before the show, keyed at home, not at the desk.
      const eveBefore = summarizeShowDayReconciliation([paidCheck('2026-09-17T01:30:00Z')], WINDOW);
      // 04:30 UTC on the 17th is 00:30 on show day in New York.
      const showDay = summarizeShowDayReconciliation([paidCheck('2026-09-17T04:30:00Z')], WINDOW);

      expect(eveBefore.lateEntryCount).toBe(0);
      expect(showDay.lateEntryCount).toBe(1);
      expect(showDay.collectedAmount).toBe(35);
    });

    it('counts every day of a multi-day show, not just the first', () => {
      const summary = summarizeShowDayReconciliation([paidCheck('2026-09-18T19:00:00Z')], WINDOW);

      expect(summary.lateEntryCount).toBe(1);
    });

    it('falls back to created_at when submitted_at is missing', () => {
      const summary = summarizeShowDayReconciliation([paidCheck(null, AT_SHOW)], WINDOW);

      expect(summary.lateEntryCount).toBe(1);
    });

    it('counts nothing as desk money without a show start date or a timestamp', () => {
      expect(summarizeShowDayReconciliation([paidCheck(AT_SHOW)], null).lateEntryCount).toBe(0);
      expect(
        summarizeShowDayReconciliation([paidCheck(AT_SHOW)], {
          showStartDate: null,
          showEndDate: null,
          timeZone: 'America/New_York',
        }).lateEntryCount
      ).toBe(0);
      expect(summarizeShowDayReconciliation([paidCheck(null)], WINDOW).lateEntryCount).toBe(0);
    });

    it('still reports pulls and refund review with no desk window', () => {
      const summary = summarizeShowDayReconciliation(
        [{ id: 'paid-pull', entry_fee: 35, check_in_status: 'pulled', payment_status: 'paid' }],
        null
      );

      expect(summary.pulledCount).toBe(1);
      expect(summary.refundReviewAmount).toBe(35);
    });
  });
});
