import {
  parseJuniorHandlerFee,
  type ShowFeeInfo,
} from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import type { EnsureCartResult, NewCartItem } from '@/store/cartStore';
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
}

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
}: RegistrationCartCheckoutParams): Promise<void> {
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
    throw new Error('Failed to clear existing cart. Please try again.');
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
        throw new Error('Failed to add entry to cart');
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
  // cart — before Stripe had even loaded — so a cancelled checkout left nothing
  // to come back to and Continue Shopping opened an empty wizard. The draft is
  // retired where the entries are actually filed: the non-card submit paths
  // call `discardDraftsWithoutFinalSave`, and a verified card checkout prunes
  // the filed lines from `CheckoutSuccessPage`.
  deps.navigate('/cart');
}
