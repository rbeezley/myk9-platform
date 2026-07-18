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
    showName: 'Show 1',
    status: 'succeeded',
    orderType: 'entry',
    amountCents: 5250,
    entrySubtotalCents: 5000,
    platformFeeCents: 250,
    platformFeeRate: 5,
    stripeProcessingFeeCents: 180,
    refundedCents: 0,
    makeWholeRefundedCents: 0,
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
  it('is Verified when a Stripe snapshot was captured for the order', () => {
    expect(resolveOrderChargeVerification(order({}))).toBe('Verified');
  });

  it('is Attested when the snapshot is missing (legacy / desk-recorded order)', () => {
    expect(
      resolveOrderChargeVerification(order({ entrySubtotalCents: null, platformFeeCents: null }))
    ).toBe('Attested');
    expect(resolveOrderChargeVerification(order({ platformFeeCents: null }))).toBe('Attested');
    expect(resolveOrderChargeVerification(order({ entrySubtotalCents: null }))).toBe('Attested');
  });

  // ── THE DELETED INFERENCE. Verification is now a FACT ("do we hold a
  // snapshot?"), never a derived judgement about whether the amounts look right.
  // The old tie-out fired on rounding residue, legacy rows, partial refunds and
  // desk refunds alike; these cases pin that it no longer renders a red state.
  it('does NOT judge amounts: a legitimate cart-overflow order stays Verified', () => {
    expect(
      resolveOrderChargeVerification(
        order({
          amountCents: 9350,
          entrySubtotalCents: 5000,
          platformFeeCents: 350,
          makeWholeRefundedCents: 4000,
        })
      )
    ).toBe('Verified');
  });

  it('does NOT judge amounts: rounding residue on a split stays Verified', () => {
    expect(resolveOrderChargeVerification(order({ amountCents: 5251 }))).toBe('Verified');
    expect(resolveOrderChargeVerification(order({ amountCents: 6000 }))).toBe('Verified');
  });

  it('does NOT judge amounts: a post-hoc refund leaves the order Verified', () => {
    expect(
      resolveOrderChargeVerification(
        order({ amountCents: 5250, refundedCents: 2000, makeWholeRefundedCents: 0 })
      )
    ).toBe('Verified');
  });
});

describe('resolveEntryChargeVerification', () => {
  it('Attested for check, cash, or waived (no Stripe trace, stays in totals)', () => {
    expect(resolveEntryChargeVerification({ paymentLabel: 'Check' })).toBe('Attested');
    expect(resolveEntryChargeVerification({ paymentLabel: 'Cash' })).toBe('Attested');
    expect(resolveEntryChargeVerification({ paymentLabel: 'Waived/Comped' })).toBe('Attested');
  });

  it('Verified when an online line has a matched order snapshot', () => {
    expect(
      resolveEntryChargeVerification({ paymentLabel: 'Online', matchedOrder: order({}) })
    ).toBe('Verified');
  });

  it('Attested — never red — when an online line has no matched order snapshot', () => {
    expect(resolveEntryChargeVerification({ paymentLabel: 'Online', matchedOrder: null })).toBe(
      'Attested'
    );
  });

  it('Attested when the matched order carries no snapshot columns', () => {
    expect(
      resolveEntryChargeVerification({
        paymentLabel: 'Online',
        matchedOrder: order({ entrySubtotalCents: null, platformFeeCents: null }),
      })
    ).toBe('Attested');
  });

  it('does NOT judge amounts: an odd-looking online line is still Verified', () => {
    expect(
      resolveEntryChargeVerification({
        paymentLabel: 'Online',
        matchedOrder: order({ amountCents: 9999 }),
      })
    ).toBe('Verified');
  });
});
