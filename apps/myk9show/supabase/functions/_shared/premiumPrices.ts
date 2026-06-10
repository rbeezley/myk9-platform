// Pure helpers shared by stripe-webhook (Deno) and vitest. Keep this module
// free of Deno/npm imports so the colocated test runs under Node.

// PREMIUM_PRICE_IDS secret: comma-separated Stripe price ids that map to the
// premium tier (sandbox + live can coexist in the list). Blank/unset falls
// back to the hardcoded live ids so a missing secret never downgrades anyone.
export function parsePremiumPriceIds(envValue: string | undefined, fallback: string[]): string[] {
  const parsed = (envValue ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

export function priceIdToTier(
  priceId: string | null | undefined,
  premiumIds: string[]
): 'premium' | 'free' {
  return priceId && premiumIds.includes(priceId) ? 'premium' : 'free';
}
