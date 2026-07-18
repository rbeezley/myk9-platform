import { describe, expect, it } from 'vitest';
import { buildClubShowReconciliationRows } from './clubShowReconciliation';
import type {
  FinancialReconciliationOrder,
  FinancialReconciliationPayout,
} from './financialReconciliation';

function order(overrides: Partial<FinancialReconciliationOrder>): FinancialReconciliationOrder {
  return {
    orderId: 'order-1',
    showId: 'show-1',
    status: 'succeeded',
    orderType: 'entry',
    amountCents: 10700,
    entrySubtotalCents: 10000,
    platformFeeCents: 700,
    platformFeeRate: 0.07,
    stripeProcessingFeeCents: 320,
    refundedCents: 0,
    stripePaymentIntentId: 'pi_123',
    createdAt: '2026-07-01T00:00:00Z',
    paidAt: '2026-07-01T00:00:00Z',
    refundedAt: null,
    ...overrides,
  };
}

function payout(overrides: Partial<FinancialReconciliationPayout>): FinancialReconciliationPayout {
  return {
    payoutId: 'payout-1',
    showId: 'show-1',
    status: 'completed',
    amountCents: 10000,
    stripeTransferId: 'tr_123',
    scheduledDate: null,
    completedAt: '2026-07-05T00:00:00Z',
    failureReason: null,
    createdAt: '2026-07-04T00:00:00Z',
    ...overrides,
  };
}

describe('buildClubShowReconciliationRows', () => {
  it('a fully verified show with a completed payout: available net, Verified, settled', () => {
    const rows = buildClubShowReconciliationRows(
      [order({})],
      [payout({})],
      true,
      new Map([['show-1', 'Cedar Valley Classic']])
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      showId: 'show-1',
      showName: 'Cedar Valley Classic',
      net: { status: 'available', netCents: 10000 },
      chargeVerification: 'Verified',
    });
    expect(rows[0].settlement?.badgeLabel).toBe('Paid');
    expect(rows[0].settlement?.state).toBe('settled');
    expect(rows[0].settlement?.stripeTransferId).toBe('tr_123');
  });

  it('null processing fee: net reads pending, never $0 or Verified-implying a number', () => {
    const rows = buildClubShowReconciliationRows(
      [order({ stripeProcessingFeeCents: null })],
      [],
      true
    );
    expect(rows[0].net).toEqual({ status: 'pending' });
  });

  it('missing entry-subtotal snapshot: net is pending, not a false $0', () => {
    const rows = buildClubShowReconciliationRows(
      [order({ entrySubtotalCents: null, platformFeeCents: null })],
      [],
      true
    );
    expect(rows[0].net).toEqual({ status: 'pending' });
    // Missing snapshot also can't be verified.
    expect(rows[0].chargeVerification).toBe('Mismatch');
  });

  it('a mismatched order amount marks the whole show Mismatch', () => {
    const rows = buildClubShowReconciliationRows(
      [order({ amountCents: 99999 })], // does not tie to subtotal + fee
      [],
      true
    );
    expect(rows[0].chargeVerification).toBe('Mismatch');
  });

  it('a show with a payout but no orders yet: Attested, net pending, settlement present', () => {
    const rows = buildClubShowReconciliationRows([], [payout({})], true);
    expect(rows[0].chargeVerification).toBe('Attested');
    expect(rows[0].net).toEqual({ status: 'pending' });
    expect(rows[0].settlement?.stripeTransferId).toBe('tr_123');
  });

  it('a show with orders but no payout row yet: settlement is null, not a fabricated state', () => {
    const rows = buildClubShowReconciliationRows([order({})], [], true);
    expect(rows[0].settlement).toBeNull();
  });

  it('falls back to a generic show label when no name is known', () => {
    const rows = buildClubShowReconciliationRows([order({})], [], true);
    expect(rows[0].showName).toBe('Show');
  });

  it('orders without a showId are excluded from the grouping', () => {
    const rows = buildClubShowReconciliationRows([order({ showId: null })], [], true);
    expect(rows).toHaveLength(0);
  });

  it('multiple shows each get their own row', () => {
    const rows = buildClubShowReconciliationRows(
      [order({ orderId: 'o1', showId: 'show-1' }), order({ orderId: 'o2', showId: 'show-2' })],
      [payout({ payoutId: 'p1', showId: 'show-1' })],
      true
    );
    expect(rows.map(r => r.showId).sort()).toEqual(['show-1', 'show-2']);
  });

  it('a failed payout with a non-benign reason surfaces as attention', () => {
    const rows = buildClubShowReconciliationRows(
      [order({})],
      [payout({ status: 'failed', failureReason: 'account closed', completedAt: null })],
      true
    );
    expect(rows[0].settlement?.state).toBe('attention');
    expect(rows[0].settlement?.badgeLabel).toBe('Needs attention');
  });
});
