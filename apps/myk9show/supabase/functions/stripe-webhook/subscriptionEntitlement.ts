// The exhibitor_profiles tier a customer is entitled to NOW, from every one of
// the customer's subscriptions (MYK9-2338 review). Deriving it from the single
// subscription an event names lets a retried event about an old, canceled
// subscription overwrite the premium tier a replacement subscription already
// granted. Pure, so it is unit-tested under vitest.

export interface SubscriptionForEntitlement {
  status: string;
  priceId: string | null | undefined;
  /** Stripe's current_period_end, in epoch seconds. */
  currentPeriodEnd: number;
}

export interface Entitlement {
  tier: 'free' | 'premium';
  expiresAt: string | null;
}

const ENTITLING_STATUSES = new Set(['active', 'trialing']);

export function currentEntitlement(
  subscriptions: SubscriptionForEntitlement[],
  tierOf: (priceId: string | undefined) => 'free' | 'premium'
): Entitlement {
  const entitling = subscriptions.filter(s => ENTITLING_STATUSES.has(s.status));
  if (entitling.length === 0) return { tier: 'free', expiresAt: null };
  const premium = entitling.filter(s => tierOf(s.priceId ?? undefined) === 'premium');
  const winners = premium.length > 0 ? premium : entitling;
  const latestEnd = Math.max(...winners.map(s => s.currentPeriodEnd));
  return {
    tier: premium.length > 0 ? 'premium' : 'free',
    expiresAt: new Date(latestEnd * 1000).toISOString(),
  };
}
