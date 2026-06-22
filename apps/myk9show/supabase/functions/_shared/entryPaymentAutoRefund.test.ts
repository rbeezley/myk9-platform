import { describe, expect, it } from 'vitest';
import { decideEntryPaymentAutoRefund } from './entryPaymentAutoRefund';

const base = {
  paymentIntentId: 'pi_link_123',
  sessionAmountTotalCents: 11_770,
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

  it('make-whole refunds the full charge including platform fee when the exhibitor got nothing', () => {
    expect(
      decideEntryPaymentAutoRefund({
        ...base,
        validPaidEntryIds: [],
        invalidEntryIds: ['duplicate'],
      })
    ).toEqual({
      action: 'refund',
      amountCents: 11_770,
      reason: 'full_make_whole',
    });
  });

  it('partial-batch refunds the invalid entries plus their share of the platform fee', () => {
    expect(
      decideEntryPaymentAutoRefund({
        ...base,
        validPaidEntryIds: ['fresh'],
        invalidEntryIds: ['duplicate'],
      })
    ).toEqual({
      action: 'refund',
      amountCents: 6_420,
      reason: 'partial_invalid_entries',
    });
  });

  it('caps partial refunds to the invalid entries share of the actual collected total', () => {
    expect(
      decideEntryPaymentAutoRefund({
        ...base,
        sessionAmountTotalCents: 10_000,
        validPaidEntryIds: ['fresh'],
        invalidEntryIds: ['duplicate'],
      })
    ).toEqual({
      action: 'refund',
      amountCents: 5_455,
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
