/**
 * MYK9-1964: the one way an entry cart goes to Stripe.
 *
 * `/cart`'s Pay button and the wizard's card Pay button both call this, so a
 * card payment from either place runs the same checks and opens the same kind of
 * checkout session (same success and cancel URLs, cancel lands on `/cart`). The
 * price is never sent from here: `stripe-checkout` prices the cart row it is
 * given, and only the cart id and show id travel.
 *
 * In order:
 *   1. a fresh class-availability read (skipped only when every line is an
 *      already-submitted entry), failing closed when it cannot be confirmed;
 *   2. the pay / wait-list split on those fresh facts: a full class with no
 *      wait list stops checkout with the reason;
 *   3. full classes that take a wait list are committed to it and their lines
 *      leave the cart; nothing left to pay goes to the success page;
 *   4. `createEntryCheckoutSession`, which redirects to Stripe.
 *
 * The caller owns its own in-flight latch and what it shows; this returns what
 * happened and never touches the caller's UI state.
 */

import type { CartItemWithDetails, CheckoutResult } from '@/store/cartStore';
import { CheckoutSessionError, createEntryCheckoutSession } from '@/lib/stripe';
import { CART_ERROR, reportCheckoutFailure } from '@/pages/cartErrorCopy';
import { writeCartSplitCheckoutSummary } from './cartSplitCheckoutStorage';
import { splitCartItemsByJudgeDayCapacity } from './cartCapacitySplit';
import { describeBlockedCheckout } from './cartFullReasonCopy';
import { areAllCartItemsRecovered } from './cartFulfillmentView';
import type { CartCapacityFacts } from './cartCapacityFromJudgeDays';

export const CAPACITY_UNCONFIRMED_MESSAGE =
  'We could not confirm which classes are still open. Please check availability and try again.';

export const WAITLIST_SAVED_REFRESH_FAILED_MESSAGE =
  'Your waitlist request was saved, but we could not refresh your entry for payment. Please restart the app before trying again.';

export type CartCheckoutOutcome =
  /** Stripe's page is loading; keep the in-flight latch held. */
  | { kind: 'redirecting' }
  /** Every line went to a wait list; nothing to pay. The caller navigates. */
  | { kind: 'waitlistOnly'; path: string }
  /** Checkout did not start. `status` is the server's HTTP status when it sent one. */
  | { kind: 'failed'; message: string; status: number | null };

export interface StartCartCheckoutInput {
  cart: { id: string; show_id: string };
  /** The lines the store holds for `cart` right now. */
  items: CartItemWithDetails[];
  /** exhibitor_profiles.id of the cart owner. */
  exhibitorProfileId: string;
  /** A fresh availability read, or null when it could not be confirmed. */
  readCapacity: () => Promise<CartCapacityFacts | null>;
  /** Labels a full judge day in the blocked copy; an empty map names the date alone. */
  judgeNameById?: ReadonlyMap<string, string>;
  checkoutWithWaitlist: (
    exhibitorId: string,
    waitlistCartItemIds: Set<string>
  ) => Promise<CheckoutResult | null>;
  removeItem: (itemId: string) => Promise<boolean>;
}

function createSplitCheckoutCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `split-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const failed = (message: string, status: number | null = null): CartCheckoutOutcome => ({
  kind: 'failed',
  message,
  status,
});

export async function startCartCheckout({
  cart,
  items,
  exhibitorProfileId,
  readCapacity,
  judgeNameById,
  checkoutWithWaitlist,
  removeItem,
}: StartCartCheckoutInput): Promise<CartCheckoutOutcome> {
  // A Stripe session is cart-wide. Skip the capacity read only when every line
  // is an already-submitted entry; a mixed cart stays fail closed so a new line
  // is never charged while availability is unknown.
  const onlyRecoveredItems = areAllCartItemsRecovered(items);

  try {
    // Re-check capacity at submit rather than trusting a render-time snapshot.
    // A class that filled while the exhibitor was deciding would otherwise be
    // classified payable, charged, and then refunded by the server's overflow
    // path. One fresh read routes it to the waitlist cleanly instead.
    const fresh = onlyRecoveredItems ? null : await readCapacity();

    // Fail closed: better to stop and say so than to charge against capacity
    // we could not verify.
    if (!onlyRecoveredItems && !fresh) {
      return failed(CAPACITY_UNCONFIRMED_MESSAGE);
    }

    // MYK9-1019: the server's effective "takes a waitlist", read fresh, so a
    // setting the secretary changed while this cart was open is honoured.
    const splitDecision = splitCartItemsByJudgeDayCapacity(
      items,
      fresh?.judgeDays ?? [],
      fresh?.classSpots ?? [],
      fresh?.waitlistClassIds ?? []
    );
    const blockedItems = splitDecision.blockedItems;

    if (blockedItems.length > 0) {
      return failed(
        describeBlockedCheckout(blockedItems, splitDecision.fullReasonByItemId, judgeNameById)
      );
    }

    const splitResult = await checkoutWithWaitlist(
      exhibitorProfileId,
      splitDecision.waitlistItemIds
    );

    if (!splitResult) {
      return failed(CART_ERROR.waitlistFailed);
    }

    for (const itemId of Array.from(splitDecision.waitlistItemIds)) {
      const removed = await removeItem(itemId);
      if (!removed) {
        return failed(WAITLIST_SAVED_REFRESH_FAILED_MESSAGE);
      }
    }

    const splitCheckoutId =
      splitResult.waitlisted.length > 0 ? createSplitCheckoutCorrelationId() : null;

    if (splitCheckoutId) {
      writeCartSplitCheckoutSummary({
        correlationId: splitCheckoutId,
        showId: cart.show_id,
        confirmedEntryCount: splitResult.confirmed.length,
        waitlistEntries: splitResult.waitlisted,
      });
    }

    if (splitResult.confirmed.length === 0) {
      return {
        kind: 'waitlistOnly',
        path: splitCheckoutId
          ? `/checkout/success?waitlist=1&split=${encodeURIComponent(splitCheckoutId)}`
          : '/checkout/success?waitlist=1',
      };
    }

    // Redirects to Stripe Checkout for the remaining confirmed entries.
    await createEntryCheckoutSession(cart.id, {
      showId: cart.show_id,
      ...(splitCheckoutId ? { splitCheckoutId } : {}),
    });
    return { kind: 'redirecting' };
  } catch (err) {
    // Say what the server said when it wrote it for the exhibitor: it tells
    // failures they can act on (fees were re-priced, review and retry) from
    // ones they cannot (the club has no payout account).
    const status = err instanceof CheckoutSessionError ? err.status : null;
    return failed(reportCheckoutFailure(err, cart.id), status);
  }
}
