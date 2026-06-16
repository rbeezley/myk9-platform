import { describe, expect, it } from 'vitest';

import {
  calculateCartTotals,
  calculatePlatformFeeCents,
  formatPlatformFeeLabel,
  PLATFORM_FEE_PERCENT,
  PLATFORM_FEE_PERCENT_LABEL,
} from './cartStore.helpers';
import type { CartItemWithDetails } from './cartStore.types';

function cartItem(entryFeeCents: number): CartItemWithDetails {
  return { entry_fee_cents: entryFeeCents } as CartItemWithDetails;
}

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
    expect(calculatePlatformFeeCents(4750, 10)).toBe(475);
  });

  it('rounds with the server integer expression at the half-cent boundary', () => {
    // 350 * 7% = 24.5 → 25 (Math.round), matching _shared/platformFee.ts.
    expect(calculatePlatformFeeCents(350, 7)).toBe(25);
  });

  it('returns 0 for a zero/negative subtotal or a zero rate', () => {
    expect(calculatePlatformFeeCents(0, 7)).toBe(0);
    expect(calculatePlatformFeeCents(-100, 7)).toBe(0);
    expect(calculatePlatformFeeCents(4750, 0)).toBe(0);
  });
});

describe('platform fee display', () => {
  it('formats a fee label from any percent', () => {
    expect(formatPlatformFeeLabel(7)).toBe('7%');
    expect(formatPlatformFeeLabel(10.5)).toBe('10.5%');
  });

  it('keeps the default-rate constant + label in sync', () => {
    expect(PLATFORM_FEE_PERCENT).toBe(7);
    expect(PLATFORM_FEE_PERCENT_LABEL).toBe('7%');
  });
});
