import { describe, it, expect } from 'vitest';
import { summarizeMyPayments, type PaymentSummaryRow } from './paymentsSummary';

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

  it('subtracts refunded rows (signed-aware) so a refund reduces spend', () => {
    const result = summarizeMyPayments([
      row({ amountCents: 5000, status: 'succeeded' }),
      row({ amountCents: 2000, status: 'refunded' }),
    ]);
    expect(result).toEqual([{ currency: 'usd', totalPaidCents: 3000, paymentCount: 2 }]);
  });

  it('nets a fully refunded payment to zero spend', () => {
    const result = summarizeMyPayments([
      row({ amountCents: 4000, status: 'succeeded' }),
      row({ amountCents: 4000, status: 'refunded' }),
    ]);
    expect(result).toEqual([{ currency: 'usd', totalPaidCents: 0, paymentCount: 2 }]);
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

  it('treats status case-insensitively', () => {
    const result = summarizeMyPayments([
      row({ amountCents: 1000, status: 'SUCCEEDED' }),
      row({ amountCents: 500, status: 'Refunded' }),
    ]);
    expect(result).toEqual([{ currency: 'usd', totalPaidCents: 500, paymentCount: 2 }]);
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
