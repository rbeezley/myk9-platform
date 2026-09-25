/**
 * MYK9-677: the Show Closeout money card reconciles the desk's cash box, so
 * cash and check money is read from the payments ledger (`show_payments`), one
 * row per payment with the show-calendar day it was received. An enrollment's
 * single status/amount/date cannot tell a split payment's desk half from its
 * mailed half; the ledger can.
 */
import { describe, expect, it } from 'vitest';
import type { ShowPaymentLedgerRow } from '@/features/payments/showPaymentLedger';
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

function ledger(
  overrides: Partial<ShowPaymentLedgerRow> &
    Pick<ShowPaymentLedgerRow, 'amount' | 'method' | 'received_on'>
): ShowPaymentLedgerRow {
  return {
    id: `row-${overrides.kind ?? 'payment'}-${overrides.method}-${overrides.received_on}-${overrides.amount}`,
    enrollment_id: 'reg-1',
    entry_id: null,
    kind: 'payment',
    ...overrides,
  };
}

/**
 * A $50 mail-in on enrollment reg-1, marked Paid in Full: Cash at the desk.
 * `payment_received_on` is what #2441's single stamp wrote on Mark paid; the
 * card must NOT read it for cash/check money any more.
 */
function mailIn(overrides: Partial<ShowDayReconciliationEntry> = {}): ShowDayReconciliationEntry {
  return {
    id: 'mail-in',
    entry_fee: 50,
    entry_status: 'confirmed',
    payment_status: 'paid',
    payment_method: 'check',
    submitted_at: KEYED_EARLY,
    created_at: KEYED_EARLY,
    payment_received_on: '2026-09-17',
    registration_id: 'reg-1',
    registration: { id: 'reg-1', payment_status: 'paid_by_cash', paid_amount: 50 },
    ...overrides,
  };
}

describe('closeout desk money reads the payments ledger (MYK9-677)', () => {
  it('counts only the desk half of a split payment, under its own method', () => {
    const summary = summarizeShowDayReconciliation([mailIn()], WINDOW, [
      ledger({ amount: 35, method: 'check', received_on: '2026-08-27' }),
      ledger({ amount: 15, method: 'cash', received_on: '2026-09-17' }),
    ]);

    expect(summary.collectedAmount).toBe(15);
    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 15 });
    expect(summary.byMethod.check).toEqual({ count: 0, amount: 0 });
    expect(summary.lateEntryCount).toBe(1);
  });

  it('leaves out a check marked paid today but received three weeks earlier', () => {
    const summary = summarizeShowDayReconciliation(
      [
        mailIn({
          registration: { id: 'reg-1', payment_status: 'paid_by_check', paid_amount: 50 },
        }),
      ],
      WINDOW,
      [ledger({ amount: 50, method: 'check', received_on: '2026-08-27' })]
    );

    expect(summary.collectedAmount).toBe(0);
    expect(summary.byMethod.check).toEqual({ count: 0, amount: 0 });
    expect(summary.lateEntryCount).toBe(0);
    expect(summary.totalEntryCount).toBe(1);
  });

  it('counts the last show day and leaves out the day after', () => {
    const lastDay = summarizeShowDayReconciliation([mailIn()], WINDOW, [
      ledger({ amount: 50, method: 'cash', received_on: '2026-09-18' }),
    ]);
    const dayAfter = summarizeShowDayReconciliation([mailIn()], WINDOW, [
      ledger({ amount: 50, method: 'cash', received_on: '2026-09-19' }),
    ]);

    expect(lastDay.collectedAmount).toBe(50);
    expect(dayAfter.collectedAmount).toBe(0);
  });

  it('treats a one-day show with no end date as ending on its first day', () => {
    const oneDay: DeskCollectionWindow = { ...WINDOW, showEndDate: null };
    const payments = [
      ledger({ amount: 20, method: 'cash', received_on: '2026-09-17' }),
      ledger({ amount: 30, method: 'cash', received_on: '2026-09-18' }),
    ];

    expect(summarizeShowDayReconciliation([mailIn()], oneDay, payments).collectedAmount).toBe(20);
  });

  it('counts a desk late entry (no enrollment) through its own ledger row', () => {
    const desk: ShowDayReconciliationEntry = {
      id: 'desk-1',
      entry_fee: 20,
      payment_status: 'paid',
      payment_method: 'cash',
      submitted_at: '2026-09-17T15:00:00Z',
      registration_id: null,
      registration: null,
    };
    const summary = summarizeShowDayReconciliation([desk], WINDOW, [
      ledger({
        enrollment_id: null,
        entry_id: 'desk-1',
        amount: 20,
        method: 'cash',
        received_on: '2026-09-17',
      }),
    ]);

    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 20 });
    expect(summary.lateEntryCount).toBe(1);
  });

  it('nets a cash refund handed back at the desk', () => {
    const summary = summarizeShowDayReconciliation([mailIn()], WINDOW, [
      ledger({ amount: 50, method: 'cash', received_on: '2026-09-17' }),
      ledger({ kind: 'refund', amount: -10, method: 'cash', received_on: '2026-09-18' }),
    ]);

    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 40 });
    expect(summary.collectedAmount).toBe(40);
  });

  it('a Payment Due reset cancels a desk payment and leaves a mailed one where it was', () => {
    const summary = summarizeShowDayReconciliation([mailIn()], WINDOW, [
      ledger({ amount: 35, method: 'check', received_on: '2026-08-27' }),
      ledger({ amount: 15, method: 'cash', received_on: '2026-09-17' }),
      // Reversal rows are dated on the day each group was recorded.
      ledger({ kind: 'reversal', amount: -35, method: 'check', received_on: '2026-08-27' }),
      ledger({ kind: 'reversal', amount: -15, method: 'cash', received_on: '2026-09-17' }),
    ]);

    expect(summary.collectedAmount).toBe(0);
    expect(summary.byMethod.check.amount).toBe(0);
    expect(summary.byMethod.cash.amount).toBe(0);
  });

  describe('counts are netted per enrollment and method before counting', () => {
    it('a show-day payment then Payment Due is no payment, no entry taken, $0', () => {
      const summary = summarizeShowDayReconciliation([mailIn()], WINDOW, [
        ledger({ amount: 50, method: 'cash', received_on: '2026-09-17' }),
        ledger({ kind: 'reversal', amount: -50, method: 'cash', received_on: '2026-09-17' }),
      ]);

      expect(summary.byMethod.cash).toEqual({ count: 0, amount: 0 });
      expect(summary.lateEntryCount).toBe(0);
      expect(summary.collectedAmount).toBe(0);
    });

    it('a payment then a partial refund is one payment at the net dollars', () => {
      const summary = summarizeShowDayReconciliation([mailIn()], WINDOW, [
        ledger({ amount: 50, method: 'cash', received_on: '2026-09-17' }),
        ledger({ kind: 'refund', amount: -20, method: 'cash', received_on: '2026-09-17' }),
      ]);

      expect(summary.byMethod.cash).toEqual({ count: 1, amount: 30 });
      expect(summary.lateEntryCount).toBe(1);
    });

    it('a desk payment handed back in full is not counted as taken', () => {
      const summary = summarizeShowDayReconciliation([mailIn()], WINDOW, [
        ledger({ amount: 50, method: 'cash', received_on: '2026-09-17' }),
        ledger({ kind: 'refund', amount: -50, method: 'cash', received_on: '2026-09-18' }),
      ]);

      expect(summary.byMethod.cash).toEqual({ count: 0, amount: 0 });
      expect(summary.lateEntryCount).toBe(0);
    });

    it('two desk payments on one enrollment are two payments and one entry taken', () => {
      const summary = summarizeShowDayReconciliation([mailIn()], WINDOW, [
        ledger({ amount: 20, method: 'cash', received_on: '2026-09-17' }),
        ledger({ amount: 30, method: 'cash', received_on: '2026-09-18' }),
      ]);

      expect(summary.byMethod.cash).toEqual({ count: 2, amount: 50 });
      expect(summary.lateEntryCount).toBe(1);
    });

    it('a reset desk entry (no enrollment) is not taken either', () => {
      const desk: ShowDayReconciliationEntry = {
        id: 'desk-1',
        entry_fee: 20,
        payment_status: 'paid',
        payment_method: 'cash',
        registration_id: null,
      };
      const row = { enrollment_id: null, entry_id: 'desk-1', method: 'cash' as const };
      const summary = summarizeShowDayReconciliation([desk], WINDOW, [
        ledger({ ...row, amount: 20, received_on: '2026-09-17' }),
        ledger({ ...row, kind: 'refund', amount: -20, received_on: '2026-09-17' }),
      ]);

      expect(summary.byMethod.cash.count).toBe(0);
      expect(summary.lateEntryCount).toBe(0);
    });
  });

  it('never counts an online (Stripe) payment as desk money, even on show day', () => {
    const summary = summarizeShowDayReconciliation(
      [
        mailIn({
          registration: { id: 'reg-1', payment_status: 'paid_online', paid_amount: 50 },
          submitted_at: '2026-09-17T15:00:00Z',
        }),
      ],
      WINDOW,
      []
    );

    expect(summary.lateEntryCount).toBe(0);
    expect(summary.collectedAmount).toBe(0);
  });

  it('reads the ledger amount when PostgREST hands numeric(10,2) over as a string', () => {
    const summary = summarizeShowDayReconciliation([mailIn()], WINDOW, [
      ledger({ amount: '15.00', method: 'cash', received_on: '2026-09-17' }),
    ]);

    expect(summary.collectedAmount).toBe(15);
  });

  describe('rows the ledger does not hold keep the entry-based reading', () => {
    const generic = (submittedAt: string): ShowDayReconciliationEntry => ({
      id: `generic-${submittedAt}`,
      entry_fee: 25,
      payment_status: 'paid',
      payment_method: 'secretary_paid',
      submitted_at: submittedAt,
      payment_received_on: null,
    });

    it('counts a generic secretary payment submitted on show day', () => {
      const summary = summarizeShowDayReconciliation([generic('2026-09-17T15:00:00Z')], WINDOW, []);

      expect(summary.byMethod.paid).toEqual({ count: 1, amount: 25 });
      expect(summary.collectedAmount).toBe(25);
    });

    it('uses the show calendar for the submitted_at fallback', () => {
      // 03:30 UTC on the 19th is still the 18th in New York; 04:30 is the 19th.
      expect(
        summarizeShowDayReconciliation([generic('2026-09-19T03:30:00Z')], WINDOW, [])
          .collectedAmount
      ).toBe(25);
      expect(
        summarizeShowDayReconciliation([generic('2026-09-19T04:30:00Z')], WINDOW, [])
          .collectedAmount
      ).toBe(0);
    });
  });
});
