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
 * Shared by My Shows' balance-due strip "Finish payment" link and the My Payments
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

/**
 * The wizard's Submit & pay hand-off (MYK9-1661): `/cart` scoped to the show
 * just submitted. Without `showId` the cart page opens the exhibitor's newest
 * populated cart across shows, which may be another show's. The scope lives in
 * the URL so it survives a reload and the 409 repricing reload.
 */
export function buildScopedCartHref(
  showId: string,
  extraParams: Record<string, string> = {}
): string {
  const params = new URLSearchParams();
  params.set(ENTRY_SCOPE_SHOW_PARAM, showId);
  for (const [key, value] of Object.entries(extraParams)) params.set(key, value);
  return `/cart?${params.toString()}`;
}
