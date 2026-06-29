import { describe, expect, it } from 'vitest';
import { decideCartOverflowRefund } from './cartOverflowRefund';

const base = {
  paymentIntentId: 'pi_cart_123',
  sessionAmountTotalCents: 11_770,
  lineAmountsById: new Map([
    ['entry-ok', 5_000],
    ['cart-overflow', 6_000],
  ]),
};

describe('decideCartOverflowRefund', () => {
  it('does not refund when every collected cart line became a paid entry', () => {
    expect(
      decideCartOverflowRefund({
        ...base,
        paidLineIds: ['entry-ok', 'cart-overflow'],
        noServiceLineIds: [],
      })
    ).toEqual({ action: 'none', paidAmountCents: 11_770 });
  });

  it('make-whole refunds the full charge including platform fee when no line got service', () => {
    expect(
      decideCartOverflowRefund({
        ...base,
        paidLineIds: [],
        noServiceLineIds: ['cart-overflow'],
      })
    ).toEqual({
      action: 'refund',
      amountCents: 11_770,
      paidAmountCents: 0,
      reason: 'full_make_whole',
    });
  });

  it('refunds denied or waitlisted lines plus their platform-fee share', () => {
    expect(
      decideCartOverflowRefund({
        ...base,
        paidLineIds: ['entry-ok'],
        noServiceLineIds: ['cart-overflow'],
      })
    ).toEqual({
      action: 'refund',
      amountCents: 6_420,
      paidAmountCents: 5_350,
      reason: 'partial_no_service_lines',
    });
  });

  it('keeps paid amount separate from entry ids when refund creation cannot run', () => {
    expect(
      decideCartOverflowRefund({
        ...base,
        paymentIntentId: null,
        paidLineIds: ['entry-ok'],
        noServiceLineIds: ['cart-overflow'],
      })
    ).toEqual({
      action: 'cannot_refund',
      reason: 'missing_payment_intent',
      paidAmountCents: 5_350,
    });
  });

  it('does not guess a prorated amount when a collected line amount is unavailable', () => {
    expect(
      decideCartOverflowRefund({
        ...base,
        paidLineIds: ['entry-ok'],
        noServiceLineIds: ['missing-overflow'],
      })
    ).toEqual({
      action: 'needs_manual_amount',
      missingLineIds: ['missing-overflow'],
      paidAmountCents: null,
    });
  });
});
