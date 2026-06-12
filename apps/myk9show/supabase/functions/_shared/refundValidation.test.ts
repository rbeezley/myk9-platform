import { describe, it, expect } from 'vitest';
import { validateRefund } from './refundValidation';

const refundable = {
  entryFeeCents: 5000,
  requestedCents: undefined as number | undefined,
  paymentStatus: 'paid',
  paymentMethod: 'online' as string | null,
  stripePaymentIntentId: 'pi_x',
  payoutStatus: null as string | null,
};

describe('validateRefund', () => {
  it('full refund defaults to exactly the entry fee — the platform fee is never refunded', () => {
    expect(validateRefund(refundable)).toEqual({ amountCents: 5000 });
  });

  it('partial refunds pass through', () => {
    expect(validateRefund({ ...refundable, requestedCents: 2000 })).toEqual({
      amountCents: 2000,
    });
  });

  it('caps at the entry fee', () => {
    expect(validateRefund({ ...refundable, requestedCents: 6000 })).toEqual({
      error: 'amount_exceeds_fee',
    });
  });

  it('rejects zero and negative amounts', () => {
    expect(validateRefund({ ...refundable, requestedCents: 0 })).toEqual({
      error: 'invalid_amount',
    });
    expect(validateRefund({ ...refundable, requestedCents: -100 })).toEqual({
      error: 'invalid_amount',
    });
    expect(validateRefund({ ...refundable, entryFeeCents: 0 })).toEqual({
      error: 'invalid_amount',
    });
  });

  it('blocks after the payout has been sent', () => {
    expect(validateRefund({ ...refundable, payoutStatus: 'completed' })).toEqual({
      error: 'payout_already_sent',
    });
  });

  it('blocks while a transfer is in flight', () => {
    expect(validateRefund({ ...refundable, payoutStatus: 'processing' })).toEqual({
      error: 'payout_in_progress',
    });
  });

  it('allows refunds while a payout row is pending or failed — money is still on the platform', () => {
    expect(validateRefund({ ...refundable, payoutStatus: 'pending' })).toEqual({
      amountCents: 5000,
    });
    expect(validateRefund({ ...refundable, payoutStatus: 'failed' })).toEqual({
      amountCents: 5000,
    });
  });

  it('one refund per entry: already-refunded and other non-paid states are not refundable', () => {
    expect(validateRefund({ ...refundable, paymentStatus: 'refunded' })).toEqual({
      error: 'not_refundable',
    });
    expect(validateRefund({ ...refundable, paymentStatus: 'pending' })).toEqual({
      error: 'not_refundable',
    });
    expect(validateRefund({ ...refundable, paymentStatus: 'waived' })).toEqual({
      error: 'not_refundable',
    });
  });

  it('desk payments (cash/check/waived) and legacy NULL payment methods never reach Stripe', () => {
    expect(validateRefund({ ...refundable, paymentMethod: 'cash' })).toEqual({
      error: 'not_online_payment',
    });
    expect(validateRefund({ ...refundable, paymentMethod: null })).toEqual({
      error: 'not_online_payment',
    });
  });

  it('entries with no payment intent (pre-rollout rows) are not refundable', () => {
    expect(validateRefund({ ...refundable, stripePaymentIntentId: null })).toEqual({
      error: 'missing_payment_intent',
    });
  });
});
