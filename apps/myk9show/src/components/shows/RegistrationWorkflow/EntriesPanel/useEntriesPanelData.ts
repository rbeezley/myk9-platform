/**
 * Wiring for the wizard's entries panel.
 *
 * Both hooks read stores the wizard already subscribes to — the replicated
 * dog / class / trial stores and the cart store. Nothing here opens a new data
 * path, and the panel itself performs no mutation beyond the cart-store removal
 * the payment step already owned.
 */

import { useCallback, useMemo, useState } from 'react';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useTrialStore } from '@/store/trialStore';
import { useCartItems, useCartStore } from '@/store/cartStore';
import { toast } from 'sonner';
import type { ClassSelectionData } from '@/types/show-registration-types';
import type { FeeCalculationResult } from '../PaymentStep/types';
import { removeClassFromSelections } from '../ClassSelectionStep.helpers';
import {
  cartItemsFromFeeBreakdown,
  groupCartByDogAndDay,
  type PanelClass,
  type PanelDog,
  type PanelDogGroup,
  type PanelTrial,
} from './EntriesPanel.helpers';

interface EntriesPanelGroupsInput {
  selectedDogIds: string[];
  feeCalculation: FeeCalculationResult;
}

/** The panel's itemised rows, grouped per dog and trial day. */
export function useEntriesPanelGroups({
  selectedDogIds,
  feeCalculation,
}: EntriesPanelGroupsInput): PanelDogGroup[] {
  const { dogs } = useDogStoreCompat();
  const { classes = [] } = useClassStoreCompat();
  const trials = useTrialStore(s => s.trials);

  const dogsById = useMemo(() => new Map<string, PanelDog>(dogs.map(dog => [dog.id, dog])), [dogs]);
  const classesById = useMemo(
    () => new Map<string, PanelClass>(classes.map(klass => [klass.id, klass])),
    [classes]
  );
  const trialsById = useMemo(
    () => new Map<string, PanelTrial>((trials || []).map(trial => [trial.id, trial])),
    [trials]
  );

  return useMemo(
    () =>
      groupCartByDogAndDay(
        cartItemsFromFeeBreakdown(feeCalculation.breakdown),
        dogsById,
        classesById,
        trialsById,
        selectedDogIds
      ),
    [feeCalculation.breakdown, dogsById, classesById, trialsById, selectedDogIds]
  );
}

interface RemoveEntryLine {
  removeLine: (dogId: string, classId: string) => Promise<void>;
  removingLineKey: string | null;
}

/**
 * Remove one fee line on the payment step: the cart row first, then the
 * wizard's own selection. Lifted out of `PaymentStep` unchanged when the
 * fee-line list moved into the panel; the confirm-before-remove step is a
 * separate task and deliberately not here yet.
 */
export function useRemoveEntryLine(
  classSelections: ClassSelectionData[],
  onClassSelectionChange?: ((selections: ClassSelectionData[]) => void | Promise<void>) | undefined
): RemoveEntryLine {
  const cartItems = useCartItems();
  const removeItem = useCartStore(state => state.removeItem);
  const [removingLineKey, setRemovingLineKey] = useState<string | null>(null);

  const removeLine = useCallback(
    async (dogId: string, classId: string) => {
      if (!onClassSelectionChange) return;
      setRemovingLineKey(`${dogId}:${classId}`);
      try {
        const cartItem = cartItems.find(item => item.dog_id === dogId && item.class_id === classId);
        if (cartItem) {
          const success = await removeItem(cartItem.id);
          if (!success) {
            toast.error('Failed to remove from cart');
            return;
          }
        }
        await onClassSelectionChange(removeClassFromSelections(classSelections, dogId, classId));
      } finally {
        setRemovingLineKey(null);
      }
    },
    [cartItems, classSelections, onClassSelectionChange, removeItem]
  );

  return { removeLine, removingLineKey };
}
