/**
 * Deep-link from a settled payment row to the entries that payment covers.
 *
 * The mirror image of `buildFinishPaymentHref`, pointed at My Shows instead
 * of the cart. My Shows reads the shared show/entry scope plus `orderId`, so
 * "Receipt" lands on the exact payment instead of every historical entry.
 *
 * `orderId` drives a separate exact stripe_orders fetch and never inherits the
 * payment list's date/range bounds. `entryIds` scopes the visible card to that
 * order's class rows; `showId` is the fallback while rows are still replicating.
 */
import {
  ENTRY_SCOPE_ENTRIES_PARAM,
  ENTRY_SCOPE_ORDER_PARAM,
  ENTRY_SCOPE_SHOW_PARAM,
} from './entryScopeParams';

/** Route the scoped receipt link targets — My Shows (a.k.a. My Entries). */
const MY_SHOWS_PATH = '/exhibitor/entries';

export function buildEntryReceiptHref(
  showId: string | null,
  entryIds: string[],
  orderId?: string
): string {
  const params = new URLSearchParams();
  if (orderId) params.set(ENTRY_SCOPE_ORDER_PARAM, orderId);
  if (showId) params.set(ENTRY_SCOPE_SHOW_PARAM, showId);
  // An empty `entryIds=` would parse to no ids anyway; omit it so an
  // order with no linked entries produces a clean show-scoped URL rather
  // than a trailing empty param the reader has to special-case.
  if (entryIds.length > 0) params.set(ENTRY_SCOPE_ENTRIES_PARAM, entryIds.join(','));
  const query = params.toString();
  return query ? `${MY_SHOWS_PATH}?${query}` : MY_SHOWS_PATH;
}
