// A Stripe customer's subscriptions, and which of them count (MYK9-2497).
// Deno-free (structural Stripe types) so it runs under vitest.
//
// When a customer holds more than one live subscription (two premium
// checkouts paid at once), the OLDEST is the one they keep: it alone grants
// the tier, and every newer live one is a duplicate queued for a refund.

import { BLOCKING_SUBSCRIPTION_STATUSES } from './existingSubscriptionGuard.ts';

/** The subscription fields these rules read. */
export interface RankedSubscription {
  id: string;
  status: string;
  /** Unix seconds (Stripe's `created`). */
  created: number;
}

/** Statuses whose subscription grants the paid tier. */
export const ENTITLING_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing']);

interface Page<T> {
  data: T[];
  has_more: boolean;
}

export interface AllSubscriptionsLister<T extends { id: string }> {
  subscriptions: {
    list(params: {
      customer: string;
      status: 'all';
      limit: number;
      starting_after?: string;
    }): Promise<Page<T>>;
  };
}

/** Every subscription the customer has, any status, following pagination. */
export async function listAllSubscriptions<T extends { id: string }>(
  stripe: AllSubscriptionsLister<T>,
  customerId: string
): Promise<T[]> {
  const all: T[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const page = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    all.push(...page.data);
    if (!page.has_more || page.data.length === 0) return all;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

function oldestFirst<T extends RankedSubscription>(a: T, b: T): number {
  return a.created - b.created || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The live (active, trialing, past_due) subscriptions split into the one the
 * customer keeps (the oldest) and the duplicates (every newer one). Both
 * checkout completion events see the same split, whichever arrives first.
 */
export function splitLiveSubscriptions<T extends RankedSubscription>(
  subscriptions: T[]
): { kept: T | null; duplicates: T[] } {
  const live = subscriptions
    .filter(sub => BLOCKING_SUBSCRIPTION_STATUSES.has(sub.status))
    .sort(oldestFirst);
  return { kept: live[0] ?? null, duplicates: live.slice(1) };
}

/**
 * The subscription that grants the customer's tier: the oldest active or
 * trialing one, or null when none does. A duplicate never grants a second
 * entitlement, and cancelling it leaves the kept one in charge.
 */
export function entitlingSubscription<T extends RankedSubscription>(subscriptions: T[]): T | null {
  return (
    subscriptions
      .filter(sub => ENTITLING_SUBSCRIPTION_STATUSES.has(sub.status))
      .sort(oldestFirst)[0] ?? null
  );
}
