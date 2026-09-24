/**
 * The one gate on the persisted cart recovery ids (MYK9-651).
 *
 * `cartRecoveryInfo` is written to localStorage by the cart store's
 * `partialize` and outlives the session, so account A's ids can still be there
 * when account B opens the tab. Clearing them on an account change helps, but
 * nothing may DEPEND on it: every reader goes through this function, which
 * honours the ids only when they name the signed-in exhibitor. A missing
 * exhibitor (nobody signed in, or the profile not loaded yet), ids saved in the
 * legacy shape without an `exhibitorId`, or a different exhibitor all read as
 * absent.
 */
import type { CartState } from './cartStore.types';

export type CartRecoveryInfo = NonNullable<CartState['cartRecoveryInfo']>;

export function readTrustedRecoveryInfo(
  info: CartState['cartRecoveryInfo'],
  exhibitorId: string | null | undefined
): CartRecoveryInfo | null {
  if (!info || !exhibitorId) return null;
  return info.exhibitorId === exhibitorId ? info : null;
}
