import { describe, expect, it } from 'vitest';
import {
  isDeskAttestedLabel,
  resolveEntryChargeVerification,
  resolveOrderChargeVerification,
} from './chargeVerification';
import type { FinancialReconciliationOrder } from './financialReconciliation';

function order(overrides: Partial<FinancialReconciliationOrder>): FinancialReconciliationOrder {
  return {
    orderId: 'order-1',
    showId: 'show-1',
    status: 'succeeded',
    orderType: 'entry',
    amountCents: 5250,
    entrySubtotalCents: 5000,
    platformFeeCents: 250,
    platformFeeRate: 5,
    stripeProcessingFeeCents: 180,
    refundedCents: 0,
    stripePaymentIntentId: 'pi_1',
    createdAt: '2026-07-17T00:00:00Z',
    paidAt: '2026-07-17T00:00:00Z',
    refundedAt: null,
    ...overrides,
  };
}

describe('isDeskAttestedLabel', () => {
  it('treats desk/manual labels as attested and Stripe-backed labels as not', () => {
    for (const label of [
      'Check',
      'Cash',
      'Waived/Comped',
      'Secretary Paid',
      'Group Payment',
      'Pending',
    ]) {
      expect(isDeskAttestedLabel(label)).toBe(true);
    }
    for (const label of ['Online', 'Refunded', 'Partial Refund']) {
      expect(isDeskAttestedLabel(label)).toBe(false);
    }
  });
});

describe('resolveOrderChargeVerification', () => {
  it('is Verified when subtotal + fee ties to the charged amount', () => {
    expect(resolveOrderChargeVerification(order({}))).toBe('Verified');
  });

  it('allows a 1-cent rounding tolerance', () => {
    expect(resolveOrderChargeVerification(order({ amountCents: 5251 }))).toBe('Verified');
  });

  it('is Mismatch when amounts do not tie', () => {
    expect(resolveOrderChargeVerification(order({ amountCents: 6000 }))).toBe('Mismatch');
  });

  it('is Mismatch when the snapshot is missing', () => {
    expect(
      resolveOrderChargeVerification(order({ entrySubtotalCents: null, platformFeeCents: null }))
    ).toBe('Mismatch');
  });
});

describe('resolveEntryChargeVerification', () => {
  it('Attested for check, cash, or waived (no Stripe trace, stays in totals)', () => {
    expect(resolveEntryChargeVerification({ paymentLabel: 'Check' })).toBe('Attested');
    expect(resolveEntryChargeVerification({ paymentLabel: 'Cash' })).toBe('Attested');
    expect(resolveEntryChargeVerification({ paymentLabel: 'Waived/Comped' })).toBe('Attested');
  });

  it('Verified when an online line ties to its matched order snapshot', () => {
    expect(
      resolveEntryChargeVerification({ paymentLabel: 'Online', matchedOrder: order({}) })
    ).toBe('Verified');
  });

  it('Mismatch when an online line has no matched order snapshot', () => {
    expect(resolveEntryChargeVerification({ paymentLabel: 'Online', matchedOrder: null })).toBe(
      'Mismatch'
    );
  });

  it('Mismatch when an online line ties to a snapshot with wrong amounts', () => {
    expect(
      resolveEntryChargeVerification({
        paymentLabel: 'Online',
        matchedOrder: order({ amountCents: 9999 }),
      })
    ).toBe('Mismatch');
  });
});
