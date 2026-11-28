/** The stripe_subscriptions columns the account billing card reads. */
export interface BillingSubscriptionRow {
  status: string | null;
  stripe_price_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  customer_id: string | null;
  created_at: string | null;
  stripe_subscription_id: string;
  /** Stripe's creation time; NULL on rows not synced since MYK9-2497. */
  stripe_created_at: string | null;
}

/** The webhook's live statuses (BLOCKING_SUBSCRIPTION_STATUSES in stripe-webhook). */
const LIVE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

const instant = (row: BillingSubscriptionRow) =>
  Date.parse(row.stripe_created_at ?? row.created_at ?? '') || 0;

/**
 * Stripe's (created, id) order, the order stripe-webhook uses to pick the kept
 * subscription (customerSubscriptions.ts). Ids compare by code unit, as there.
 */
function oldestFirst(a: BillingSubscriptionRow, b: BillingSubscriptionRow): number {
  const byTime = instant(a) - instant(b);
  if (byTime !== 0) return byTime;
  if (a.stripe_subscription_id === b.stripe_subscription_id) return 0;
  return a.stripe_subscription_id < b.stripe_subscription_id ? -1 : 1;
}

/**
 * The subscription row the billing card describes (MYK9-2497). A customer can
 * briefly hold two subscriptions when two premium checkouts were paid at once.
 * The webhook keeps the OLDEST live one by Stripe's creation time and the newer
 * one is refunded and cancelled. Show that kept row, never the duplicate,
 * whichever was synced first; with no live row, the newest row, as before.
 */
export function pickBillingSubscription<T extends BillingSubscriptionRow>(rows: T[]): T | null {
  const live = rows.filter(row => row.status !== null && LIVE_STATUSES.has(row.status));
  if (live.length > 0) return [...live].sort(oldestFirst)[0];
  return [...rows].sort((a, b) => oldestFirst(b, a))[0] ?? null;
}
