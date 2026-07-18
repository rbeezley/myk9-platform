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
  it('is Verified when subtotal + fee ties to the charged amount', () => {
    expect(resolveOrderChargeVerification(order({}))).toBe('Verified');
  });

  it('allows a 1-cent rounding tolerance', () => {
    expect(resolveOrderChargeVerification(order({ amountCents: 5251 }))).toBe('Verified');
  });

  // ── ROOT FIX (review finding 2): the tie-out must include the make-whole term.
  it('VERIFIES a legitimate cart-overflow order instead of flagging it Mismatch', () => {
    // $93.50 charged gross; only $50.00 of lines accepted (+$3.50 fee); $40.00
    // returned as a make-whole refund for lines that were never accepted.
    // Ties out exactly: 9350 == 5000 + 350 + 4000.
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

  it('still MISMATCHES a genuinely-off order (the check stays falsifiable)', () => {
    // Same overflow shape, but the gross is $1.00 more than the parts explain.
    // Because make_whole is recorded explicitly rather than derived from
    // amount − subtotal − fee, this discrepancy cannot be absorbed away.
    expect(
      resolveOrderChargeVerification(
        order({
          amountCents: 9450,
          entrySubtotalCents: 5000,
          platformFeeCents: 350,
          makeWholeRefundedCents: 4000,
        })
      )
    ).toBe('Mismatch');
  });

  it('MISMATCHES when make-whole is claimed but the gross does not include it', () => {
    // amount == subtotal + fee while make_whole > 0: the money was never charged,
    // so it could not have been made whole. Under the OLD amount == subtotal + fee
    // rule this passed silently.
    expect(
      resolveOrderChargeVerification(
        order({
          amountCents: 5350,
          entrySubtotalCents: 5000,
          platformFeeCents: 350,
          makeWholeRefundedCents: 4000,
        })
      )
    ).toBe('Mismatch');
  });

  it('does not let a POST-HOC refund affect the charge tie-out', () => {
    // A post-hoc refund happens AFTER the charge; the gross still equals the
    // accepted parts, so the order remains Verified.
    expect(
      resolveOrderChargeVerification(
        order({ amountCents: 5250, refundedCents: 2000, makeWholeRefundedCents: 0 })
      )
    ).toBe('Verified');
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
