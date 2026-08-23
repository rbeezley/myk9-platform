import { describe, expect, it } from 'vitest';

import {
  calculateCartTotals,
  calculatePlatformFeeCents,
  formatPlatformFeeLabel,
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
