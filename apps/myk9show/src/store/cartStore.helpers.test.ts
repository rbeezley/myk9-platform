import { describe, expect, it } from 'vitest';

import {
  calculateCartTotals,
  calculatePlatformFeeCents,
  formatPlatformFeeLabel,
  formatCartCurrency,
  normalizePlatformFeeRates,
  CART_EXPIRATION_MINUTES,
  EXPIRATION_WARNING_MINUTES,
  DEFAULT_PLATFORM_FEE_RATES,
  PLATFORM_FEE_PERCENT,
  PLATFORM_FEE_LABEL,
  type PlatformFeeRates,
} from './cartStore.helpers';
import type { CartItemWithDetails } from './cartStore.types';

function cartItem(entryFeeCents: number): CartItemWithDetails {
  return { entry_fee_cents: entryFeeCents } as CartItemWithDetails;
}

const rates = (percent: number, flatCents = 0, minCents = 0): PlatformFeeRates => ({
  percent,
  flatCents,
  minCents,
});

describe('calculateCartTotals', () => {
  it('returns zero totals for an empty cart', () => {
    expect(calculateCartTotals([])).toEqual({
      subtotal: 0,
      platformFee: 0,
      total: 0,
    });
  });

  it('sums item fees and adds the platform fee', () => {
    expect(calculateCartTotals([cartItem(2500), cartItem(1750), cartItem(500)])).toEqual({
      subtotal: 4750,
      platformFee: 333,
      total: 5083,
    });
  });

  it('matches the server integer expression at the half-cent boundary', () => {
    expect(calculateCartTotals([cartItem(350)])).toEqual({
      subtotal: 350,
      platformFee: 25,
      total: 375,
    });
  });
});

describe('calculatePlatformFeeCents', () => {
  it('applies an arbitrary live rate to the subtotal', () => {
    // 4750 * 10% = 475 (the dynamic rate the cart preview reads from settings).
    expect(calculatePlatformFeeCents(4750, rates(10))).toBe(475);
  });

  it('rounds with the server integer expression at the half-cent boundary', () => {
    // 350 * 7% = 24.5 → 25 (Math.round), matching _shared/platformFee.ts.
    expect(calculatePlatformFeeCents(350, rates(7))).toBe(25);
  });

  it('returns 0 for a zero/negative subtotal or a zero rate', () => {
    expect(calculatePlatformFeeCents(0, rates(7))).toBe(0);
    expect(calculatePlatformFeeCents(-100, rates(7))).toBe(0);
    expect(calculatePlatformFeeCents(4750, rates(0))).toBe(0);
  });

  it('adds the flat component once and applies the floor to the whole fee', () => {
    expect(calculatePlatformFeeCents(2500, rates(7, 30))).toBe(205);
    expect(calculatePlatformFeeCents(1000, rates(7, 0, 100))).toBe(100);
    expect(calculatePlatformFeeCents(0, rates(7, 30, 100))).toBe(0);
  });
});

describe('platform fee display', () => {
  it('formats a fee label from any percent', () => {
    expect(formatPlatformFeeLabel(rates(7))).toBe('7%');
    expect(formatPlatformFeeLabel(rates(10.5))).toBe('10.5%');
  });

  it('names the flat component and the floor, so "7%" cannot become a false description', () => {
    expect(formatPlatformFeeLabel(rates(7, 30))).toBe('7% + $0.30');
    expect(formatPlatformFeeLabel(rates(7, 0, 100))).toBe('7%, $1.00 minimum');
    expect(formatPlatformFeeLabel(rates(7, 30, 100))).toBe('7% + $0.30, $1.00 minimum');
    expect(formatPlatformFeeLabel(rates(0, 30))).toBe('$0.30');
    expect(formatPlatformFeeLabel(rates(0))).toBe('0%');
  });

  it('keeps the default rates + label in sync, with flat and floor OFF', () => {
    expect(PLATFORM_FEE_PERCENT).toBe(7);
    expect(DEFAULT_PLATFORM_FEE_RATES).toEqual({ percent: 7, flatCents: 0, minCents: 0 });
    expect(PLATFORM_FEE_LABEL).toBe('7%');
  });
});

describe('normalizePlatformFeeRates', () => {
  const norm = (percent: unknown, flatCents: unknown = 0, minCents: unknown = 0) =>
    normalizePlatformFeeRates({ percent, flatCents, minCents } as PlatformFeeRates);

  it.each([0, -1, -0.5, NaN, Infinity, -Infinity, 'abc', undefined])(
    'collapses an unusable percent (%s) to 0',
    bad => {
      expect(norm(bad).percent).toBe(0);
    }
  );

  it('keeps in-range percents untouched and caps at 20', () => {
    expect(norm(0.5).percent).toBe(0.5);
    expect(norm(14.5).percent).toBe(14.5);
    expect(norm(20).percent).toBe(20);
    expect(norm(20.5).percent).toBe(20);
    expect(norm(25).percent).toBe(20);
  });

  it('coerces numeric strings and null', () => {
    expect(norm('7').percent).toBe(7);
    expect(norm(null).percent).toBe(0);
    expect(norm(7, '30', '100')).toEqual({ percent: 7, flatCents: 30, minCents: 100 });
  });

  it.each([0, -1, NaN, Infinity, -Infinity, 'abc', undefined])(
    'collapses an unusable flat/min cent value (%s) to 0',
    bad => {
      expect(norm(7, bad, bad)).toEqual({ percent: 7, flatCents: 0, minCents: 0 });
    }
  );

  it('rounds cents to integers', () => {
    expect(norm(7, 29.5, 99.5)).toEqual({ percent: 7, flatCents: 30, minCents: 100 });
    expect(norm(7, 0.4, 0.4)).toEqual({ percent: 7, flatCents: 0, minCents: 0 });
    expect(norm(7, 0.5, 0.5)).toEqual({ percent: 7, flatCents: 1, minCents: 1 });
    expect(norm(7, 1, 1)).toEqual({ percent: 7, flatCents: 1, minCents: 1 });
  });

  it('caps flat at 500 and min at 2000, each with its own cap', () => {
    expect(norm(7, 500, 2000)).toEqual({ percent: 7, flatCents: 500, minCents: 2000 });
    expect(norm(7, 500.4, 2000.4)).toEqual({ percent: 7, flatCents: 500, minCents: 2000 });
    expect(norm(7, 501, 2001)).toEqual({ percent: 7, flatCents: 500, minCents: 2000 });
    expect(norm(7, 600, 600)).toEqual({ percent: 7, flatCents: 500, minCents: 600 });
    expect(norm(7, 3000, 3000)).toEqual({ percent: 7, flatCents: 500, minCents: 2000 });
  });
});

describe('calculatePlatformFeeCents edges', () => {
  it.each([NaN, Infinity, -Infinity, -1, 0])(
    'returns 0 for subtotal %s even with flat and floor',
    s => {
      expect(calculatePlatformFeeCents(s, rates(7, 30, 100))).toBe(0);
    }
  );

  it('charges the flat and the floor on the smallest positive whole subtotal', () => {
    expect(calculatePlatformFeeCents(1, rates(7))).toBe(0);
    expect(calculatePlatformFeeCents(1, rates(7, 30))).toBe(30);
    expect(calculatePlatformFeeCents(1, rates(7, 0, 100))).toBe(100);
    expect(calculatePlatformFeeCents(Number.MIN_VALUE, rates(7, 30))).toBe(30);
  });

  it('percent-only, flat-only and zero-percent paths', () => {
    expect(calculatePlatformFeeCents(10, rates(7))).toBe(1);
    expect(calculatePlatformFeeCents(1000, rates(0, 30))).toBe(30);
    expect(calculatePlatformFeeCents(1000, rates(-5, 30))).toBe(30);
    expect(calculatePlatformFeeCents(1000, rates(0))).toBe(0);
  });

  it('takes the larger of percent+flat and the floor, equal at the boundary', () => {
    // 1000 * 7% = 70, + 30 = 100
    expect(calculatePlatformFeeCents(1000, rates(7, 30, 99))).toBe(100);
    expect(calculatePlatformFeeCents(1000, rates(7, 30, 100))).toBe(100);
    expect(calculatePlatformFeeCents(1000, rates(7, 30, 101))).toBe(101);
  });

  it('uses the integer percent, so 14.5% of 100c is 15c', () => {
    expect(calculatePlatformFeeCents(100, rates(14.5))).toBe(15);
    expect(calculatePlatformFeeCents(100, rates(17.5))).toBe(18);
  });

  it('normalizes out-of-range rates before the arithmetic', () => {
    expect(calculatePlatformFeeCents(1000, rates(25))).toBe(200);
    expect(calculatePlatformFeeCents(1000, rates(0, 600))).toBe(500);
    expect(calculatePlatformFeeCents(1000, rates(0, 0, 3000))).toBe(2000);
    expect(calculatePlatformFeeCents(1000, rates(Infinity, 0, 0))).toBe(0);
  });
});

describe('formatPlatformFeeLabel edges', () => {
  it('shows a floor alone against a zero percent and flat', () => {
    expect(formatPlatformFeeLabel(rates(0, 0, 100))).toBe('0%, $1.00 minimum');
    expect(formatPlatformFeeLabel(rates(0, 30, 100))).toBe('$0.30, $1.00 minimum');
  });

  it('labels the normalized rates, not the raw ones', () => {
    expect(formatPlatformFeeLabel(rates(25, 600, 3000))).toBe('20% + $5.00, $20.00 minimum');
    expect(formatPlatformFeeLabel(rates(-1, -1, -1))).toBe('0%');
    expect(formatPlatformFeeLabel(rates(7, 0.4, 0.4))).toBe('7%');
    expect(formatPlatformFeeLabel(rates(7, 1, 1))).toBe('7% + $0.01, $0.01 minimum');
  });
});

describe('cart totals and currency', () => {
  it('totals a single item and a negative-free multi-item sum', () => {
    expect(calculateCartTotals([cartItem(1000)])).toEqual({
      subtotal: 1000,
      platformFee: 70,
      total: 1070,
    });
    expect(calculateCartTotals([cartItem(1), cartItem(2)])).toEqual({
      subtotal: 3,
      platformFee: 0,
      total: 3,
    });
  });

  it('formats cents as dollars with two decimals', () => {
    expect(formatCartCurrency(0)).toBe('$0.00');
    expect(formatCartCurrency(5)).toBe('$0.05');
    expect(formatCartCurrency(2500)).toBe('$25.00');
    expect(formatCartCurrency(12345)).toBe('$123.45');
  });

  it('pins the cart timer constants', () => {
    expect(CART_EXPIRATION_MINUTES).toBe(30);
    expect(EXPIRATION_WARNING_MINUTES).toBe(5);
  });
});
