/**
 * Cart Store Helpers
 *
 * Constants and utility functions for cart calculations, extracted from cartStore.ts.
 */

import type { CartItemWithDetails } from './cartStore.types';

// Platform fee percent — FALLBACK default for the client preview. The live rate
// is the `platform_settings.platform_fee_percent` row, read by stripe-checkout
// (authoritative for the charge) and the cart preview (via usePlatformFeePercent).
// This constant is only the value used before that row resolves / if it's absent;
// keep it in sync with supabase/functions/_shared/platformFee.ts DEFAULT_FEE_PERCENT.
// Raised 3% → 7% on 2026-06-10 (3% didn't cover Stripe's ~2.9% + 30¢).
// Integer percent, NOT a 0.07 float: the fee math must be the server's exact
// integer expression or the preview disagrees by 1¢ at half-cent boundaries
// (350¢ → 25¢ server vs 24¢ float; round-13 review).
export const PLATFORM_FEE_PERCENT = 7;

/** Display label for a fee percent, so UI copy can't drift from the rate. */
export function formatPlatformFeeLabel(percent: number): string {
  return `${percent}%`;
}

/** Default-rate label. Prefer formatPlatformFeeLabel(rate) with the live rate. */
export const PLATFORM_FEE_PERCENT_LABEL = formatPlatformFeeLabel(PLATFORM_FEE_PERCENT);

// The exact integer fee expression, shared with _shared/platformFee.ts. Callers
// that have a live rate (cart preview) use this directly against the subtotal.
export function calculatePlatformFeeCents(subtotalCents: number, percent: number): number {
  if (subtotalCents <= 0 || percent <= 0) return 0;
  return Math.round((subtotalCents * percent) / 100);
}

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
  // Store-baked preview uses the fallback default; the live rate is applied for
  // display by the cart components (usePlatformFeePercent + calculatePlatformFeeCents).
  const platformFee = calculatePlatformFeeCents(subtotal, PLATFORM_FEE_PERCENT);
  const total = subtotal + platformFee;
  return { subtotal, platformFee, total };
}
