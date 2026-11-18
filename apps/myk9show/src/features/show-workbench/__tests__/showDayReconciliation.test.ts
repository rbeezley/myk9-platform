import { describe, expect, it } from 'vitest';
import {
  summarizeShowDayReconciliation,
  type DeskCollectionWindow,
  type ShowDayReconciliationEntry,
} from '../showDayReconciliationSummary';

/** A two-day show, 2026-09-17..18 in New York (stored as midnight UTC). */
const WINDOW: DeskCollectionWindow = {
  showStartDate: '2026-09-17T00:00:00+00:00',
  showEndDate: '2026-09-18T00:00:00+00:00',
  timeZone: 'America/New_York',
};
/** Mid-morning on show day at the venue. */
const AT_SHOW = '2026-09-17T14:00:00Z';

describe('summarizeShowDayReconciliation', () => {
  it('totals pulled entries that need manual refund review', () => {
    const summary = summarizeShowDayReconciliation(
      [
        {
          id: 'paid-scratch',
          entry_fee: 35,
          entry_status: 'scratched',
          check_in_status: 'pulled',
          payment_status: 'paid',
          payment_method: 'online',
        },
        { id: 'pending-pull', entry_fee: 30, check_in_status: 'pulled', payment_status: 'pending' },
      ],
      WINDOW
    );

    expect(summary.removals.pulled).toBe(2);
    expect(summary.refundReviewCount).toBe(1);
    expect(summary.refundReviewAmount).toBe(35);
  });

  // MYK9-2099: refund review is `refundToDecideRemoval`, the rows Deny refund can decide.
  it('leaves out a decided or cash-paid removal from refund review', () => {
    const summary = summarizeShowDayReconciliation(
      [
        {
          id: 'denied',
          entry_fee: 35,
          entry_status: 'scratched',
          payment_status: 'paid',
          payment_method: 'online',
          refund_decision: 'denied',
        },
        { id: 'cash', entry_fee: 30, entry_status: 'withdrawn', payment_status: 'paid' },
        {
          id: 'absent',
          entry_fee: 20,
          entry_status: 'absent',
          payment_status: 'paid',
          payment_method: 'online',
        },
      ],
      WINDOW
    );

    expect(summary.removalCount).toBe(3);
    expect(summary.refundReviewCount).toBe(1);
    expect(summary.refundReviewRemovals.absent).toBe(1);
    expect(summary.refundReviewAmount).toBe(20);
  });

  // MYK9-2145: ringside's Pull and the exhibitor's own check-in pull leave entry_status as
  // entered. Finish the show counts each as a pull, so each is a pull to decide too, and the two
  // totals agree on them.
  it('counts a paid ringside or self check-in pull as a refund to decide, like a desk pull', () => {
    const paidOnline = { entry_fee: 25, payment_status: 'paid', payment_method: 'online' };
    const summary = summarizeShowDayReconciliation(
      [
        { id: 'desk', ...paidOnline, entry_status: 'scratched', check_in_status: 'pulled' },
        { id: 'ringside', ...paidOnline, entry_status: 'confirmed', check_in_status: 'pulled' },
        { id: 'self', ...paidOnline, entry_status: 'confirmed', check_in_status: 'pulled' },
      ],
      WINDOW
    );

    expect(summary.removals.pulled).toBe(3);
    expect(summary.refundReviewRemovals.pulled).toBe(3);
    expect(summary.refundReviewCount).toBe(summary.removalCount);
    expect(summary.refundReviewAmount).toBe(75);
  });

  it('totals already-refunded removals separately', () => {
    const summary = summarizeShowDayReconciliation(
      [{ id: 'refunded', entry_fee: '40', entry_status: 'withdrawn', payment_status: 'Refunded' }],
      WINDOW
    );

    expect(summary.removals.removed).toBe(1);
    expect(summary.refundedCount).toBe(1);
    expect(summary.refundedAmount).toBe(40);
    expect(summary.refundReviewCount).toBe(0);
  });

  it('normalizes payment status case for refund review', () => {
    const summary = summarizeShowDayReconciliation(
      [
        {
          id: 'paid-pull',
          entry_fee: 35,
          entry_status: 'scratched',
          payment_status: 'Paid',
          payment_method: 'online',
        },
      ],
      WINDOW
    );

    expect(summary.refundReviewAmount).toBe(35);
  });

  it('still reports pulls and refund review with no desk window', () => {
    const summary = summarizeShowDayReconciliation(
      [
        {
          id: 'paid-pull',
          entry_fee: 35,
          entry_status: 'scratched',
          payment_status: 'paid',
          payment_method: 'online',
        },
      ],
      null
    );

    expect(summary.removals.pulled).toBe(1);
    expect(summary.refundReviewAmount).toBe(35);
    expect(summary.entriesDuringShowCount).toBe(0);
  });

  describe('entries made during the show: submitted on a show day, however paid (MYK9-677)', () => {
    const keyed = (
      submittedAt: string | null,
      overrides: Partial<ShowDayReconciliationEntry> = {}
    ): ShowDayReconciliationEntry => ({
      id: `entry-${submittedAt ?? 'none'}`,
      entry_fee: 35,
      payment_status: 'pending',
      payment_method: 'check',
      submitted_at: submittedAt,
      ...overrides,
    });

    it('counts a show-day entry whether it was paid, unpaid, online or waived', () => {
      const summary = summarizeShowDayReconciliation(
        [
          keyed(AT_SHOW),
          keyed(AT_SHOW, { payment_status: 'paid', payment_method: 'cash' }),
          keyed(AT_SHOW, { payment_status: 'paid', payment_method: 'online' }),
          keyed(AT_SHOW, { payment_status: 'waived', payment_method: 'waived', entry_fee: 0 }),
        ],
        WINDOW
      );

      expect(summary.entriesDuringShowCount).toBe(4);
      expect(summary.waivedDuringShowCount).toBe(1);
      expect(summary.paymentCount).toBe(0);
    });

    it('leaves out a mail-in keyed after entries closed but weeks before the show', () => {
      const summary = summarizeShowDayReconciliation([keyed('2026-09-01T15:00:00Z')], WINDOW);

      expect(summary.entriesDuringShowCount).toBe(0);
      expect(summary.totalEntryCount).toBe(1);
    });

    it("reads the day on the show's own calendar, not UTC", () => {
      // 01:30 UTC on the 17th is 21:30 on the 16th in New York; 04:30 is show day.
      expect(
        summarizeShowDayReconciliation([keyed('2026-09-17T01:30:00Z')], WINDOW)
          .entriesDuringShowCount
      ).toBe(0);
      expect(
        summarizeShowDayReconciliation([keyed('2026-09-17T04:30:00Z')], WINDOW)
          .entriesDuringShowCount
      ).toBe(1);
      // 03:30 UTC on the 19th is still the 18th, the last day; 04:30 is the day after.
      expect(
        summarizeShowDayReconciliation([keyed('2026-09-19T03:30:00Z')], WINDOW)
          .entriesDuringShowCount
      ).toBe(1);
      expect(
        summarizeShowDayReconciliation([keyed('2026-09-19T04:30:00Z')], WINDOW)
          .entriesDuringShowCount
      ).toBe(0);
    });

    it('falls back to created_at when submitted_at is missing', () => {
      const summary = summarizeShowDayReconciliation(
        [keyed(null, { created_at: AT_SHOW })],
        WINDOW
      );

      expect(summary.entriesDuringShowCount).toBe(1);
    });

    it('counts nothing without a show start date or a timestamp', () => {
      expect(summarizeShowDayReconciliation([keyed(AT_SHOW)], null).entriesDuringShowCount).toBe(0);
      expect(
        summarizeShowDayReconciliation([keyed(AT_SHOW)], {
          showStartDate: null,
          showEndDate: null,
          timeZone: 'America/New_York',
        }).entriesDuringShowCount
      ).toBe(0);
      expect(summarizeShowDayReconciliation([keyed(null)], WINDOW).entriesDuringShowCount).toBe(0);
    });
  });
});
