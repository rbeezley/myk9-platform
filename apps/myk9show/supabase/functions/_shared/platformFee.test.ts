// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  calculatePlatformFeeCents,
  entryFeeRefundCents,
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

describe('entryFeeRefundCents (MYK9-966: never the service fee)', () => {
  const refund = (
    unservedEntryFeeCents: number,
    fullSubtotalCents: number,
    amountTotalCents: number,
    r: PlatformFeeRates
  ) =>
    entryFeeRefundCents({ unservedEntryFeeCents, fullSubtotalCents, amountTotalCents, rates: r });

  it('refunds the unserved entry fees and NO share of the percentage fee', () => {
    // 2 × $25 at 7%, one unserved: $25.00 back, not the $26.75 MYK9-197 returned.
    expect(refund(2500, 5000, 5350, rates(7))).toBe(2500);
  });

  it('returns none of a flat component or a binding floor', () => {
    expect(refund(2500, 5000, 5380, rates(7, 30))).toBe(2500);
    expect(refund(100, 200, 2200, rates(7, 0, 2000))).toBe(100);
  });

  it('keeps the whole fee when NOTHING was served', () => {
    expect(refund(5000, 5000, 5350, rates(7))).toBe(5000);
    expect(refund(200, 200, 2200, rates(7, 0, 2000))).toBe(200);
  });

  it('caps at the amount paid minus the service fee on an under-collection', () => {
    // Expected 11_770; Stripe took 10_000. The fee (770) is kept first.
    expect(refund(11_000, 11_000, 10_000, rates(7))).toBe(9_230);
    // A partial refund below the cap is untouched.
    expect(refund(6_000, 11_000, 10_000, rates(7))).toBe(6_000);
  });

  it('does not scale UP when Stripe collected more than expected', () => {
    expect(refund(2500, 5000, 9999, rates(7))).toBe(2500);
  });

  it('never returns a negative amount', () => {
    expect(refund(1000, 1000, 50, rates(7))).toBe(0);
    expect(refund(-5, 1000, 1070, rates(7))).toBe(0);
  });

  it('holds the platform whole across the rate matrix: kept = fee charged', () => {
    for (const percent of [0, 3, 7, 14.5, 20]) {
      for (const flatCents of [0, 30, 500]) {
        for (const minCents of [0, 100, 2000]) {
          const r = rates(percent, flatCents, minCents);
          for (const [full, unserved] of [
            [9000, 3000],
            [9000, 9000],
            [137, 59],
          ]) {
            const fee = calculatePlatformFeeCents(full, r);
            const paid = full + fee;
            const back = refund(unserved, full, paid, r);
            expect(back).toBe(unserved);
            expect(paid - back - (full - unserved)).toBe(fee);
          }
        }
      }
    }
  });
});
