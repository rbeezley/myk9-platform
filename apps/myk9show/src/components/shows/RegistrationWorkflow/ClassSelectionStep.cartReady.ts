import { useCallback, useRef } from 'react';
import { logger } from '@/services/LoggingService';
import type { EnsureCartResult } from '@/store/cartStore.types';

/** Caption on a chip whose cart has not opened YET. */
export const CART_PENDING_REASON = 'Loading your cart…';
/** Caption on a chip whose cart will not open at all, until Try again. */
export const CART_UNAVAILABLE_REASON = 'Your cart could not be opened';

/**
 * Is the cart this step is about to mutate the cart for THIS show and
 * exhibitor, and has it finished loading? (MYK9-542)
 *
 * The cart store is global and holds one cart at a time, so between mount and
 * the first `loadCart` resolving it is either null or still the PREVIOUS show's
 * cart. Every mutation in `toggleClassSelection` is computed against the cart
 * the store holds when the click lands, so a click in that window is not merely
 * early — it is computed against the wrong cart:
 *
 *  - a deselect finds no local row for the pair, removes nothing, and drops the
 *    selection locally. The reconcile that runs the instant the real cart lands
 *    then merges the still-present cart row back in and the chip re-checks
 *    itself. The exhibitor's deselect is silently undone.
 *  - an add reaches `addItem` with no cart (or the wrong one) and returns false
 *    on its `'No active cart'` guard, surfacing "Failed to add to cart" for a
 *    click that was never going to work.
 *
 * This is the same predicate the reconcile effects gate on — here and in
 * `useWizardDraftRehydration` — stated once so the read side and the write side
 * cannot drift apart.
 *
 * The non-cart flow (secretary / admin on-behalf entry) keeps only local
 * selection state, so it has no cart to wait for and is never gated.
 */
export interface CartReadinessInput {
  useCartFlow: boolean;
  /**
   * What the opener said. This is the step's OWN source of truth: a `failed`
   * or still-pending open is never ready, whatever the global store happens to
   * hold. Reading only the store is how a permanently failed open still
   * rendered every chip as "Loading your cart…" (review D1).
   */
  cartOpen: EnsureCartResult | null;
  cartIsLoading: boolean;
  cartShowId: string | null;
  cartExhibitorId: string | null;
  showId: string;
  exhibitorId: string | undefined;
}

export function isCartReady({
  useCartFlow,
  cartOpen,
  cartIsLoading,
  cartShowId,
  cartExhibitorId,
  showId,
  exhibitorId,
}: CartReadinessInput): boolean {
  if (!useCartFlow) return true;
  // No exhibitor resolved yet: the opener has not even been given the ids it
  // needs, so nothing about the held cart can be trusted to belong here.
  if (!exhibitorId) return false;
  // The opener's own answer, for THIS show and exhibitor.
  if (cartOpen?.kind !== 'ready') return false;
  if (cartOpen.cart.show_id !== showId) return false;
  if (cartOpen.cart.exhibitor_id !== exhibitorId) return false;
  // ...and the global store must still hold that same cart, because every
  // mutation in `toggleClassSelection` is computed against `get().cart` when the
  // click lands, not against this result (MYK9-542).
  if (cartIsLoading) return false;
  return cartShowId === showId && cartExhibitorId === exhibitorId;
}

/**
 * Why a chip is not actionable, as the caption the exhibitor reads — or `null`
 * when it is. "Loading your cart…" is only honest while the opener is still in
 * flight; once it has failed, saying it forever is the original bug wearing a
 * new alert (review D1).
 */
export function cartBlockedReason(input: CartReadinessInput): string | null {
  if (isCartReady(input)) return null;
  if (!input.useCartFlow) return null;
  return input.cartOpen?.kind === 'failed' ? CART_UNAVAILABLE_REASON : CART_PENDING_REASON;
}

/**
 * The step's view of that predicate, plus the one-shot log for a click that
 * lands while it is false. Kept beside the predicate so `ClassSelectionStep`
 * reads as `const { cartReady, onBlockedByCart } = useCartToggleGate(...)`.
 *
 * The log fires once per mount, not once per click: a blocked click is a race
 * the exhibitor can repeat freely, and one line is enough to diagnose it.
 */
export function useCartToggleGate(input: CartReadinessInput): {
  cartReady: boolean;
  blockedReason: string | null;
  onBlockedByCart: () => void;
} {
  const cartReady = isCartReady(input);
  const blockedReason = cartBlockedReason(input);
  const logged = useRef(false);
  const onBlockedByCart = useCallback(() => {
    if (logged.current) return;
    logged.current = true;
    logger.warn(
      'Class chip toggled before this show’s cart finished loading; ignoring the click',
      'ClassSelectionStep',
      { ...input }
    );
  }, [input]);
  return { cartReady, blockedReason, onBlockedByCart };
}
