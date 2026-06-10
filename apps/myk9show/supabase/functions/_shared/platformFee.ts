// Pure helpers shared by stripe-checkout (Deno) and vitest. Keep this module
// free of Deno/npm imports so the colocated test runs under Node.

// Keep in sync with the PLATFORM_FEE_PERCENT secret and the client preview
// (src/store/cartStore.helpers.ts PLATFORM_FEE_RATE) — raised 3→7 on
// 2026-06-10: 3% didn't cover Stripe's ~2.9% + 30¢ on typical entry carts.
const DEFAULT_FEE_PERCENT = 7;
const MAX_FEE_PERCENT = 20;

export function calculatePlatformFeeCents(subtotalCents: number, percent: number): number {
  if (subtotalCents <= 0 || percent <= 0) return 0;
  return Math.round((subtotalCents * percent) / 100);
}

// A blank or malformed PLATFORM_FEE_PERCENT secret must fall back to the
// default, never silently disable the fee; an explicit '0' disables it.
export function resolvePlatformFeePercent(envValue: string | undefined): number {
  if (envValue === undefined || envValue.trim() === '') return DEFAULT_FEE_PERCENT;
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_FEE_PERCENT) {
    return DEFAULT_FEE_PERCENT;
  }
  return parsed;
}
