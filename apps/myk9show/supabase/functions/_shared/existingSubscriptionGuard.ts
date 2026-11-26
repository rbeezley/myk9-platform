// Pre-flight for subscription checkout (MYK9-2444): a customer who already
// holds a usable subscription must not start a second one. "Usable" is active,
// trialing or past_due; incomplete and unpaid never became a working plan, and
// canceled / incomplete_expired are over, so those do not block.
//
// Deno-free (structural Stripe type) so it runs under vitest.

export const BLOCKING_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  'active',
  'trialing',
  'past_due',
]);

interface SubscriptionPage {
  data: Array<{ id: string; status: string }>;
  has_more: boolean;
}

export interface SubscriptionLister {
  subscriptions: {
    list(params: {
      customer: string;
      status: 'all';
      limit: number;
      starting_after?: string;
    }): Promise<SubscriptionPage>;
  };
}

/** True when the customer has any active, trialing or past_due subscription. */
export async function hasBlockingSubscription(
  stripe: SubscriptionLister,
  customerId: string
): Promise<boolean> {
  let startingAfter: string | undefined;
  for (;;) {
    const page = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (page.data.some(sub => BLOCKING_SUBSCRIPTION_STATUSES.has(sub.status))) return true;
    if (!page.has_more || page.data.length === 0) return false;
    startingAfter = page.data[page.data.length - 1].id;
  }
}
