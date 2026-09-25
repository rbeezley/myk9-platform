/**
 * MYK9-677: the Show Closeout card's two money-desk figures are independent.
 *
 * - Payments received during the show: cash and check payments from the
 *   payments ledger, one row per payment with the show-calendar day it was
 *   received, netted per enrollment (or desk entry) and method.
 * - Late entries: entries keyed during the show, by their own submission time.
 *
 * An enrollment payment is NOT attributed to entries: it can finish online what
 * the desk started, or pay for one new entry on an enrollment that has older
 * ones, so an entry count derived from it is wrong both ways (Codex round 6).
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
const KEYED_EARLY = '2026-08-27T15:00:00Z';
const AT_SHOW = '2026-09-17T15:00:00Z';

function ledger(
  overrides: Partial<ShowPaymentLedgerRow> &
    Pick<ShowPaymentLedgerRow, 'amount' | 'method' | 'received_on'>
): ShowPaymentLedgerRow {
  return {
    id: `row-${overrides.enrollment_id ?? 'reg-1'}-${overrides.kind ?? 'payment'}-${overrides.method}-${overrides.received_on}-${overrides.amount}`,
    enrollment_id: 'reg-1',
    entry_id: null,
    kind: 'payment',
    ...overrides,
  };
}

function entry(
  id: string,
  submittedAt: string,
  overrides: Partial<ShowDayReconciliationEntry> = {}
): ShowDayReconciliationEntry {
  return {
    id,
    entry_fee: 25,
    payment_status: 'paid',
    payment_method: 'check',
    submitted_at: submittedAt,
    ...overrides,
  };
}

describe('payments received during the show (MYK9-677)', () => {
  it('counts only the desk half of a split payment, under its own method', () => {
    const summary = summarizeShowDayReconciliation([entry('mail-in', KEYED_EARLY)], WINDOW, [
      ledger({ amount: 35, method: 'check', received_on: '2026-08-27' }),
      ledger({ amount: 15, method: 'cash', received_on: '2026-09-17' }),
    ]);

    expect(summary.paymentAmount).toBe(15);
    expect(summary.paymentCount).toBe(1);
    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 15 });
    expect(summary.byMethod.check).toEqual({ count: 0, amount: 0 });
  });

  it('a split payment finished online still counts the desk cash, and moves no entry count', () => {
    // $20 cash at the desk, the rest later marked Paid in Full: Online (not in
    // the ledger). The old attribution read the enrollment as online and lost
    // the desk payment from the entry count.
    const summary = summarizeShowDayReconciliation(
      [entry('mail-in', KEYED_EARLY, { payment_method: 'online' })],
      WINDOW,
      [ledger({ amount: 20, method: 'cash', received_on: '2026-09-17' })]
    );

    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 20 });
    expect(summary.paymentCount).toBe(1);
    expect(summary.lateEntryCount).toBe(0);
  });

  it('cash for one add-on entry on an older enrollment is one payment and inflates no entry count', () => {
    const summary = summarizeShowDayReconciliation(
      [
        entry('old-1', KEYED_EARLY),
        entry('old-2', KEYED_EARLY),
        entry('old-3', KEYED_EARLY),
        entry('add-on', AT_SHOW, { payment_method: 'cash' }),
      ],
      WINDOW,
      [ledger({ amount: 25, method: 'cash', received_on: '2026-09-17' })]
    );

    expect(summary.paymentCount).toBe(1);
    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 25 });
    expect(summary.lateEntryCount).toBe(1);
  });

  it('a show-day payment then Payment Due is no payment and $0', () => {
    const summary = summarizeShowDayReconciliation([], WINDOW, [
      ledger({ amount: 50, method: 'cash', received_on: '2026-09-17' }),
      ledger({ kind: 'reversal', amount: -50, method: 'cash', received_on: '2026-09-17' }),
    ]);

    expect(summary.paymentCount).toBe(0);
    expect(summary.paymentAmount).toBe(0);
    expect(summary.byMethod.cash).toEqual({ count: 0, amount: 0 });
  });

  it('a desk late entry paid cash is counted in both figures, independently', () => {
    const summary = summarizeShowDayReconciliation(
      [entry('desk-1', AT_SHOW, { payment_method: 'cash', entry_fee: 20 })],
      WINDOW,
      [
        ledger({
          enrollment_id: null,
          entry_id: 'desk-1',
          amount: 20,
          method: 'cash',
          received_on: '2026-09-17',
        }),
      ]
    );

    expect(summary.lateEntryCount).toBe(1);
    expect(summary.paymentCount).toBe(1);
    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 20 });
  });

  it('a payment then a partial refund is one payment at the net dollars', () => {
    const summary = summarizeShowDayReconciliation([], WINDOW, [
      ledger({ amount: 50, method: 'cash', received_on: '2026-09-17' }),
      ledger({ kind: 'refund', amount: -20, method: 'cash', received_on: '2026-09-17' }),
    ]);

    expect(summary.byMethod.cash).toEqual({ count: 1, amount: 30 });
  });

  it('a desk payment handed back in full is not a payment', () => {
    const summary = summarizeShowDayReconciliation([], WINDOW, [
      ledger({ amount: 50, method: 'cash', received_on: '2026-09-17' }),
      ledger({ kind: 'refund', amount: -50, method: 'cash', received_on: '2026-09-18' }),
    ]);

    expect(summary.paymentCount).toBe(0);
  });

  it('two desk payments on one enrollment are two payments', () => {
    const summary = summarizeShowDayReconciliation([], WINDOW, [
      ledger({ amount: 20, method: 'cash', received_on: '2026-09-17' }),
      ledger({ amount: 30, method: 'cash', received_on: '2026-09-18' }),
    ]);

    expect(summary.byMethod.cash).toEqual({ count: 2, amount: 50 });
  });

  it('leaves out a check received before the show and a payment the day after', () => {
    const summary = summarizeShowDayReconciliation([], WINDOW, [
      ledger({ amount: 50, method: 'check', received_on: '2026-08-27' }),
      ledger({ enrollment_id: 'reg-2', amount: 50, method: 'cash', received_on: '2026-09-19' }),
      ledger({ enrollment_id: 'reg-3', amount: 10, method: 'cash', received_on: '2026-09-18' }),
    ]);

    expect(summary.paymentAmount).toBe(10);
    expect(summary.paymentCount).toBe(1);
  });

  it('treats a one-day show with no end date as ending on its first day', () => {
    const oneDay: DeskCollectionWindow = { ...WINDOW, showEndDate: null };
    const summary = summarizeShowDayReconciliation([], oneDay, [
      ledger({ amount: 20, method: 'cash', received_on: '2026-09-17' }),
      ledger({ enrollment_id: 'reg-2', amount: 30, method: 'cash', received_on: '2026-09-18' }),
    ]);

    expect(summary.paymentAmount).toBe(20);
  });

  it('reads numeric(10,2) amounts PostgREST hands over as strings', () => {
    const summary = summarizeShowDayReconciliation([], WINDOW, [
      ledger({ amount: '15.00', method: 'cash', received_on: '2026-09-17' }),
    ]);

    expect(summary.paymentAmount).toBe(15);
  });
});
