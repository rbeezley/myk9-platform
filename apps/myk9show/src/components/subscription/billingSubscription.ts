/** The stripe_subscriptions columns the account billing card reads. */
export interface BillingSubscriptionRow {
  status: string | null;
  stripe_price_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  customer_id: string | null;
  created_at: string | null;
}

const LIVE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

/**
 * The subscription row the billing card describes (MYK9-2497). A customer can
 * briefly hold two subscriptions when two premium checkouts were paid at once.
 * The webhook keeps the OLDEST live one and the newer one is cancelled, so the
 * newest row is often the cancelled duplicate. Show the oldest live row (the
 * one that renews); with no live row, the newest row, as before.
 */
export function pickBillingSubscription<T extends BillingSubscriptionRow>(rows: T[]): T | null {
  const oldestFirst = (a: T, b: T) => (a.created_at ?? '').localeCompare(b.created_at ?? '');
  const live = rows.filter(row => row.status !== null && LIVE_STATUSES.has(row.status));
  if (live.length > 0) return [...live].sort(oldestFirst)[0];
  return [...rows].sort((a, b) => oldestFirst(b, a))[0] ?? null;
}
