// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  calculatePlatformFeeCents,
  makeWholeRefundCents,
  normalizePlatformFeeRates,
  resolvePlatformFeePercent,
  resolvePlatformFeeFlatCents,
  resolvePlatformFeeMinCents,
  type PlatformFeeRates,
} from './platformFee';

const rates = (percent: number, flatCents = 0, minCents = 0): PlatformFeeRates => ({
  percent,
  flatCents,
  minCents,
});

describe('calculatePlatformFeeCents', () => {
  it('computes 3% of the subtotal in cents', () => {
    expect(calculatePlatformFeeCents(10000, rates(3))).toBe(300);
  });

  it('rounds to the nearest cent', () => {
    // 3333 * 3% = 99.99 → 100
    expect(calculatePlatformFeeCents(3333, rates(3))).toBe(100);
    // 3316 * 3% = 99.48 → 99
    expect(calculatePlatformFeeCents(3316, rates(3))).toBe(99);
  });

  it('returns 0 for zero or negative subtotals', () => {
    expect(calculatePlatformFeeCents(0, rates(3))).toBe(0);
    expect(calculatePlatformFeeCents(-100, rates(3))).toBe(0);
  });

  it('returns 0 when the fee percent is zero or negative', () => {
    expect(calculatePlatformFeeCents(10000, rates(0))).toBe(0);
    expect(calculatePlatformFeeCents(10000, rates(-3))).toBe(0);
  });

  it('adds the flat component ONCE, whatever the subtotal', () => {
    expect(calculatePlatformFeeCents(2500, rates(7, 30))).toBe(175 + 30);
    expect(calculatePlatformFeeCents(22500, rates(7, 30))).toBe(1575 + 30);
    // Percent off, flat on: the two components are independent knobs.
    expect(calculatePlatformFeeCents(2500, rates(0, 30))).toBe(30);
  });

  it('applies the floor to the WHOLE fee, not to the percentage alone', () => {
    expect(calculatePlatformFeeCents(1000, rates(7, 0, 100))).toBe(100);
    // 70 + 30 = 100, exactly the floor — the floor does not stack on top.
    expect(calculatePlatformFeeCents(1000, rates(7, 30, 100))).toBe(100);
    expect(calculatePlatformFeeCents(1000, rates(7, 40, 100))).toBe(110);
  });

  it('never charges a floor on a non-positive subtotal', () => {
    // Nothing was sold, so there is nothing to take a minimum on. A fully
    // make-whole-refunded payment-link order snapshots as 0/0 through here.
    expect(calculatePlatformFeeCents(0, rates(7, 30, 500))).toBe(0);
    expect(calculatePlatformFeeCents(-1, rates(7, 30, 500))).toBe(0);
    expect(calculatePlatformFeeCents(Number.NaN, rates(7, 30, 500))).toBe(0);
  });

  it('normalizes out-of-range rates rather than producing a nonsense charge', () => {
    // Both sides normalize identically, which is what keeps the cart preview
    // and the charge in agreement on a bad stored value.
    expect(calculatePlatformFeeCents(10000, rates(999, 9999, 99999))).toBe(
      calculatePlatformFeeCents(10000, rates(20, 500, 2000))
    );
    expect(calculatePlatformFeeCents(10000, rates(Number.NaN, Number.NaN, Number.NaN))).toBe(0);
  });
});

describe('normalizePlatformFeeRates', () => {
  it('clamps each component into its own range', () => {
    expect(normalizePlatformFeeRates(rates(50, 900, 5000))).toEqual(rates(20, 500, 2000));
    expect(normalizePlatformFeeRates(rates(-1, -1, -1))).toEqual(rates(0, 0, 0));
    expect(normalizePlatformFeeRates(rates(7, 30.6, 99.4))).toEqual(rates(7, 31, 99));
  });
});

describe('resolvePlatformFeePercent', () => {
  it('parses a valid percent from the env value', () => {
    expect(resolvePlatformFeePercent('5')).toBe(5);
    expect(resolvePlatformFeePercent('2.5')).toBe(2.5);
  });

  it('allows an explicit zero (fee disabled on purpose)', () => {
    expect(resolvePlatformFeePercent('0')).toBe(0);
  });

  it('falls back to 7 when unset', () => {
    expect(resolvePlatformFeePercent(undefined)).toBe(7);
  });

  it('falls back to 7 for empty or whitespace values (a blank secret must not silently disable the fee)', () => {
    expect(resolvePlatformFeePercent('')).toBe(7);
    expect(resolvePlatformFeePercent('   ')).toBe(7);
  });

  it('falls back to 7 for garbage or out-of-range values', () => {
    expect(resolvePlatformFeePercent('abc')).toBe(7);
    expect(resolvePlatformFeePercent('-1')).toBe(7);
    expect(resolvePlatformFeePercent('21')).toBe(7);
    expect(resolvePlatformFeePercent('Infinity')).toBe(7);
  });
});

describe('resolvePlatformFeeFlatCents / resolvePlatformFeeMinCents', () => {
  it('parses a stored or env value', () => {
    expect(resolvePlatformFeeFlatCents(30)).toBe(30);
    expect(resolvePlatformFeeFlatCents('30')).toBe(30);
    expect(resolvePlatformFeeMinCents('100')).toBe(100);
  });

  it('resolves absent, blank and malformed values to 0, NOT to a non-zero default', () => {
    // Unlike the percent, 0 IS the intended default here, so "unset" and "off"
    // are the same answer and a typo can never silently start charging money.
    for (const raw of [undefined, null, '', '   ', 'abc', '-1', 'Infinity']) {
      expect(resolvePlatformFeeFlatCents(raw)).toBe(0);
      expect(resolvePlatformFeeMinCents(raw)).toBe(0);
    }
  });

  it('resolves an out-of-range value to 0 rather than clamping it into a charge', () => {
    expect(resolvePlatformFeeFlatCents(501)).toBe(0);
    expect(resolvePlatformFeeFlatCents(500)).toBe(500);
    expect(resolvePlatformFeeMinCents(2001)).toBe(0);
    expect(resolvePlatformFeeMinCents(2000)).toBe(2000);
  });
});

describe('makeWholeRefundCents', () => {
  it('refunds the invalid lines plus ONLY the fee those lines caused', () => {
    // 2 × $25 at 7%, one invalid. The percentage share of the invalid line is
    // 175¢, so 2500 + 175 = 2675 — and NOT a proportional slice of the total.
    expect(
      makeWholeRefundCents({
        fullSubtotalCents: 5000,
        acceptedSubtotalCents: 2500,
        amountTotalCents: 5350,
        rates: rates(7),
      })
    ).toBe(2675);
  });

  it('leaves the whole flat component with the accepted side', () => {
    // Same charge with a 30¢ flat: the amount is 5380, but the refund is
    // unchanged at 2675. The flat was earned once, by the CHECKOUT, and the
    // invalid line did not cause any of it. A proportional split returned 2690
    // here and handed back 15¢ of the platform's own fee (MYK9-197 B1).
    expect(
      makeWholeRefundCents({
        fullSubtotalCents: 5000,
        acceptedSubtotalCents: 2500,
        amountTotalCents: 5380,
        rates: rates(7, 30),
      })
    ).toBe(2675);
    expect(Math.round((5380 * 2500) / 5000)).toBe(2690); // the old, wrong number
  });

  it('leaves a binding floor with the accepted side too', () => {
    // Two $1 entries under a $20 floor: fee(full) === fee(accepted) === 2000, so
    // the invalid line caused no fee at all and only its own $1 comes back.
    // The proportional split refunded 1100 — $10 of pure fee income.
    expect(
      makeWholeRefundCents({
        fullSubtotalCents: 200,
        acceptedSubtotalCents: 100,
        amountTotalCents: 2200,
        rates: rates(7, 0, 2000),
      })
    ).toBe(100);
    expect(Math.round((2200 * 100) / 200)).toBe(1100); // the old, wrong number
  });

  it('scales down when Stripe collected less than the lines are worth', () => {
    // A coupon or a stale price. The platform cannot return more than it took.
    expect(
      makeWholeRefundCents({
        fullSubtotalCents: 11_000,
        acceptedSubtotalCents: 5_000,
        amountTotalCents: 10_000, // expected 11_770
        rates: rates(7),
      })
    ).toBe(5_455);
  });

  it('does not scale UP when Stripe collected more than expected', () => {
    // An over-collection is drift; refunding more because of it would turn a
    // pricing anomaly into a payout. The tie-out is what should notice it.
    expect(
      makeWholeRefundCents({
        fullSubtotalCents: 5000,
        acceptedSubtotalCents: 2500,
        amountTotalCents: 9999,
        rates: rates(7),
      })
    ).toBe(2675);
  });

  it('is monotonic, which is what keeps the negative-refund clamp unreachable', () => {
    // The clamp in makeWholeRefundCents is dead code TODAY only because the fee
    // never decreases as the subtotal grows. Assert the property rather than
    // trusting it: a future rate shape that broke it would otherwise reach
    // Stripe with a negative refund amount.
    for (const percent of [0, 3, 7, 14.5, 20]) {
      for (const flatCents of [0, 30, 500]) {
        for (const minCents of [0, 100, 2000]) {
          const r = rates(percent, flatCents, minCents);
          let previous = calculatePlatformFeeCents(0, r);
          for (let subtotal = 1; subtotal <= 3000; subtotal += 7) {
            const current = calculatePlatformFeeCents(subtotal, r);
            expect(current).toBeGreaterThanOrEqual(previous);
            previous = current;
          }
        }
      }
    }
  });

  it('never returns a negative amount', () => {
    // Defensive: an accepted subtotal larger than the full subtotal is a caller
    // bug, and it must not become a negative Stripe refund.
    expect(
      makeWholeRefundCents({
        fullSubtotalCents: 1000,
        acceptedSubtotalCents: 5000,
        amountTotalCents: 1070,
        rates: rates(7),
      })
    ).toBe(0);
  });
});
