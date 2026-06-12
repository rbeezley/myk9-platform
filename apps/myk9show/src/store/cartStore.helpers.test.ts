import { describe, expect, it } from 'vitest';

import {
  calculateCartTotals,
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

describe('platform fee display constants', () => {
  it('derives the display label from the configured percent', () => {
    expect(PLATFORM_FEE_PERCENT).toBe(7);
    expect(PLATFORM_FEE_PERCENT_LABEL).toBe(`${PLATFORM_FEE_PERCENT}%`);
  });
});
