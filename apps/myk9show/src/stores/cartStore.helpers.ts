/**
 * Cart Store Helpers
 *
 * Constants and utility functions for cart calculations, extracted from cartStore.ts.
 */

import type { CartItemWithDetails } from './cartStore.types';

// Platform fee rate (3%)
export const PLATFORM_FEE_RATE = 0.03;

// Cart expiration time (30 minutes)
export const CART_EXPIRATION_MINUTES = 30;

// Warning threshold (5 minutes before expiration)
export const EXPIRATION_WARNING_MINUTES = 5;

/**
 * Calculate cart totals from a list of items.
 * Returns subtotal, platform fee, and total in cents.
 */
export function calculateCartTotals(items: CartItemWithDetails[]): {
  subtotal: number;
  platformFee: number;
  total: number;
} {
  const subtotal = items.reduce((sum, i) => sum + i.entry_fee_cents, 0);
  const platformFee = Math.round(subtotal * PLATFORM_FEE_RATE);
  const total = subtotal + platformFee;
  return { subtotal, platformFee, total };
}
