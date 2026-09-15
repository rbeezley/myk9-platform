import type { ShowFeeInfo } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import type { CartWithDetails, NewCartItem } from '@/store/cartStore';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import { registrationToCartItems } from '@/utils/registrationToCartItems';
import type { SelectedDogsOwnerResult } from './selectedDogsOwner';

interface ClassLike {
  id: string;
  entryFee?: number | undefined;
}

interface RegistrationCartCheckoutDeps {
  loadCart: (showId: string, exhibitorId: string) => Promise<CartWithDetails | null>;
  clearCart: () => Promise<boolean>;
  createCart: (showId: string, exhibitorId: string) => Promise<CartWithDetails | null>;
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
  deps,
}: RegistrationCartCheckoutParams): Promise<void> {
  if (!ownerResolution.ok) {
    throw new Error('Cannot determine exhibitor for this entry.');
  }
  if (!exhibitorProfileId) {
    throw new Error('Cannot determine exhibitor profile for this entry.');
  }

  const exhibitorId = exhibitorProfileId;
  const existingCart = await deps.loadCart(showId, exhibitorId);
  if (existingCart) {
    const cleared = await deps.clearCart();
    if (!cleared) {
      throw new Error('Failed to clear existing cart. Please try again.');
    }
  } else {
    const createdCart = await deps.createCart(showId, exhibitorId);
    if (!createdCart) {
      throw new Error('Failed to create cart');
    }
  }

  const items = registrationToCartItems(classSelections, handlerAssignments, classes, showFeeInfo);

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
