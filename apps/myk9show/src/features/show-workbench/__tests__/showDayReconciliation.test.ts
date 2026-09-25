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
        },
        { id: 'pending-pull', entry_fee: 30, check_in_status: 'pulled', payment_status: 'pending' },
      ],
      WINDOW
    );

    expect(summary.pulledCount).toBe(2);
    expect(summary.refundReviewCount).toBe(1);
    expect(summary.refundReviewAmount).toBe(35);
  });

  it('totals already-refunded pulled entries separately', () => {
    const summary = summarizeShowDayReconciliation(
      [{ id: 'refunded', entry_fee: '40', entry_status: 'withdrawn', payment_status: 'Refunded' }],
      WINDOW
    );

    expect(summary.pulledCount).toBe(1);
    expect(summary.refundedCount).toBe(1);
    expect(summary.refundedAmount).toBe(40);
    expect(summary.refundReviewCount).toBe(0);
  });

  it('normalizes payment status case for refund review', () => {
    const summary = summarizeShowDayReconciliation(
      [{ id: 'paid-pull', entry_fee: 35, check_in_status: 'pulled', payment_status: 'Paid' }],
      WINDOW
    );

    expect(summary.refundReviewAmount).toBe(35);
  });

  it('still reports pulls and refund review with no desk window', () => {
    const summary = summarizeShowDayReconciliation(
      [{ id: 'paid-pull', entry_fee: 35, check_in_status: 'pulled', payment_status: 'paid' }],
      null
    );

    expect(summary.pulledCount).toBe(1);
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
