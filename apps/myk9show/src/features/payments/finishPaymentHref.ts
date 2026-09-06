/**
 * Deep-link to the cart-recovery / "Finish Payment" flow.
 *
 * The cart page (`/cart`) reads `showId` + `entryIds` from the query string and
 * rebuilds the cart so the exhibitor can retry checkout (see CartPage +
 * cartStore.loadActiveCart). `showId` scopes the cart lookup to the right show —
 * without it, recovery falls back to the exhibitor's most-recent cart, which may
 * belong to a different show. `entryIds` rebuilds a cart from the exact unpaid
 * entries the balance covers; recovered lines retain their existing entry
 * identity for checkout.
 *
 * Shared by MyEntryCard's per-entry "Finish Payment" button and the My Payments
 * page's retry affordance for failed/cancelled orders, so both produce an
 * identical recovery URL.
 */
import { ENTRY_SCOPE_ENTRIES_PARAM, ENTRY_SCOPE_SHOW_PARAM } from './entryScopeParams';

export function buildFinishPaymentHref(showId: string, entryIds: string[]): string {
  const params = new URLSearchParams();
  params.set(ENTRY_SCOPE_SHOW_PARAM, showId);
  params.set(ENTRY_SCOPE_ENTRIES_PARAM, entryIds.join(','));
  return `/cart?${params.toString()}`;
}
