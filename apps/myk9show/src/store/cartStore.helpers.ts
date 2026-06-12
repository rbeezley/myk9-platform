/**
 * Cart Store Helpers
 *
 * Constants and utility functions for cart calculations, extracted from cartStore.ts.
 */

import type { CartItemWithDetails } from './cartStore.types';

// Platform fee percent — client-side PREVIEW only; the authoritative rate is
// the PLATFORM_FEE_PERCENT Supabase secret read by stripe-checkout (which also
// has a matching fallback in supabase/functions/_shared/platformFee.ts). All
// three must move together or the cart shows one total and Stripe charges
// another. Raised 3% → 7% on 2026-06-10 (3% didn't cover Stripe's ~2.9% + 30¢).
// Integer percent, NOT a 0.07 float: the fee math must be the server's exact
// integer expression or the preview disagrees by 1¢ at half-cent boundaries
// (350¢ → 25¢ server vs 24¢ float; round-13 review).
export const PLATFORM_FEE_PERCENT = 7;

/** Display label percent, derived so UI copy can't drift from the rate. */
export const PLATFORM_FEE_PERCENT_LABEL = `${PLATFORM_FEE_PERCENT}%`;

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
  // Same expression as _shared/platformFee.ts — keep them identical.
  const platformFee = Math.round((subtotal * PLATFORM_FEE_PERCENT) / 100);
  const total = subtotal + platformFee;
  return { subtotal, platformFee, total };
}
