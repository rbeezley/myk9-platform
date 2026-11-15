import {
  parseJuniorHandlerFee,
  type ShowFeeInfo,
} from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import {
  startCartCheckout,
  type CartCheckoutOutcome,
  type StartCartCheckoutInput,
} from '@/features/payments/startCartCheckout';
import { buildScopedCartHref } from '@/features/payments/finishPaymentHref';
import { fetchCartCapacity } from '@/hooks/queries/useCartCapacity';
import { CART_ERROR } from '@/pages/cartErrorCopy';
import type {
  CartWithDetails,
  EnsureCartResult,
  NewCartItem,
  WaitlistEntryResult,
} from '@/store/cartStore';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import { registrationToCartItems } from '@/utils/registrationToCartItems';
import { PlainEntryError } from './entrySubmitErrorCopy';
import type { SelectedDogsOwnerResult } from './selectedDogsOwner';

interface ClassLike {
  id: string;
  entryFee?: number | undefined;
}

interface RegistrationCartCheckoutDeps {
  ensureCart: (showId: string, exhibitorId: string) => Promise<EnsureCartResult>;
  clearCart: () => Promise<boolean>;
  addItem: (item: NewCartItem) => Promise<boolean>;
  abandonCart: () => Promise<boolean>;
  /**
   * MYK9-1964: opens Stripe for the cart just filled, through the same
   * `startCartCheckout` /cart's Pay runs (see `startWizardCardCheckout`).
   */
  startCheckout: () => Promise<CartCheckoutOutcome>;
  navigate: (path: string) => void;
}

/** How the hand-off ended when it did not throw. */
export type RegistrationCartCheckoutResult =
  /** Stripe's page is loading: the caller keeps its in-flight latch held. */
  | { kind: 'redirecting' }
  /** Every line went to a wait list; the caller has been navigated away. */
  | { kind: 'navigated' }
  /**
   * stripe-checkout answered 409: the cart row on the server is now the one
   * to review (fees re-priced and healed, a class closed, the cart changed).
   * The caller has been sent to /cart, and `message` is the server's sentence.
   */
  | { kind: 'reviewOnCart'; message: string };

interface RegistrationCartCheckoutParams {
  showId: string;
  ownerResolution: SelectedDogsOwnerResult;
  /** exhibitor_profiles.id for the cart owner. Required — entry_carts.exhibitor_id references exhibitor_profiles, not people. */
  exhibitorProfileId: string;
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  classes: ClassLike[];
  showFeeInfo: ShowFeeInfo;
  /** MYK9-879: dogs whose handler the exhibitor declared a junior. */
  juniorHandlerDogIds?: ReadonlySet<string> | undefined;
  deps: RegistrationCartCheckoutDeps;
}

export async function submitRegistrationCartCheckout({
  showId,
  ownerResolution,
  exhibitorProfileId,
  classSelections,
  handlerAssignments,
  classes,
  showFeeInfo,
  juniorHandlerDogIds,
  deps,
}: RegistrationCartCheckoutParams): Promise<RegistrationCartCheckoutResult> {
  if (!ownerResolution.ok) {
    throw new Error('Cannot determine exhibitor for this entry.');
  }
  if (!exhibitorProfileId) {
    throw new Error('Cannot determine exhibitor profile for this entry.');
  }

  const exhibitorId = exhibitorProfileId;
  // MYK9-581: one recover-or-create call. The old load-then-create pair read
  // `expires_at` while the unique index does not, so a lapsed cart read as "no
  // cart" and the follow-on INSERT could only 409. The opener answers with
  // `ready` or `failed`, so there is no "no cart and no reason" case to decide
  // what to do about here.
  const opened = await deps.ensureCart(showId, exhibitorId);
  if (opened.kind === 'failed') {
    throw new Error(opened.error);
  }
  // Unconditionally, as `main` did. `cart.items` is a CLIENT snapshot taken
  // before these adds; anything inserted into the row since (a second tab, the
  // /cart page) is invisible to it, and `stripe-checkout` prices whatever the
  // row actually holds. A money guarantee may not rest on client state
  // (review C P2-2) — on an empty cart this is a zero-row DELETE.
  const cleared = await deps.clearCart();
  if (!cleared) {
    throw new Error('Failed to clear your existing entry. Please try again.');
  }

  // A declaration only counts on a show that has a junior tier. Dropped otherwise
  // so a stale tick (the fee was removed after the dog was ticked) cannot ride
  // along. (The wizard never offers the control on ASCA, so none arrives there.)
  const items = registrationToCartItems(
    classSelections,
    handlerAssignments,
    classes,
    showFeeInfo,
    parseJuniorHandlerFee(showFeeInfo) !== null ? juniorHandlerDogIds : undefined
  );

  let addedCount = 0;
  try {
    for (const item of items) {
      const added = await deps.addItem(item);
      if (!added) {
        throw new Error('Failed to add entry');
      }
      addedCount++;
    }
  } catch (error) {
    if (addedCount > 0) {
      await deps.abandonCart();
    }
    throw error;
  }

  // MYK9-509: the wizard draft deliberately SURVIVES the hand-off. Deleting it
  // here retired the exhibitor's selections the moment the lines reached the
  // cart, before Stripe had even loaded, so a cancelled checkout left nothing
  // to come back to and Continue Shopping opened an empty wizard. The draft is
  // retired where the entries are actually filed: the non-card submit paths
  // call `discardDraftsWithoutFinalSave`, and a verified card checkout prunes
  // the filed lines from `CheckoutSuccessPage`.
  //
  // MYK9-1964: straight to Stripe, not through a second review of the same
  // lines on /cart. Cancelling on Stripe still lands on /cart.
  const outcome = await deps.startCheckout();
  if (outcome.kind === 'redirecting') return { kind: 'redirecting' };
  if (outcome.kind === 'waitlistOnly') {
    deps.navigate(outcome.path);
    return { kind: 'navigated' };
  }

  // A full class may already be on its wait list (saved before Stripe was
  // asked). Say so on every failure below, or she cannot tell from the kept
  // selections. A retry re-sends that line, and `add_to_waitlist` answers with
  // the request it already holds for that dog and class rather than adding a
  // second one.
  const saved = outcome.savedWaitlist ?? [];
  const withSaved = (message: string) =>
    saved.length > 0 ? `${describeSavedWaitlist(saved)} ${message}` : message;

  // A 409 means the server's cart row is now what must be reviewed: on a fee
  // drift stripe-checkout heals the stored line fees and totals before
  // answering, and on a closed class the /cart load reconciles the lines and
  // says why. Clearing here would throw the healed cart away, and a retry
  // from the wizard would refill it at the stale fees and earn the same 409.
  // So leave the cart exactly as the server left it and open /cart, which
  // loads it fresh (the recovery /cart's own Pay runs on a 409).
  if (outcome.status === 409) {
    deps.navigate(buildScopedCartHref(showId));
    // The caller shows this over /cart, where the cart now is.
    return { kind: 'reviewOnCart', message: withSaved(outcome.message) };
  }

  // Checkout did not start. Empty the cart this call just filled, so nothing
  // half-done waits on /cart; the wizard still holds every selection, so a
  // retry refills it. Clear first (it also retires a cart that holds a
  // checkout session, MYK9-975); abandon if the clear itself fails.
  if (!(await deps.clearCart())) {
    await deps.abandonCart();
  }
  throw new PlainEntryError(withSaved(outcome.message));
}

/** "Your waitlist request for Novice Container is saved. Payment for ..." */
export function describeSavedWaitlist(saved: readonly WaitlistEntryResult[]): string {
  const names = Array.from(
    new Set(saved.map(entry => entry.className?.trim()).filter((name): name is string => !!name))
  );
  const plural = saved.length > 1;
  const subject = plural ? 'Your waitlist requests' : 'Your waitlist request';
  const forClasses =
    names.length === 0
      ? ''
      : names.length === 1
        ? ` for ${names[0]}`
        : ` for ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${subject}${forClasses} ${plural ? 'are' : 'is'} saved. Payment for the other classes did not start.`;
}

interface WizardCardCheckoutParams {
  showId: string;
  exhibitorProfileId: string;
  /** The store's cart as it is now, read AFTER the fill. */
  getCart: () => CartWithDetails | null;
  checkoutWithWaitlist: StartCartCheckoutInput['checkoutWithWaitlist'];
  removeItem: StartCartCheckoutInput['removeItem'];
}

/**
 * The wizard's `startCheckout`: /cart's checkout, on the cart the wizard just
 * filled. Availability is read fresh from the server, exactly as /cart's Pay
 * re-checks it; a failed read fails closed.
 */
export async function startWizardCardCheckout({
  showId,
  exhibitorProfileId,
  getCart,
  checkoutWithWaitlist,
  removeItem,
}: WizardCardCheckoutParams): Promise<CartCheckoutOutcome> {
  const cart = getCart();
  // The fill opened this show's cart; anything else on the store now is not it.
  if (!cart || cart.show_id !== showId) {
    return { kind: 'failed', message: CART_ERROR.checkoutFailed, status: null };
  }
  return startCartCheckout({
    cart,
    items: cart.items,
    exhibitorProfileId,
    readCapacity: () => fetchCartCapacity(cart.show_id).catch(() => null),
    checkoutWithWaitlist,
    removeItem,
  });
}
