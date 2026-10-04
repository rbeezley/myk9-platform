// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decideCartOverflowRefund } from './cartOverflowRefund';
import { decideEntryPaymentAutoRefund } from './entryPaymentAutoRefund';
import { calculatePlatformFeeCents, type PlatformFeeRates } from './platformFee';
/** The 7/0/0 rates every legacy fixture in this file was priced with. */
const RATES_7: PlatformFeeRates = { percent: 7, flatCents: 0, minCents: 0 };

const base = {
  paymentIntentId: 'pi_cart_123',
  sessionAmountTotalCents: 11_770,
  platformFeeRates: RATES_7,
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

  it('refunds only the entry fees, keeping the service fee, when no line got service', () => {
    expect(
      decideCartOverflowRefund({
        ...base,
        paidLineIds: [],
        noServiceLineIds: ['cart-overflow'],
      })
    ).toEqual({
      action: 'refund',
      amountCents: 6_000,
      paidAmountCents: 5_770,
      reason: 'full_make_whole',
    });
  });

  it('refunds denied or waitlisted lines at their entry fee, never a fee share', () => {
    expect(
      decideCartOverflowRefund({
        ...base,
        paidLineIds: ['entry-ok'],
        noServiceLineIds: ['cart-overflow'],
      })
    ).toEqual({
      action: 'refund',
      amountCents: 6_000,
      paidAmountCents: 5_770,
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
      paidAmountCents: 5_770,
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

/**
 * MYK9-197 B1, then MYK9-966: with the flat component and the floor ON, no part
 * of the fee comes back. The platform keeps the WHOLE fee it charged, asserted
 * against `calculatePlatformFeeCents` rather than a hard-coded number.
 *
 * The cart path and the payment-link path must also produce the IDENTICAL
 * refund from identical inputs; they are two writers of one policy.
 */
describe('cart overflow refunds never return any part of the service fee', () => {
  const lineAmountsById = new Map([
    ['served', 2500],
    ['overflow', 2500],
  ]);

  function refundAt(rates: PlatformFeeRates) {
    const subtotal = 5000;
    const amountCents = subtotal + calculatePlatformFeeCents(subtotal, rates);
    const decision = decideCartOverflowRefund({
      paymentIntentId: 'pi_cart_overflow',
      sessionAmountTotalCents: amountCents,
      paidLineIds: ['served'],
      noServiceLineIds: ['overflow'],
      lineAmountsById,
      platformFeeRates: rates,
    });
    const refund = decision.action === 'refund' ? decision.amountCents : Number.NaN;
    return {
      refund,
      amountCents,
      // What the platform is left holding once the served line's entry fee is
      // set aside — this must equal the WHOLE fee it charged (MYK9-966).
      retainedFeeCents: amountCents - refund - 2500,
      bookedFeeCents: calculatePlatformFeeCents(subtotal, rates),
    };
  }

  it('does not refund any part of a 30¢ flat component', () => {
    const r = refundAt({ percent: 7, flatCents: 30, minCents: 0 });
    expect(r.amountCents).toBe(5380);
    expect(r.refund).toBe(2500);
    expect(r.retainedFeeCents).toBe(r.bookedFeeCents);
  });

  it('does not refund any part of a binding floor', () => {
    const cheap = new Map([
      ['served', 100],
      ['overflow', 100],
    ]);
    const rates: PlatformFeeRates = { percent: 7, flatCents: 0, minCents: 2000 };
    const decision = decideCartOverflowRefund({
      paymentIntentId: 'pi_cart_floor',
      sessionAmountTotalCents: 2200,
      paidLineIds: ['served'],
      noServiceLineIds: ['overflow'],
      lineAmountsById: cheap,
      platformFeeRates: rates,
    });
    expect(decision).toMatchObject({ action: 'refund', amountCents: 100 });
  });

  it('matches the payment-link writer exactly, across the rate matrix', () => {
    let checked = 0;
    for (const percent of [0, 7, 14.5, 20]) {
      for (const flatCents of [0, 30, 500]) {
        for (const minCents of [0, 100, 2000]) {
          const rates: PlatformFeeRates = { percent, flatCents, minCents };
          const subtotal = 5000;
          const amountCents = subtotal + calculatePlatformFeeCents(subtotal, rates);
          const cart = decideCartOverflowRefund({
            paymentIntentId: 'pi',
            sessionAmountTotalCents: amountCents,
            paidLineIds: ['served'],
            noServiceLineIds: ['overflow'],
            lineAmountsById,
            platformFeeRates: rates,
          });
          const link = decideEntryPaymentAutoRefund({
            paymentIntentId: 'pi',
            sessionAmountTotalCents: amountCents,
            validPaidEntryIds: ['served'],
            invalidEntryIds: ['overflow'],
            entryFeesById: lineAmountsById,
            platformFeeRates: rates,
          });
          const cartAmount = cart.action === 'refund' ? cart.amountCents : null;
          const linkAmount = link.action === 'refund' ? link.amountCents : null;
          expect(cartAmount).toBe(linkAmount);
          // And the platform keeps precisely the whole fee it charged.
          expect(amountCents - (cartAmount ?? 0) - 2500).toBe(
            calculatePlatformFeeCents(subtotal, rates)
          );
          checked += 1;
        }
      }
    }
    expect(checked).toBe(4 * 3 * 3);
  });

  it('reports paidAmountCents net of the corrected refund', () => {
    const decision = decideCartOverflowRefund({
      paymentIntentId: 'pi_cart_paid',
      sessionAmountTotalCents: 5380,
      paidLineIds: ['served'],
      noServiceLineIds: ['overflow'],
      lineAmountsById,
      platformFeeRates: { percent: 7, flatCents: 30, minCents: 0 },
    });
    // 5380 − 2500: the served line plus the whole fee the platform retained.
    expect(decision).toMatchObject({ paidAmountCents: 2880 });
  });
});
