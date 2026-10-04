// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cartOverflowKeptFeeCents, decideCartOverflowRefund } from './cartOverflowRefund';
import { decideEntryPaymentAutoRefund } from './entryPaymentAutoRefund';
import { calculatePlatformFeeCents, type PlatformFeeRates } from './platformFee';
/** The 7/0/0 rates every legacy fixture in this file was priced with. */
const RATES_7: PlatformFeeRates = { percent: 7, flatCents: 0, minCents: 0 };

// Two lines, $50.00 and $60.00, 7%: fee(11000) = 770, charged 11770.
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

  it('refunds the WHOLE charge, service fee included, when no line got service', () => {
    expect(
      decideCartOverflowRefund({
        ...base,
        paidLineIds: [],
        noServiceLineIds: ['entry-ok', 'cart-overflow'],
      })
    ).toEqual({
      action: 'refund',
      amountCents: 11_770,
      paidAmountCents: 0,
      reason: 'full_make_whole',
    });
  });

  it('refunds an unserved line its entry fee plus its share of the service fee', () => {
    // 6000 + (fee(11000) − fee(5000)) = 6000 + (770 − 350) = 6420.
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

/**
 * MYK9-197 B1 still holds under the owner's full-refund rule (2026-10-04):
 * what comes back is the share of the fee the unserved lines CAUSED. The flat
 * per-checkout component and the floor stay with the served lines, so the
 * platform keeps exactly fee(servedSubtotal), asserted against
 * `calculatePlatformFeeCents` rather than a hard-coded number.
 */
describe('cart overflow refunds the unserved share of the fee, never the flat or the floor', () => {
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
      // set aside: exactly the fee on the served line.
      retainedFeeCents: amountCents - refund - 2500,
      keptFeeCents: cartOverflowKeptFeeCents({ paidSubtotalCents: 2500, rates }),
    };
  }

  it('keeps the whole 30¢ flat component with the served line', () => {
    const r = refundAt({ percent: 7, flatCents: 30, minCents: 0 });
    expect(r.amountCents).toBe(5380);
    // 2500 + (380 − 205) = 2675: the overflow line's 175¢ percentage share only.
    expect(r.refund).toBe(2675);
    expect(r.retainedFeeCents).toBe(r.keptFeeCents);
    expect(r.keptFeeCents).toBe(205);
  });

  it('keeps a binding floor with the served line', () => {
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
    // fee(200) = fee(100) = 2000: the unserved line caused none of it.
    expect(decision).toMatchObject({ action: 'refund', amountCents: 100 });
  });

  it('across the rate matrix: the platform keeps fee(served), and never less than a payment link would refund', () => {
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
          const cartAmount = cart.action === 'refund' ? cart.amountCents : 0;
          const linkAmount = link.action === 'refund' ? link.amountCents : 0;
          // The payment link keeps the entry-fees-only rule (MYK9-966).
          expect(cartAmount).toBeGreaterThanOrEqual(linkAmount);
          expect(amountCents - cartAmount - 2500).toBe(calculatePlatformFeeCents(2500, rates));
          checked += 1;
        }
      }
    }
    expect(checked).toBe(4 * 3 * 3);
  });

  it('reports paidAmountCents net of the refund', () => {
    const decision = decideCartOverflowRefund({
      paymentIntentId: 'pi_cart_paid',
      sessionAmountTotalCents: 5380,
      paidLineIds: ['served'],
      noServiceLineIds: ['overflow'],
      lineAmountsById,
      platformFeeRates: { percent: 7, flatCents: 30, minCents: 0 },
    });
    // 5380 − 2675: the served line plus the fee on the served line.
    expect(decision).toMatchObject({ paidAmountCents: 2705 });
  });
});
