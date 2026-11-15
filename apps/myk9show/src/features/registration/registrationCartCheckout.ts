import {
  parseJuniorHandlerFee,
  type ShowFeeInfo,
} from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import { buildScopedCartHref } from '@/features/payments/finishPaymentHref';
import { runCartCheckout, type RunCartCheckoutParams } from '@/features/payments/runCartCheckout';
import { reportCheckoutFailure } from '@/pages/cartErrorCopy';
import type { EnsureCartResult, NewCartItem } from '@/store/cartStore';
import type { CartWithDetails } from '@/store/cartStore.types';
import { PlainEntryError } from './entrySubmitErrorCopy';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import { registrationToCartItems } from '@/utils/registrationToCartItems';
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
  navigate: (path: string) => void;
  /** The cart as the store holds it once the adds have landed. */
  getCart: () => CartWithDetails | null;
  /** `/cart`'s own checkout steps (MYK9-1964): one checkout path, not two. */
  checkout: RunCartCheckoutParams['deps'];
  /** Judge names, which only label a full judge day in a refusal. */
  loadJudgeNames?: (showId: string) => Promise<ReadonlyMap<string, string>>;
}

/**
 * How a card hand-off ended when it did not throw. A failure that leaves the
 * cart exactly as the wizard built it throws instead (a `PlainEntryError`), so
 * the exhibitor stays on the Payment step with her selections.
 */
export type RegistrationCardCheckoutResult =
  /** On the way to Stripe. */
  | { kind: 'redirecting' }
  /** Every class went to a wait list; sent to the wait-list confirmation. */
  | { kind: 'navigated' }
  /**
   * Checkout failed AFTER wait-list requests were filed, so the cart no longer
   * matches the wizard. Sent to `/cart`, which shows what is left to pay.
   */
  | { kind: 'sentToCart'; message: string };

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
}: RegistrationCartCheckoutParams): Promise<RegistrationCardCheckoutResult> {
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
  // MYK9-1964: straight to Stripe from here, through the very steps /cart's
  // Pay button runs. The checkout carries the cart id only; stripe-checkout
  // prices the row these adds just wrote.
  const cart = deps.getCart();
  if (!cart || cart.show_id !== showId) {
    throw new Error('The entry was not ready for payment.');
  }
  const judgeNameById = deps.loadJudgeNames
    ? await deps.loadJudgeNames(showId).catch(() => new Map<string, string>())
    : undefined;
  const outcome = await runCartCheckout({
    cartId: cart.id,
    showId,
    exhibitorProfileId: exhibitorId,
    items: cart.items,
    // Lines the wizard just added are new entries: always re-read capacity.
    onlyRecoveredItems: false,
    judgeNameById,
    deps: deps.checkout,
  });

  if (outcome.kind === 'redirecting') return { kind: 'redirecting' };
  if (outcome.kind === 'waitlistOnly') {
    deps.navigate(outcome.successPath);
    return { kind: 'navigated' };
  }

  const message =
    outcome.kind === 'refused' ? outcome.message : reportCheckoutFailure(outcome.error, cart.id);
  if (outcome.waitlistCommitted) {
    // Wait-list rows exist and their lines left the cart. Throwing the cart
    // away would lose the lines still to pay, and a retry from the wizard
    // would file the same wait-list requests again.
    deps.navigate(buildScopedCartHref(showId));
    return { kind: 'sentToCart', message };
  }
  // Nothing was filed or charged: the cart goes, the wizard keeps her choices,
  // and the next press refills it from them.
  await deps.abandonCart();
  throw new PlainEntryError(message);
}
