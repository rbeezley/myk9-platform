/**
 * MYK9-677: the Show Closeout money card reconciles the desk's cash box, so it
 * keys on WHEN THE MONEY WAS RECEIVED (`entries.payment_received_on`, a
 * Postgres `date`), not on when the entry was keyed. A mail-in keyed weeks
 * early but paid at the desk is desk money; one keyed and paid weeks early is
 * not; nor is one paid after the show. `submitted_at` is only the fallback for
 * a row with no received date.
 */
import { describe, expect, it } from 'vitest';
import {
  summarizeShowDayReconciliation,
  type DeskCollectionWindow,
  type ShowDayReconciliationEntry,
} from '../showDayReconciliationSummary';

/** A two-day show, 2026-09-17..18 in New York, as `shows` stores it. */
const WINDOW: DeskCollectionWindow = {
  showStartDate: '2026-09-17T00:00:00+00:00',
  showEndDate: '2026-09-18T00:00:00+00:00',
  timeZone: 'America/New_York',
};
/** Keyed three weeks before the show. */
const KEYED_EARLY = '2026-08-27T15:00:00Z';

function mailInCheck(
  paymentReceivedOn: string | null,
  submittedAt: string = KEYED_EARLY
): ShowDayReconciliationEntry {
  return {
    id: `mail-in-${paymentReceivedOn ?? 'no-date'}`,
    entry_fee: 35,
    entry_status: 'confirmed',
    payment_status: 'paid',
    payment_method: 'check',
    submitted_at: submittedAt,
    created_at: submittedAt,
    payment_received_on: paymentReceivedOn,
  };
}

describe('closeout desk money keys on payment timing (MYK9-677)', () => {
  it('counts a mail-in keyed three weeks early and paid at the desk on show day', () => {
    const summary = summarizeShowDayReconciliation([mailInCheck('2026-09-17')], WINDOW);

    expect(summary.lateEntryCount).toBe(1);
    expect(summary.collectedAmount).toBe(35);
    expect(summary.byMethod.check).toEqual({ count: 1, amount: 35 });
  });

  it('counts a payment received on the last day of the show', () => {
    const summary = summarizeShowDayReconciliation([mailInCheck('2026-09-18')], WINDOW);

    expect(summary.collectedAmount).toBe(35);
  });

  it('leaves out a mail-in keyed and paid three weeks early', () => {
    const summary = summarizeShowDayReconciliation([mailInCheck('2026-08-27')], WINDOW);

    expect(summary.lateEntryCount).toBe(0);
    expect(summary.collectedAmount).toBe(0);
    expect(summary.totalEntryCount).toBe(1);
  });

  it('leaves out a payment received the day after the show', () => {
    const summary = summarizeShowDayReconciliation([mailInCheck('2026-09-19')], WINDOW);

    expect(summary.lateEntryCount).toBe(0);
    expect(summary.collectedAmount).toBe(0);
  });

  it('a received date before the show wins over a show-day submission', () => {
    // Keyed at the desk, but the check had been received by post beforehand.
    const summary = summarizeShowDayReconciliation(
      [mailInCheck('2026-09-10', '2026-09-17T15:00:00Z')],
      WINDOW
    );

    expect(summary.collectedAmount).toBe(0);
  });

  describe('with no received date, falls back to submitted_at', () => {
    it('counts a show-day submission', () => {
      const summary = summarizeShowDayReconciliation(
        [mailInCheck(null, '2026-09-17T15:00:00Z')],
        WINDOW
      );

      expect(summary.collectedAmount).toBe(35);
    });

    it('leaves out a submission the day after the show, in show time', () => {
      // 03:30 UTC on the 19th is still the 18th in New York; 04:30 is the 19th.
      const lastEvening = summarizeShowDayReconciliation(
        [mailInCheck(null, '2026-09-19T03:30:00Z')],
        WINDOW
      );
      const dayAfter = summarizeShowDayReconciliation(
        [mailInCheck(null, '2026-09-19T04:30:00Z')],
        WINDOW
      );

      expect(lastEvening.collectedAmount).toBe(35);
      expect(dayAfter.collectedAmount).toBe(0);
    });
  });

  it('treats a one-day show with no end date as ending on its first day', () => {
    const oneDay: DeskCollectionWindow = { ...WINDOW, showEndDate: null };

    expect(
      summarizeShowDayReconciliation([mailInCheck('2026-09-17')], oneDay).collectedAmount
    ).toBe(35);
    expect(
      summarizeShowDayReconciliation([mailInCheck('2026-09-18')], oneDay).collectedAmount
    ).toBe(0);
  });

  it('never counts an online (Stripe) payment as desk money, even on show day', () => {
    const summary = summarizeShowDayReconciliation(
      [
        {
          id: 'online-on-show-day',
          entry_fee: 35,
          payment_status: 'paid',
          payment_method: 'online',
          submitted_at: '2026-09-17T15:00:00Z',
        },
      ],
      WINDOW
    );

    expect(summary.lateEntryCount).toBe(0);
    expect(summary.collectedAmount).toBe(0);
  });

  describe('the enrollment payment Entry Management recorded', () => {
    const enrollmentEntry = (
      id: string,
      registration: ShowDayReconciliationEntry['registration'],
      overrides: Partial<ShowDayReconciliationEntry> = {}
    ): ShowDayReconciliationEntry => ({
      ...mailInCheck('2026-09-17'),
      id,
      registration,
      ...overrides,
    });

    it('counts a partial desk payment once per enrollment, at the amount received', () => {
      const registration = { id: 'reg-1', payment_status: 'pending', paid_amount: 20 };
      const summary = summarizeShowDayReconciliation(
        [
          enrollmentEntry('a', registration, { payment_status: 'pending' }),
          enrollmentEntry('b', registration, { payment_status: 'pending' }),
        ],
        WINDOW
      );

      expect(summary.collectedAmount).toBe(20);
      expect(summary.lateEntryCount).toBe(2);
    });

    it('leaves out a partial payment received before the show', () => {
      const registration = { id: 'reg-1', payment_status: 'pending', paid_amount: 20 };
      const summary = summarizeShowDayReconciliation(
        [
          enrollmentEntry('a', registration, {
            payment_status: 'pending',
            payment_received_on: '2026-08-27',
          }),
        ],
        WINDOW
      );

      expect(summary.collectedAmount).toBe(0);
    });

    it('never counts an enrollment marked Paid in Full: Online, whatever the entry was keyed as', () => {
      const summary = summarizeShowDayReconciliation(
        [
          enrollmentEntry(
            'a',
            { id: 'reg-1', payment_status: 'paid_online', paid_amount: 35 },
            { payment_received_on: null, submitted_at: '2026-09-17T15:00:00Z' }
          ),
        ],
        WINDOW
      );

      expect(summary.lateEntryCount).toBe(0);
      expect(summary.collectedAmount).toBe(0);
    });

    it('files a check-keyed mail-in marked Paid in Full: Cash under cash', () => {
      const summary = summarizeShowDayReconciliation(
        [enrollmentEntry('a', { id: 'reg-1', payment_status: 'paid_by_cash', paid_amount: 35 })],
        WINDOW
      );

      expect(summary.byMethod.cash).toEqual({ count: 1, amount: 35 });
      expect(summary.byMethod.check).toEqual({ count: 0, amount: 0 });
      expect(summary.collectedAmount).toBe(35);
    });
  });
});
