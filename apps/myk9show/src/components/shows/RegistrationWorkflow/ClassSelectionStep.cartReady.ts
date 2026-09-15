import { useCallback, useRef } from 'react';
import { logger } from '@/services/LoggingService';

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
  cartIsLoading: boolean;
  cartShowId: string | null;
  cartExhibitorId: string | null;
  showId: string;
  exhibitorId: string | undefined;
}

export function isCartReady({
  useCartFlow,
  cartIsLoading,
  cartShowId,
  cartExhibitorId,
  showId,
  exhibitorId,
}: CartReadinessInput): boolean {
  if (!useCartFlow) return true;
  if (cartIsLoading) return false;
  // No exhibitor resolved yet: `loadCart` has not even been given the ids it
  // needs, so nothing about the held cart can be trusted to belong here.
  if (!exhibitorId) return false;
  return cartShowId === showId && cartExhibitorId === exhibitorId;
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
  onBlockedByCart: () => void;
} {
  const cartReady = isCartReady(input);
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
  return { cartReady, onBlockedByCart };
}
