/**
 * Deep-link to the cart-recovery / "Finish Payment" flow.
 *
 * The cart page (`/cart`) reads `showId` + `entryIds` from the query string and
 * rebuilds the cart so the exhibitor can retry checkout (see CartPage +
 * cartStore.loadActiveCart). `showId` scopes the cart lookup to the right show —
 * without it, recovery falls back to the exhibitor's most-recent cart, which may
 * belong to a different show. `entryIds` rebuilds an empty cart shell from the
 * exact entries the order covered.
 *
 * Shared by MyEntryCard's per-entry "Finish Payment" button and the My Payments
 * page's retry affordance for failed/cancelled orders, so both produce an
 * identical recovery URL.
 */
export function buildFinishPaymentHref(showId: string, entryIds: string[]): string {
  const params = new URLSearchParams();
  params.set('showId', showId);
  params.set('entryIds', entryIds.join(','));
  return `/cart?${params.toString()}`;
}
