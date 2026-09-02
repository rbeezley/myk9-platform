import { describe, it, expect } from 'vitest';
import { summarizePaymentLedgerTotals } from './paymentsSummary';

describe('summarizePaymentLedgerTotals', () => {
  it('separates gross paid, refunds, and net paid for the visible ledger', () => {
    expect(
      summarizePaymentLedgerTotals([
        { amountCents: 10000, currency: 'usd', status: 'succeeded' },
        { amountCents: -5300, currency: 'usd', status: 'refunded' },
      ])
    ).toEqual([
      {
        currency: 'usd',
        grossPaidCents: 10000,
        refundCents: 5300,
        netPaidCents: 4700,
        paymentCount: 1,
        refundCount: 1,
      },
    ]);
  });

  it('ignores non-settled positive rows while still counting refund rows', () => {
    // netPaidCents was pinned at 0 here by a `Math.max(0, ...)` clamp. Over the
    // whole ledger a refund always sits beside the charge it reverses, so the
    // clamp only ever fired on inputs `buildPaymentDisplayRows` cannot emit —
    // and it reported "$0.00 net" for money that came back. Now signed.
    expect(
      summarizePaymentLedgerTotals([
        { amountCents: 10000, currency: 'usd', status: 'failed' },
        { amountCents: -3000, currency: 'usd', status: 'refunded' },
      ])
    ).toEqual([
      {
        currency: 'usd',
        grossPaidCents: 0,
        refundCents: 3000,
        netPaidCents: -3000,
        paymentCount: 0,
        refundCount: 1,
      },
    ]);
  });

  it('reports a negative net for a period holding only a refund', () => {
    // The real shape once the ledger can be scoped to one calendar year: a
    // 2026 refund of a 2025 charge. Clamping said "Net paid $0.00" for $30
    // that demonstrably came back, which is wrong on a cash basis.
    expect(summarizePaymentLedgerTotals([{ amountCents: -3000, currency: 'usd', status: 'refunded' }])).toEqual([
      {
        currency: 'usd',
        grossPaidCents: 0,
        refundCents: 3000,
        netPaidCents: -3000,
        paymentCount: 0,
        refundCount: 1,
      },
    ]);
  });
});
