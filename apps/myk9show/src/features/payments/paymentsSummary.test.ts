import { describe, it, expect } from 'vitest';
import {
  summarizeMyPayments,
  summarizePaymentDisplayRows,
  type PaymentSummaryRow,
} from './paymentsSummary';

function row(p: Partial<PaymentSummaryRow>): PaymentSummaryRow {
  return {
    amountCents: 2500,
    currency: 'usd',
    status: 'succeeded',
    ...p,
  };
}

describe('summarizeMyPayments', () => {
  it('returns no buckets for an empty list', () => {
    expect(summarizeMyPayments([])).toEqual([]);
  });

  it('sums succeeded and paid rows into a single currency total', () => {
    const result = summarizeMyPayments([
      row({ amountCents: 2500, status: 'succeeded' }),
      row({ amountCents: 3000, status: 'paid' }),
    ]);
    expect(result).toEqual([{ currency: 'usd', totalPaidCents: 5500, paymentCount: 2 }]);
  });

  it('excludes refunded orders from the total (amount is the gross charge, not a refund delta)', () => {
    // The refunded row carries its original $20 charge, NOT a $20 refund. It is
    // dropped, not subtracted, so the total is the paid order alone.
    const result = summarizeMyPayments([
      row({ amountCents: 5000, status: 'succeeded' }),
      row({ amountCents: 2000, status: 'refunded' }),
    ]);
    expect(result).toEqual([{ currency: 'usd', totalPaidCents: 5000, paymentCount: 1 }]);
  });

  it('yields no spend when every order was refunded', () => {
    // A single fully refunded order means $0 net spent — no bucket at all,
    // rather than a misleading negative or gross figure.
    const result = summarizeMyPayments([row({ amountCents: 4000, status: 'refunded' })]);
    expect(result).toEqual([]);
  });

  it('yields no spend when a succeeded order was fully refunded through entries', () => {
    const result = summarizeMyPayments([
      row({ amountCents: 4000, netPaidCents: 0, status: 'succeeded' }),
    ]);
    expect(result).toEqual([]);
  });

  it('ignores non-settled rows (failed, cancelled, pending, unknown)', () => {
    const result = summarizeMyPayments([
      row({ amountCents: 2500, status: 'succeeded' }),
      row({ amountCents: 9999, status: 'failed' }),
      row({ amountCents: 9999, status: 'cancelled' }),
      row({ amountCents: 9999, status: 'pending' }),
      row({ amountCents: 9999, status: 'unknown' }),
    ]);
    expect(result).toEqual([{ currency: 'usd', totalPaidCents: 2500, paymentCount: 1 }]);
  });

  it('treats status case-insensitively (SUCCEEDED counts, Refunded is excluded)', () => {
    const result = summarizeMyPayments([
      row({ amountCents: 1000, status: 'SUCCEEDED' }),
      row({ amountCents: 500, status: 'Refunded' }),
    ]);
    expect(result).toEqual([{ currency: 'usd', totalPaidCents: 1000, paymentCount: 1 }]);
  });

  it('groups mixed currencies into separate buckets, sorted by currency', () => {
    const result = summarizeMyPayments([
      row({ amountCents: 2500, currency: 'usd', status: 'succeeded' }),
      row({ amountCents: 4000, currency: 'cad', status: 'paid' }),
      row({ amountCents: 1000, currency: 'usd', status: 'succeeded' }),
    ]);
    expect(result).toEqual([
      { currency: 'cad', totalPaidCents: 4000, paymentCount: 1 },
      { currency: 'usd', totalPaidCents: 3500, paymentCount: 2 },
    ]);
  });

  it('normalizes currency case so USD and usd share one bucket', () => {
    const result = summarizeMyPayments([
      row({ amountCents: 1000, currency: 'USD', status: 'succeeded' }),
      row({ amountCents: 2000, currency: 'usd', status: 'succeeded' }),
    ]);
    expect(result).toEqual([{ currency: 'usd', totalPaidCents: 3000, paymentCount: 2 }]);
  });
});

describe('summarizePaymentDisplayRows', () => {
  it('sums visible charge and refund rows into the displayed net total', () => {
    expect(
      summarizePaymentDisplayRows([
        { amountCents: 10000, currency: 'usd' },
        { amountCents: -5300, currency: 'usd' },
      ])
    ).toEqual([{ currency: 'usd', totalPaidCents: 4700, paymentCount: 1 }]);
  });

  it('omits buckets when visible rows net to zero or less', () => {
    expect(
      summarizePaymentDisplayRows([
        { amountCents: 3000, currency: 'usd' },
        { amountCents: -3000, currency: 'usd' },
      ])
    ).toEqual([]);
  });
});
