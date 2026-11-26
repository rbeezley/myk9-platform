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
    showName: 'Show 1',
    status: 'succeeded',
    orderType: 'entry',
    amountCents: 10700,
    entrySubtotalCents: 10000,
    platformFeeCents: 700,
    platformFeeRate: 0.07,
    stripeProcessingFeeCents: 320,
    refundedCents: 0,
    makeWholeRefundedCents: 0,
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
    showName: null,
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
  it('a fully verified show with a completed payout: full Stripe coverage, settled', () => {
    const rows = buildClubShowReconciliationRows(
      [order({})],
      [payout({})],
      'enabled',
      new Map([['show-1', 'Cedar Valley Classic']])
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      showId: 'show-1',
      showName: 'Cedar Valley Classic',
      chargeVerification: 'AllFeeBreakdowns',
    });
    expect(rows[0].settlement?.badgeLabel).toBe('Paid');
    expect(rows[0].settlement?.state).toBe('settled');
    expect(rows[0].settlement?.stripeTransferId).toBe('tr_123');
  });

  it('missing entry-subtotal snapshot: never a claim of Stripe verification', () => {
    const rows = buildClubShowReconciliationRows(
      [order({ entrySubtotalCents: null, platformFeeCents: null })],
      [],
      'enabled'
    );
    // No snapshot on record → NoFeeBreakdown, never a claim of Stripe verification.
    expect(rows[0].chargeVerification).toBe('SomeFeeBreakdownsMissing');
  });

  it('a cart-overflow order keeps full coverage: a make-whole refund is not a mismatch', () => {
    const rows = buildClubShowReconciliationRows(
      [
        order({
          amountCents: 9350,
          entrySubtotalCents: 5000,
          platformFeeCents: 350,
          refundedCents: 0,
          makeWholeRefundedCents: 4000,
        }),
      ],
      [payout({ amountCents: 5000 })],
      'enabled'
    );
    expect(rows[0].chargeVerification).toBe('AllFeeBreakdowns');
  });

  it('does NOT judge amounts: an odd gross on a snapshotted order keeps full coverage', () => {
    // The amount tie-out inference is gone (see chargeVerification.ts). A gross
    // that does not equal subtotal + fee can mean rounding residue, a desk-side
    // refund, or a legacy write — none of which the row can tell apart, so the
    // treasurer is not shown a red state built on a guess.
    const rows = buildClubShowReconciliationRows([order({ amountCents: 99999 })], [], 'enabled');
    expect(rows[0].chargeVerification).toBe('AllFeeBreakdowns');
  });

  it('one order with no snapshot degrades the WHOLE show to partial coverage', () => {
    // INTENT: never imply a Stripe verification the record cannot back up.
    const rows = buildClubShowReconciliationRows(
      [order({}), order({ entrySubtotalCents: null, platformFeeCents: null })],
      [],
      'enabled'
    );
    expect(rows[0].chargeVerification).toBe('SomeFeeBreakdownsMissing');
  });

  it('a show with a payout but no orders yet: NoStripeCharges, not partial coverage', () => {
    // NoStripeCharges is a positive claim -- "recorded, we just hold no Stripe
    // snapshot". With zero order rows there is no charge to attest to.
    const rows = buildClubShowReconciliationRows([], [payout({})], 'enabled');
    expect(rows[0].chargeVerification).toBe('NoStripeCharges');
    expect(rows[0].settlement?.stripeTransferId).toBe('tr_123');
  });

  it('a show with orders but no payout row yet: settlement is null, not a fabricated state', () => {
    const rows = buildClubShowReconciliationRows([order({})], [], 'enabled');
    expect(rows[0].settlement).toBeNull();
  });

  it('falls back to a generic show label when no name is known', () => {
    const rows = buildClubShowReconciliationRows([order({})], [], 'enabled');
    expect(rows[0].showName).toBe('Show');
  });

  it('orders without a showId are excluded from the grouping', () => {
    const rows = buildClubShowReconciliationRows([order({ showId: null })], [], 'enabled');
    expect(rows).toHaveLength(0);
  });

  it('multiple shows each get their own row', () => {
    const rows = buildClubShowReconciliationRows(
      [order({ orderId: 'o1', showId: 'show-1' }), order({ orderId: 'o2', showId: 'show-2' })],
      [payout({ payoutId: 'p1', showId: 'show-1' })],
      'enabled'
    );
    expect(rows.map(r => r.showId).sort()).toEqual(['show-1', 'show-2']);
  });

  it('a failed payout with a non-benign reason surfaces as attention', () => {
    const rows = buildClubShowReconciliationRows(
      [order({})],
      [payout({ status: 'failed', failureReason: 'account closed', completedAt: null })],
      'enabled'
    );
    expect(rows[0].settlement?.state).toBe('attention');
    expect(rows[0].settlement?.badgeLabel).toBe('Needs attention');
  });
});
