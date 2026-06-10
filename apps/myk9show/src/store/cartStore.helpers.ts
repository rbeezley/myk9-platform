/**
 * Cart Store Helpers
 *
 * Constants and utility functions for cart calculations, extracted from cartStore.ts.
 */

import type { CartItemWithDetails } from './cartStore.types';

// Platform fee rate — client-side PREVIEW only; the authoritative rate is the
// PLATFORM_FEE_PERCENT Supabase secret read by stripe-checkout (which also has
// a matching fallback in supabase/functions/_shared/platformFee.ts). All three
// must move together or the cart shows one total and Stripe charges another.
// Raised 3% → 7% on 2026-06-10 (3% didn't cover Stripe's ~2.9% + 30¢).
export const PLATFORM_FEE_RATE = 0.07;

/** Display label percent, derived so UI copy can't drift from the rate. */
export const PLATFORM_FEE_PERCENT_LABEL = `${Math.round(PLATFORM_FEE_RATE * 100)}%`;

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
