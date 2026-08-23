/**
 * Cart Store Helpers
 *
 * Constants and utility functions for cart calculations, extracted from cartStore.ts.
 */

import type { CartItemWithDetails } from './cartStore.types';

// ── PLATFORM FEE: THE CLIENT HALF OF A DUPLICATED EXPRESSION ──────────────
// This is the SECOND implementation of the fee math. The authoritative one is
// `supabase/functions/_shared/platformFee.ts`, which prices the actual charge.
// The two must produce the same integer cent result for every input.
//
// What a divergence costs (corrected by the MYK9-197 adversarial review, S3):
// NOT a checkout loop. stripe-checkout's drift healer only compares per-item
// entry fees against authoritative pricing, and the server overwrites the
// cart's `platform_fee_cents` / `total_cents` outright rather than reading the
// client's value back. A 1¢ divergence is therefore a silent mismatch between
// the total shown in the cart and the total on the Stripe page — nothing in the
// system notices, which is its own kind of bad.
//
// Two rules that keep them in agreement:
//   * Integer percent, NOT a float rate. The often-repeated `350¢ at 7%` example
//     was wrong (both forms give 25¢), but the hazard is real: at 14.5% a 100¢
//     subtotal is 15¢ integer and 14¢ via a `0.145` float rate. Of the 41
//     percents on the enforced 0.5 grid, 14.5 and 17.5 are the only two that
//     diverge — both are in the agreement test's matrix. That count depends on
//     the grid: the column is numeric(5,2), and at 0.01 steps 432 of 2001
//     percents diverge, so the step check in PayoutLedgerPage /
//     useUpdatePlatformFee is load-bearing for this claim.
//   * Normalize before the arithmetic, so an out-of-range stored value lands on
//     the same clamped number on both sides instead of diverging.
//
// The fee is `max(round(subtotal × percent / 100) + flatCents, minCents)`
// (MYK9-197). `flatCents` recovers Stripe's per-transaction 30¢ so the take
// rate stops depending on cart size; `minCents` is a floor for cheap entries.
// Both default to 0, i.e. the percentage-only behaviour that shipped before.

/** Percent fallback for the preview before `platform_settings` resolves. */
export const PLATFORM_FEE_PERCENT = 7;

const MAX_FEE_PERCENT = 20;
const MAX_FEE_FLAT_CENTS = 500;
const MAX_FEE_MIN_CENTS = 2000;

/** Mirrors `PlatformFeeRates` in supabase/functions/_shared/platformFee.ts. */
export interface PlatformFeeRates {
  /** Percentage of the subtotal (0–20). */
  percent: number;
  /** Flat component charged once per checkout, in cents (0–500). */
  flatCents: number;
  /** Floor on the whole fee when the subtotal is positive, in cents (0–2000). */
  minCents: number;
}

/**
 * FALLBACK rates for the client preview. The live values are the
 * `platform_settings` row, read by stripe-checkout (authoritative for the
 * charge) and by the preview via `usePlatformFeeRates`. These are only what the
 * preview shows before that row resolves / if it is absent — keep in sync with
 * `DEFAULT_PLATFORM_FEE_RATES` in supabase/functions/_shared/platformFee.ts.
 * Percent raised 3% → 7% on 2026-06-10 (3% didn't cover Stripe's ~2.9% + 30¢).
 */
export const DEFAULT_PLATFORM_FEE_RATES: PlatformFeeRates = {
  percent: PLATFORM_FEE_PERCENT,
  flatCents: 0,
  minCents: 0,
};

function clampCents(value: unknown, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n), max);
}

function clampPercent(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_FEE_PERCENT);
}

/** Mirrors `normalizePlatformFeeRates` on the server. */
export function normalizePlatformFeeRates(rates: PlatformFeeRates): PlatformFeeRates {
  return {
    percent: clampPercent(rates.percent),
    flatCents: clampCents(rates.flatCents, MAX_FEE_FLAT_CENTS),
    minCents: clampCents(rates.minCents, MAX_FEE_MIN_CENTS),
  };
}

/** Mirrors `calculatePlatformFeeCents` on the server — see the note above. */
export function calculatePlatformFeeCents(
  subtotalCents: number,
  rates: PlatformFeeRates
): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
  const { percent, flatCents, minCents } = normalizePlatformFeeRates(rates);
  const percentCents = percent > 0 ? Math.round((subtotalCents * percent) / 100) : 0;
  return Math.max(percentCents + flatCents, minCents);
}

/** `$1.00`-style label for a cent amount used inside fee copy. */
function formatFeeCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Display label for the fee configuration, so UI copy can't drift from the
 * rates actually charged. "7%" stopped being an accurate description the moment
 * a flat component existed, so the label names every component that is on:
 *
 *   7% / 0¢ / 0¢    → "7%"
 *   7% / 30¢ / 0¢   → "7% + $0.30"
 *   7% / 0¢ / 100¢  → "7%, $1.00 minimum"
 *   7% / 30¢ / 100¢ → "7% + $0.30, $1.00 minimum"
 *   0% / 30¢ / 0¢   → "$0.30"
 */
export function formatPlatformFeeLabel(rates: PlatformFeeRates): string {
  const { percent, flatCents, minCents } = normalizePlatformFeeRates(rates);
  const parts: string[] = [];
  if (percent > 0) parts.push(`${percent}%`);
  if (flatCents > 0) parts.push(formatFeeCents(flatCents));
  const base = parts.length > 0 ? parts.join(' + ') : '0%';
  return minCents > 0 ? `${base}, ${formatFeeCents(minCents)} minimum` : base;
}

/** Default-rate label. Prefer formatPlatformFeeLabel(rates) with the live rates. */
export const PLATFORM_FEE_LABEL = formatPlatformFeeLabel(DEFAULT_PLATFORM_FEE_RATES);

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
  // Store-baked preview uses the fallback defaults; the live rates are applied
  // for display by the cart components (usePlatformFeeRates +
  // calculatePlatformFeeCents).
  const platformFee = calculatePlatformFeeCents(subtotal, DEFAULT_PLATFORM_FEE_RATES);
  const total = subtotal + platformFee;
  return { subtotal, platformFee, total };
}

/**
 * Format cart money for display. Lived twice, verbatim, in CartItemCard and
 * CartSummary - and money formatting is exactly the thing that should have one
 * home, next to the fee math it has to agree with.
 */
export function formatCartCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
