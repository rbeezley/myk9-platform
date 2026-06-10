// Stripe price configuration. Env-driven so staging (sandbox keys since
// 2026-06-09) can point at sandbox prices while live keeps the original ids
// as fallback. The webhook's PREMIUM_PRICE_IDS secret must list every id here.
const LIVE_MONTHLY_PRICE_ID = 'price_1RHz3bAtHgBcw875o2gdNaYW';

export const products = {
  premium: {
    priceId: import.meta.env.VITE_STRIPE_PRICE_MONTHLY || LIVE_MONTHLY_PRICE_ID,
    name: 'myK9Show Premium Subscription',
    description: 'myK9Show Premium — title tracking, health records, training journal, and more',
    mode: 'subscription' as const,
  },
};

/** Annual plan (~$49/yr). Undefined until the env var is set — UI hides the
 * annual option when absent (sandbox/live prices created per the premium
 * launch plan, Tasks 2/3). */
export const annualPriceId: string | undefined =
  import.meta.env.VITE_STRIPE_PRICE_ANNUAL || undefined;
