// @vitest-environment node
//
// Owner rule (2026-10-04, MYK9-964 follow-up): a cart line that could not be
// entered is refunded in FULL, its entry fee plus its share of the service
// fee. "Its share" is the incremental one, fee(full) − fee(served), so the
// flat component and the floor stay with the served lines, and with nothing
// served the refund is the whole charge. The order books the fee it keeps,
// fee(served), so the tie-out
//   amount_cents == entry_subtotal_cents + platform_fee_cents + make_whole_refunded_cents
// is exactly zero once the refund is approved.
//
// Worked examples: three $30.00 lines, at 7%, at 7% + 30¢ flat, and at 7%
// with a $20.00 floor.
import { describe, expect, it } from 'vitest';
import {
  cartOverflowKeptFeeCents,
  cartOverflowRefundAmountCents,
  decideCartOverflowRefund,
} from './cartOverflowRefund';
import { orderTieOutDeltaCents } from './orderSnapshot';
import { calculatePlatformFeeCents, type PlatformFeeRates } from './platformFee';

const LINES = new Map([
  ['a', 3000],
  ['b', 3000],
  ['c', 3000],
]);

/** [label, rates, charged, 1-unserved refund, kept fee when 1 unserved]. */
const SHAPES: [string, PlatformFeeRates, number, number, number][] = [
  // fee(9000) = 630; fee(6000) = 420: refund 3000 + 210.
  ['7%', { percent: 7, flatCents: 0, minCents: 0 }, 9630, 3210, 420],
  // fee(9000) = 660; fee(6000) = 450: the 30¢ flat stays with the served lines.
  ['7% + 30¢ flat', { percent: 7, flatCents: 30, minCents: 0 }, 9660, 3210, 450],
  // fee(9000) = fee(6000) = 2000: the floor stays with the served lines.
  ['7% with a $20 floor', { percent: 7, flatCents: 0, minCents: 2000 }, 11000, 3000, 2000],
];

function decide(rates: PlatformFeeRates, charged: number, unserved: string[]) {
  return decideCartOverflowRefund({
    paymentIntentId: 'pi_full',
    sessionAmountTotalCents: charged,
    paidLineIds: ['a', 'b', 'c'].filter(id => !unserved.includes(id)),
    noServiceLineIds: unserved,
    lineAmountsById: LINES,
    platformFeeRates: rates,
  });
}

describe('cart overflow refunds the full share of an unserved line', () => {
  it.each(SHAPES)('%s: prices three $30 lines as charged', (_l, rates, charged) => {
    expect(9000 + calculatePlatformFeeCents(9000, rates)).toBe(charged);
  });

  it.each(SHAPES)(
    '%s: 1 of 3 unserved refunds its entry fee plus its fee share',
    (_l, rates, charged, refund, kept) => {
      expect(decide(rates, charged, ['c'])).toEqual({
        action: 'refund',
        amountCents: refund,
        paidAmountCents: charged - refund,
        reason: 'partial_no_service_lines',
      });
      expect(cartOverflowKeptFeeCents({ paidSubtotalCents: 6000, rates })).toBe(kept);
      // Club 6000 + platform keeps fee(6000) + refund = everything charged.
      expect(6000 + kept + refund).toBe(charged);
    }
  );

  it.each(SHAPES)('%s: all 3 unserved refunds the whole charge', (_l, rates, charged) => {
    expect(decide(rates, charged, ['a', 'b', 'c'])).toEqual({
      action: 'refund',
      amountCents: charged,
      paidAmountCents: 0,
      reason: 'full_make_whole',
    });
    expect(cartOverflowKeptFeeCents({ paidSubtotalCents: 0, rates })).toBe(0);
  });
});

describe('the order snapshot books the fee the platform keeps, and ties out to zero', () => {
  it.each(SHAPES)('%s', (_l, rates, charged) => {
    for (const unserved of [['c'], ['b', 'c'], ['a', 'b', 'c']]) {
      const decision = decide(rates, charged, unserved);
      const paidSubtotal = 9000 - unserved.length * 3000;
      expect(decision.action).toBe('refund');
      expect(
        orderTieOutDeltaCents({
          amount_cents: charged,
          entry_subtotal_cents: paidSubtotal,
          platform_fee_cents: cartOverflowKeptFeeCents({ paidSubtotalCents: paidSubtotal, rates }),
          make_whole_refunded_cents: decision.action === 'refund' ? decision.amountCents : 0,
        })
      ).toBe(0);
    }
  });
});

describe('under-collection: the refund scales down and never exceeds what was collected', () => {
  const rates: PlatformFeeRates = { percent: 7, flatCents: 0, minCents: 0 };

  it('1 of 3 unserved, $92.00 collected of $96.30: refund scales by 9200/9630', () => {
    // round(3210 × 9200 / 9630) = round(3066.67) = 3067.
    expect(
      cartOverflowRefundAmountCents({
        unservedEntryFeeCents: 3000,
        fullSubtotalCents: 9000,
        amountTotalCents: 9200,
        rates,
      })
    ).toBe(3067);
  });

  it('all unserved, $92.00 collected: refunds exactly what was collected', () => {
    expect(
      cartOverflowRefundAmountCents({
        unservedEntryFeeCents: 9000,
        fullSubtotalCents: 9000,
        amountTotalCents: 9200,
        rates,
      })
    ).toBe(9200);
  });

  it('never exceeds the collected amount, at any rate shape or collection', () => {
    for (const [, shapeRates, charged] of SHAPES) {
      for (const collected of [0, 1, 999, charged - 1, charged]) {
        for (const unserved of [3000, 6000, 9000]) {
          const refund = cartOverflowRefundAmountCents({
            unservedEntryFeeCents: unserved,
            fullSubtotalCents: 9000,
            amountTotalCents: collected,
            rates: shapeRates,
          });
          expect(refund).toBeGreaterThanOrEqual(0);
          expect(refund).toBeLessThanOrEqual(collected);
        }
      }
    }
  });

  it('collecting MORE than the lines are worth does not grow the refund', () => {
    expect(
      cartOverflowRefundAmountCents({
        unservedEntryFeeCents: 3000,
        fullSubtotalCents: 9000,
        amountTotalCents: 20000,
        rates,
      })
    ).toBe(3210);
  });
});
