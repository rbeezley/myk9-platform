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
  deleteDraft: () => Promise<void>;
  navigate: (path: string) => void;
}

interface RegistrationCartCheckoutParams {
  showId: string;
  ownerResolution: SelectedDogsOwnerResult;
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  classes: ClassLike[];
  showFeeInfo: ShowFeeInfo;
  deps: RegistrationCartCheckoutDeps;
}

export async function submitRegistrationCartCheckout({
  showId,
  ownerResolution,
  classSelections,
  handlerAssignments,
  classes,
  showFeeInfo,
  deps,
}: RegistrationCartCheckoutParams): Promise<void> {
  if (!ownerResolution.ok) {
    throw new Error('Cannot determine exhibitor for this entry.');
  }

  const exhibitorId = ownerResolution.ownerId;
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

  const items = registrationToCartItems(
    classSelections,
    handlerAssignments,
    classes,
    showFeeInfo
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

  await deps.deleteDraft();
  deps.navigate('/cart');
}
