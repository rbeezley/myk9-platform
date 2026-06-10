// Pure helpers shared by stripe-webhook (Deno) and vitest. Keep this module
// free of Deno/npm imports so the colocated test runs under Node.

// PREMIUM_PRICE_IDS secret: comma-separated Stripe price ids that map to the
// premium tier. The secret EXTENDS the hardcoded live ids — it never replaces
// them: one deployed webhook serves live subscribers and sandbox testing at
// once, so a secret listing only sandbox ids must not be able to downgrade a
// paying live subscriber on their next subscription event (PR #625 review).
export function parsePremiumPriceIds(envValue: string | undefined, fallback: string[]): string[] {
  const parsed = (envValue ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return [...new Set([...fallback, ...parsed])];
}

export function priceIdToTier(
  priceId: string | null | undefined,
  premiumIds: string[]
): 'premium' | 'free' {
  return priceId && premiumIds.includes(priceId) ? 'premium' : 'free';
}
