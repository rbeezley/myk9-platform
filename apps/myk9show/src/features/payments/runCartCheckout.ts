/**
 * The ONE card checkout path for an entry cart (MYK9-1964).
 *
 * `/cart`'s Pay button and the wizard's Pay button both run this, so whatever
 * the cart checks before it opens a Stripe page also runs when the wizard goes
 * straight to Stripe. In order:
 *
 *  1. class availability is read FRESH (never the render-time snapshot) and an
 *     unreadable read stops checkout (fail closed);
 *  2. the cart is split by that read: a line in a full class with no wait list
 *     stops checkout and says which; a full class that takes a wait list is
 *     filed there (`add_to_waitlist`) and its line removed from the cart;
 *  3. when nothing is left to pay, the caller is sent to the wait-list
 *     confirmation; otherwise `stripe-checkout` is asked for a session.
 *
 * `stripe-checkout` then prices the cart ROW (never an amount from here) and
 * runs its own gates: entry window, online entries on, the club's payout
 * account, the class gate, the spot hold.
 *
 * Never throws. Whether the cart may have changed on the server before the
 * failure (`waitlistCommitted`) travels with every failure, because a caller
 * that wants to throw the cart away must not do so once wait-list rows exist.
 */
import type { CartItemWithDetails, CheckoutResult } from '@/store/cartStore.types';
import type { CartCapacityFacts } from './cartCapacityFromJudgeDays';
import { splitCartItemsByJudgeDayCapacity } from './cartCapacitySplit';
import { describeBlockedCheckout } from './cartFullReasonCopy';
import { writeCartSplitCheckoutSummary } from './cartSplitCheckoutStorage';
import { CART_ERROR } from '@/pages/cartErrorCopy';

export const CART_CHECKOUT_COPY = {
  capacityUnconfirmed:
    'We could not confirm which classes are still open. Please check availability and try again.',
  waitlistFailed: CART_ERROR.waitlistFailed,
  waitlistRefreshFailed:
    'Your waitlist request was saved, but we could not refresh your entry for payment. Please restart the app before trying again.',
} as const;

/** What a capacity re-read resolves with (React Query's `refetch` result shape). */
export interface CartCapacityRead {
  isError: boolean;
  data?: CartCapacityFacts | undefined;
}

export interface RunCartCheckoutParams {
  cartId: string;
  showId: string;
  /** exhibitor_profiles.id, for the wait-list RPC. */
  exhibitorProfileId: string;
  items: CartItemWithDetails[];
  /** Every line is an already-submitted entry: no capacity read is needed. */
  onlyRecoveredItems: boolean;
  judgeNameById?: ReadonlyMap<string, string> | undefined;
  deps: {
    refetchCapacity: () => Promise<CartCapacityRead>;
    checkoutWithWaitlist: (
      exhibitorId: string,
      waitlistCartItemIds: Set<string>
    ) => Promise<CheckoutResult | null>;
    removeItem: (itemId: string) => Promise<boolean>;
    /** `createEntryCheckoutSession`: takes the cart id, never an amount. */
    createCheckoutSession: (
      cartId: string,
      options: { showId: string; splitCheckoutId?: string }
    ) => Promise<void>;
    createCorrelationId?: () => string;
  };
}

export type CartCheckoutOutcome =
  /** The browser is on its way to Stripe. */
  | { kind: 'redirecting' }
  /** Every line went to a wait list: nothing to pay. */
  | { kind: 'waitlistOnly'; successPath: string }
  /** Stopped before a session was asked for, with a sentence for the exhibitor. */
  | { kind: 'refused'; message: string; waitlistCommitted: boolean }
  /** A call threw (most often `stripe-checkout` refusing); `error` is the raw failure. */
  | { kind: 'failed'; error: unknown; waitlistCommitted: boolean };

function defaultCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `split-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function runCartCheckout({
  cartId,
  showId,
  exhibitorProfileId,
  items,
  onlyRecoveredItems,
  judgeNameById,
  deps,
}: RunCartCheckoutParams): Promise<CartCheckoutOutcome> {
  let waitlistCommitted = false;
  try {
    // Re-check capacity at submit rather than trusting a render-time snapshot.
    // Global query defaults are staleTime 5min with refetchOnWindowFocus:false,
    // so a class that filled while the page sat open would be classified
    // payable, charged, and then refunded by the server's overflow path. One
    // refetch routes it to the waitlist cleanly instead.
    const fresh = onlyRecoveredItems ? null : await deps.refetchCapacity();

    // Fail closed. refetch() resolves with the error inside the result rather
    // than rejecting, and on failure `fresh.data` still holds the last
    // SUCCESSFUL payload, which is exactly the stale snapshot this re-check
    // exists to replace.
    if (!onlyRecoveredItems && (fresh?.isError || !fresh?.data)) {
      return {
        kind: 'refused',
        message: CART_CHECKOUT_COPY.capacityUnconfirmed,
        waitlistCommitted,
      };
    }

    // MYK9-1019: the server's effective "takes a waitlist", read fresh, so a
    // setting the secretary changed while this cart was open is honoured.
    const splitDecision = splitCartItemsByJudgeDayCapacity(
      items,
      fresh?.data?.judgeDays ?? [],
      fresh?.data?.classSpots ?? [],
      fresh?.data?.waitlistClassIds ?? []
    );

    if (splitDecision.blockedItems.length > 0) {
      return {
        kind: 'refused',
        message: describeBlockedCheckout(
          splitDecision.blockedItems,
          splitDecision.fullReasonByItemId,
          judgeNameById
        ),
        waitlistCommitted,
      };
    }

    // From here a wait-list RPC may have landed even if the call reports failure.
    waitlistCommitted = splitDecision.waitlistItemIds.size > 0;
    const splitResult = await deps.checkoutWithWaitlist(
      exhibitorProfileId,
      splitDecision.waitlistItemIds
    );
    if (!splitResult) {
      return { kind: 'refused', message: CART_CHECKOUT_COPY.waitlistFailed, waitlistCommitted };
    }

    for (const itemId of splitDecision.waitlistItemIds) {
      if (!(await deps.removeItem(itemId))) {
        return {
          kind: 'refused',
          message: CART_CHECKOUT_COPY.waitlistRefreshFailed,
          waitlistCommitted,
        };
      }
    }

    const splitCheckoutId =
      splitResult.waitlisted.length > 0
        ? (deps.createCorrelationId ?? defaultCorrelationId)()
        : null;

    if (splitCheckoutId) {
      writeCartSplitCheckoutSummary({
        correlationId: splitCheckoutId,
        showId,
        confirmedEntryCount: splitResult.confirmed.length,
        waitlistEntries: splitResult.waitlisted,
      });
    }

    if (splitResult.confirmed.length === 0) {
      return {
        kind: 'waitlistOnly',
        successPath: splitCheckoutId
          ? `/checkout/success?waitlist=1&split=${encodeURIComponent(splitCheckoutId)}`
          : '/checkout/success?waitlist=1',
      };
    }

    // Redirects to Stripe for the remaining confirmed entries.
    await deps.createCheckoutSession(cartId, {
      showId,
      ...(splitCheckoutId ? { splitCheckoutId } : {}),
    });
    return { kind: 'redirecting' };
  } catch (error) {
    return { kind: 'failed', error, waitlistCommitted };
  }
}
