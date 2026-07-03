import { describe, expect, it } from 'vitest';
import {
  buildPaymentDisplayRows,
  formatPaymentCents,
  paymentStatusLabel,
  type PaymentPresentationSource,
} from './moneyPresentation';

function payment(overrides: Partial<PaymentPresentationSource> = {}): PaymentPresentationSource {
  return {
    id: 'order-1',
    date: '2026-06-10T00:00:00Z',
    showId: 'show-1',
    showName: 'Spring Trial',
    amountCents: 5300,
    currency: 'usd',
    status: 'succeeded',
    reference: 'pi_abc123',
    entryIds: ['entry-1'],
    ...overrides,
  };
}

describe('moneyPresentation', () => {
  it('formats cents as currency, including signed refund rows', () => {
    expect(formatPaymentCents(5300, 'usd')).toBe('$53.00');
    expect(formatPaymentCents(-3000, 'usd')).toBe('-$30.00');
  });

  it('labels known payment statuses without leaking raw tokens', () => {
    expect(paymentStatusLabel('succeeded')).toBe('Paid');
    expect(paymentStatusLabel('canceled')).toBe('Cancelled');
    expect(paymentStatusLabel('processing')).toBe('Processing');
  });

  it('builds separate charge and refund rows so refunds are visible, not silently netted', () => {
    const rows = buildPaymentDisplayRows([
      payment({
        refunds: [
          {
            entryId: 'entry-1',
            amountCents: 3000,
            date: '2026-06-12T00:00:00Z',
            label: 'Copper - Advanced A',
          },
        ],
      }),
    ]);

    expect(rows).toMatchObject([
      { id: 'order-1:charge', kind: 'charge', description: 'Online entry fees', amountCents: 5300 },
      {
        id: 'order-1:refund:entry-1',
        kind: 'refund',
        description: 'Refund - Copper - Advanced A',
        amountCents: -3000,
        status: 'refunded',
      },
    ]);
    expect(rows.reduce((sum, row) => sum + row.amountCents, 0)).toBe(2300);
  });

  it('keeps legacy fully-refunded order rows as signed refund rows when no entry refund detail exists', () => {
    const rows = buildPaymentDisplayRows([payment({ status: 'refunded', refunds: [] })]);

    expect(rows).toMatchObject([
      { id: 'order-1:refund', kind: 'refund', description: 'Refund', amountCents: -5300 },
    ]);
  });
});
