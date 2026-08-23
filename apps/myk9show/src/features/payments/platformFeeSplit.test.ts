/**
 * MYK9-229 — the fee split must be a VIEW of the charged fee, never a second
 * fee expression. Everything here is written so that hardcoding a rate, or
 * restating the fee formula, fails.
 */

import { describe, expect, it } from 'vitest';
import {
  calculatePlatformFeeCents,
  type PlatformFeeRates,
} from '@/store/cartStore.helpers';
import {
  CARD_PROCESSING_COVERS_FEE_FOOTNOTE,
  CARD_PROCESSING_COVERS_FEE_NOTE,
  estimateCardProcessingCents,
  formatCardRateLabel,
  splitPlatformFee,
  STRIPE_CARD_RATE,
} from './platformFeeSplit';

const LIVE: PlatformFeeRates = { percent: 7, flatCents: 0, minCents: 0 };
const WITH_FLAT: PlatformFeeRates = { percent: 7, flatCents: 30, minCents: 0 };
const WITH_FLOOR: PlatformFeeRates = { percent: 7, flatCents: 0, minCents: 200 };
const WITH_BOTH: PlatformFeeRates = { percent: 4.5, flatCents: 45, minCents: 150 };

const RATE_CASES: Array<[string, PlatformFeeRates]> = [
  ['0¢ flat / 0¢ floor (live today)', LIVE],
  ['30¢ flat', WITH_FLAT],
  ['$2.00 floor', WITH_FLOOR],
  ['flat and floor together, off-integer percent', WITH_BOTH],
];

const SUBTOTALS = [100, 500, 770, 1000, 2500, 5000, 10000, 20000, 50000, 123456];

describe('splitPlatformFee — the parts always reconstruct the charged fee', () => {
  RATE_CASES.forEach(([label, rates]) => {
    it(`sums to calculatePlatformFeeCents at ${label}`, () => {
      SUBTOTALS.forEach(subtotalCents => {
        const split = splitPlatformFee(subtotalCents, rates);
        const charged = calculatePlatformFeeCents(subtotalCents, rates);
        // The fee shown is the fee charged...
        expect(split.feeCents).toBe(charged);
        // ...and the disclosure can never add up to a different number.
        expect(split.cardProcessingCents + split.platformShareCents).toBe(charged);
      });
    });
  });

  it('tracks a rate change rather than a compiled-in percentage', () => {
    // A hardcoded 7% would keep returning 175 here.
    const doubled = splitPlatformFee(2500, { percent: 14, flatCents: 0, minCents: 0 });
    expect(doubled.feeCents).toBe(calculatePlatformFeeCents(2500, { percent: 14, flatCents: 0, minCents: 0 }));
    expect(doubled.feeCents).toBe(350);
    expect(splitPlatformFee(2500, LIVE).feeCents).toBe(175);
  });

  it('charges no fee, and so splits nothing, on an empty order', () => {
    expect(splitPlatformFee(0, LIVE)).toEqual({
      feeCents: 0,
      cardProcessingCents: 0,
      platformShareCents: 0,
      cardProcessingCoversWholeFee: false,
    });
  });
});

describe('splitPlatformFee — card processing is not a constant share', () => {
  it('takes a bigger share of a small order than a large one', () => {
    const small = splitPlatformFee(2500, LIVE);
    const large = splitPlatformFee(50000, LIVE);
    const smallShare = small.cardProcessingCents / small.feeCents;
    const largeShare = large.cardProcessingCents / large.feeCents;
    // This is the whole reason the split is computed per order instead of
    // being stated as one ratio.
    expect(smallShare).toBeGreaterThan(largeShare);
    expect(smallShare).toBeGreaterThan(0.55);
    expect(largeShare).toBeLessThan(0.5);
  });

  it('matches the modelled numbers at $25 and $500 of entries', () => {
    // 2.9% of (2500 + 175) + 30¢ = 108¢, leaving 67¢.
    expect(splitPlatformFee(2500, LIVE)).toMatchObject({
      feeCents: 175,
      cardProcessingCents: 108,
      platformShareCents: 67,
      cardProcessingCoversWholeFee: false,
    });
    // 2.9% of (50000 + 3500) + 30¢ = 1582¢, leaving 1918¢.
    expect(splitPlatformFee(50000, LIVE)).toMatchObject({
      feeCents: 3500,
      cardProcessingCents: 1582,
      platformShareCents: 1918,
    });
  });

  it('moves with the flat component and the floor, not just the percent', () => {
    const flat = splitPlatformFee(2500, WITH_FLAT);
    expect(flat.feeCents).toBe(205); // 175 + 30¢ once per checkout
    expect(flat.cardProcessingCents).toBe(estimateCardProcessingCents(2500 + 205));
    expect(flat.platformShareCents).toBe(205 - flat.cardProcessingCents);

    const floored = splitPlatformFee(1000, WITH_FLOOR);
    expect(floored.feeCents).toBe(200); // 70¢ percentage lifted to the $2.00 floor
    expect(floored.cardProcessingCents).toBe(estimateCardProcessingCents(1200));
    expect(floored.platformShareCents).toBe(200 - floored.cardProcessingCents);
  });
});

describe('splitPlatformFee — the clamp reports itself', () => {
  // The clamp is about ARITHMETIC, not order size. The estimate is ~2.9% of the
  // cart while the fee is `percent`% of it, so below ~3% it binds at EVERY
  // size — the case a $1.00-cart-at-7% test can never reach, and the reason the
  // cart copy must not say "on an order this small".
  it('binds at EVERY order size once the percent drops below the card rate', () => {
    const cheapRates: PlatformFeeRates = { percent: 2, flatCents: 0, minCents: 0 };
    [2500, 50000, 200000].forEach(subtotalCents => {
      const split = splitPlatformFee(subtotalCents, cheapRates);
      expect(split.feeCents).toBe(calculatePlatformFeeCents(subtotalCents, cheapRates));
      expect(split.cardProcessingCoversWholeFee).toBe(true);
      expect(split.platformShareCents).toBe(0);
      expect(split.cardProcessingCents).toBe(split.feeCents);
    });
    // A $500 cart is not "small" by any reading — the flag is not a size claim.
    expect(splitPlatformFee(50000, cheapRates).feeCents).toBe(1000);
  });

  it('binds at every size on a flat-only fee too', () => {
    const flatOnly: PlatformFeeRates = { percent: 0, flatCents: 30, minCents: 0 };
    [2500, 50000].forEach(subtotalCents => {
      expect(splitPlatformFee(subtotalCents, flatOnly).cardProcessingCoversWholeFee).toBe(true);
    });
  });

  it('fires on EQUALITY, which is why the copy says "at least", not "more than"', () => {
    // At 7/0/0 a $7.50 subtotal gives a 53¢ fee against a 53¢ estimate.
    const split = splitPlatformFee(750, LIVE);
    expect(split.feeCents).toBe(53);
    expect(estimateCardProcessingCents(750 + 53)).toBe(53);
    expect(split.cardProcessingCoversWholeFee).toBe(true);
    expect(split.platformShareCents).toBe(0);
  });

  it('states the arithmetic and never the order size', () => {
    // A size claim would be false at 2% on a $500 cart, which is the same
    // string. Pin the wording, since three surfaces render it.
    expect(CARD_PROCESSING_COVERS_FEE_NOTE).not.toMatch(/small/i);
    expect(CARD_PROCESSING_COVERS_FEE_NOTE).not.toMatch(/more than/i);
    expect(CARD_PROCESSING_COVERS_FEE_NOTE).toMatch(/entire service fee/i);
    expect(CARD_PROCESSING_COVERS_FEE_FOOTNOTE).not.toMatch(/small/i);
  });

  it('flags an order where processing costs at least the whole fee', () => {
    // $1.00 of entries at 7%: a 7¢ fee against ~33¢ of card processing.
    const split = splitPlatformFee(100, LIVE);
    expect(split.feeCents).toBe(7);
    expect(estimateCardProcessingCents(107)).toBeGreaterThan(7);
    expect(split.cardProcessingCents).toBe(7);
    expect(split.platformShareCents).toBe(0);
    expect(split.cardProcessingCoversWholeFee).toBe(true);
  });

  it('does not flag an ordinary order', () => {
    expect(splitPlatformFee(2500, LIVE).cardProcessingCoversWholeFee).toBe(false);
  });

  it('never reports a negative share', () => {
    SUBTOTALS.forEach(subtotalCents => {
      RATE_CASES.forEach(([, rates]) => {
        const split = splitPlatformFee(subtotalCents, rates);
        expect(split.platformShareCents).toBeGreaterThanOrEqual(0);
        expect(split.cardProcessingCents).toBeGreaterThanOrEqual(0);
      });
    });
  });
});

describe('estimateCardProcessingCents', () => {
  it('charges the percentage on the WHOLE amount the customer pays', () => {
    // Stripe's cut is taken on entry fees plus the service fee, because the
    // platform is merchant of record on the full charge.
    expect(estimateCardProcessingCents(2675)).toBe(
      Math.round((2675 * STRIPE_CARD_RATE.percent) / 100) + STRIPE_CARD_RATE.flatCents
    );
  });

  it('is zero on a non-positive amount', () => {
    expect(estimateCardProcessingCents(0)).toBe(0);
    expect(estimateCardProcessingCents(-100)).toBe(0);
    expect(estimateCardProcessingCents(Number.NaN)).toBe(0);
  });

  it('names the third-party rate the estimate is built from', () => {
    expect(formatCardRateLabel()).toBe('2.9% + $0.30');
  });
});
