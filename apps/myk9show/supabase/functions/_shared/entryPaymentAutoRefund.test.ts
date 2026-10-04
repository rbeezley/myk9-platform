// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decideEntryPaymentAutoRefund } from './entryPaymentAutoRefund';
import type { PlatformFeeRates } from './platformFee';
/** The 7/0/0 rates every legacy fixture in this file was priced with. */
const RATES_7: PlatformFeeRates = { percent: 7, flatCents: 0, minCents: 0 };

const base = {
  paymentIntentId: 'pi_link_123',
  // 11_000 subtotal + 7% = 11_770, i.e. a correctly-collected charge.
  sessionAmountTotalCents: 11_770,
  platformFeeRates: RATES_7,
  entryFeesById: new Map([
    ['fresh', 5_000],
    ['duplicate', 6_000],
  ]),
};

describe('decideEntryPaymentAutoRefund', () => {
  it('does not refund when every paid-for entry was applied', () => {
    expect(
      decideEntryPaymentAutoRefund({
        ...base,
        validPaidEntryIds: ['fresh', 'duplicate'],
        invalidEntryIds: [],
      })
    ).toEqual({ action: 'none' });
  });

  it('refunds only the invalid entry fees, keeping the service fee, when the exhibitor got nothing', () => {
    expect(
      decideEntryPaymentAutoRefund({
        ...base,
        validPaidEntryIds: [],
        invalidEntryIds: ['duplicate'],
      })
    ).toEqual({
      action: 'refund',
      amountCents: 6_000,
      reason: 'full_make_whole',
    });
  });

  it('partial-batch refunds the invalid entry fees and no share of the service fee', () => {
    expect(
      decideEntryPaymentAutoRefund({
        ...base,
        validPaidEntryIds: ['fresh'],
        invalidEntryIds: ['duplicate'],
      })
    ).toEqual({
      action: 'refund',
      amountCents: 6_000,
      reason: 'partial_invalid_entries',
    });
  });

  it('caps the refund at the amount collected minus the service fee', () => {
    expect(
      decideEntryPaymentAutoRefund({
        ...base,
        // Under-collected: 6_500 − fee(11_000) = 5_730 < 6_000.
        sessionAmountTotalCents: 6_500,
        validPaidEntryIds: ['fresh'],
        invalidEntryIds: ['duplicate'],
      })
    ).toEqual({
      action: 'refund',
      amountCents: 5_730,
      reason: 'partial_invalid_entries',
    });
  });

  it('alerts instead of guessing a partial amount when an invalid entry fee is unavailable', () => {
    expect(
      decideEntryPaymentAutoRefund({
        ...base,
        validPaidEntryIds: ['fresh'],
        invalidEntryIds: ['missing'],
      })
    ).toEqual({
      action: 'needs_manual_amount',
      missingFeeEntryIds: ['missing'],
    });
  });

  it('alerts instead of prorating when a valid paid entry fee is unavailable', () => {
    expect(
      decideEntryPaymentAutoRefund({
        ...base,
        validPaidEntryIds: ['missing-valid'],
        invalidEntryIds: ['duplicate'],
      })
    ).toEqual({
      action: 'needs_manual_amount',
      missingFeeEntryIds: ['missing-valid'],
    });
  });

  it('cannot refund without a payment intent or positive captured amount', () => {
    expect(
      decideEntryPaymentAutoRefund({
        ...base,
        paymentIntentId: null,
        validPaidEntryIds: [],
        invalidEntryIds: ['duplicate'],
      })
    ).toEqual({ action: 'cannot_refund', reason: 'missing_payment_intent' });

    expect(
      decideEntryPaymentAutoRefund({
        ...base,
        sessionAmountTotalCents: 0,
        validPaidEntryIds: [],
        invalidEntryIds: ['duplicate'],
      })
    ).toEqual({ action: 'cannot_refund', reason: 'missing_amount' });
  });
});
