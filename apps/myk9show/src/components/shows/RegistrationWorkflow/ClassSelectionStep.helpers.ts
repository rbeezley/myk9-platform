import type { ClassSelectionData } from '@/types/show-registration-types';
import type { Dog } from '@/types/dog-types';
import type { ClassAvailability } from '@/hooks/useClassAvailability';
import type { CartItemWithDetails } from '@/stores/cartStore';
import type { ClassWithTrial } from './ClassSelectionStep.types';
import { getShowEntryFee, type ShowFeeInfo } from './PaymentStep/utils';

/**
 * Build a Map for quick availability lookup by classId.
 */
export function buildAvailabilityMap(
  classAvailability: ClassAvailability[]
): Map<string, ClassAvailability> {
  const map = new Map<string, ClassAvailability>();
  classAvailability.forEach(ca => map.set(ca.classId, ca));
  return map;
}

/**
 * Group classes by their parent trial.
 */
export function buildClassesWithTrials<
  T extends { id: string; trialId?: string | undefined; className?: string | undefined },
>(
  showTrials: Array<{ id: string; name?: string | undefined; trialDate?: string | undefined }>,
  classes: T[],
  showStartDate: string | undefined
): ClassWithTrial[] {
  const grouped: ClassWithTrial[] = [];

  showTrials.forEach(trial => {
    const trialClasses = (classes || []).filter(c => c.trialId === trial.id);

    trialClasses.forEach(classData => {
      grouped.push({
        classData: {
          ...classData,
          name: classData.className || 'Unnamed Class',
        },
        trial: {
          id: trial.id,
          name: trial.name || '',
          date: trial.trialDate || showStartDate || '',
        },
      });
    });
  });

  return grouped;
}

/**
 * Find a dog by ID from the dogs array.
 */
export function getDogById(dogs: Dog[], dogId: string): Dog | undefined {
  return dogs.find(d => d.id === dogId);
}

/**
 * Get the selection data for a specific dog, with a sensible default.
 */
export function getSelectionForDog(
  classSelections: ClassSelectionData[],
  dogId: string
): ClassSelectionData {
  return (
    classSelections.find(s => s.dogId === dogId) || {
      dogId,
      trialId: '',
      selectedClasses: [],
    }
  );
}

/**
 * Determine whether a class is selected (in cart or in local selection state).
 */
export function isClassSelected(
  dogId: string,
  classId: string,
  cartItems: CartItemWithDetails[],
  classSelections: ClassSelectionData[]
): boolean {
  const inCart = cartItems.some(item => item.dog_id === dogId && item.class_id === classId);
  const inSelection = getSelectionForDog(classSelections, dogId).selectedClasses.some(
    c => c.classId === classId
  );
  return inCart || inSelection;
}

/**
 * Get the entry fee for a class, falling back to the show-level default.
 */
export function getClassFee(
  show: ShowFeeInfo | undefined,
  classData: { entryFee?: number | undefined }
): number {
  return getShowEntryFee(show, classData.entryFee);
}

/**
 * Find a cart item matching a specific dog + class.
 */
export function findCartItem(
  cartItems: CartItemWithDetails[],
  dogId: string,
  classId: string
): CartItemWithDetails | undefined {
  return cartItems.find(item => item.dog_id === dogId && item.class_id === classId);
}

/**
 * Get all cart items for a specific dog.
 */
export function getCartItemsForDog(
  cartItems: CartItemWithDetails[],
  dogId: string
): CartItemWithDetails[] {
  return cartItems.filter(item => item.dog_id === dogId);
}

/**
 * Calculate total fees for a dog based on cart items.
 */
export function getTotalFeesForDog(cartItems: CartItemWithDetails[], dogId: string): number {
  return getCartItemsForDog(cartItems, dogId).reduce((total, item) => {
    return total + item.entry_fee_cents / 100;
  }, 0);
}

/**
 * Get count of cart items for a specific dog.
 */
export function getCartCountForDog(cartItems: CartItemWithDetails[], dogId: string): number {
  return getCartItemsForDog(cartItems, dogId).length;
}

/**
 * Build updated selections after adding a class.
 */
export function addClassToSelections(
  classSelections: ClassSelectionData[],
  dogId: string,
  trialId: string,
  classId: string
): ClassSelectionData[] {
  const current = getSelectionForDog(classSelections, dogId);
  const updated: ClassSelectionData = {
    ...current,
    trialId,
    selectedClasses: [
      ...current.selectedClasses,
      { classId, jumpHeight: undefined, moveUpRequested: false },
    ],
  };
  const filtered = classSelections.filter(s => s.dogId !== dogId);
  filtered.push(updated);
  return filtered;
}

/**
 * Build updated selections after removing a class.
 */
export function removeClassFromSelections(
  classSelections: ClassSelectionData[],
  dogId: string,
  classId: string
): ClassSelectionData[] {
  const current = getSelectionForDog(classSelections, dogId);
  const updated: ClassSelectionData = {
    ...current,
    selectedClasses: current.selectedClasses.filter(c => c.classId !== classId),
  };
  const filtered = classSelections.filter(s => s.dogId !== dogId);
  if (updated.selectedClasses.length > 0) {
    filtered.push(updated);
  }
  return filtered;
}

/**
 * Build updated selections after changing jump height.
 */
export function updateJumpHeightInSelections(
  classSelections: ClassSelectionData[],
  dogId: string,
  classId: string,
  jumpHeight: string
): ClassSelectionData[] {
  const current = getSelectionForDog(classSelections, dogId);
  const updated: ClassSelectionData = {
    ...current,
    selectedClasses: current.selectedClasses.map(c =>
      c.classId === classId ? { ...c, jumpHeight } : c
    ),
  };
  const filtered = classSelections.filter(s => s.dogId !== dogId);
  filtered.push(updated);
  return filtered;
}

/**
 * Build a display label for a class level+section combination.
 * Always shows section when present (AKC Scent Work: only Novice has A/B;
 * UKC Nose Work: every level has A/B).
 * Returns undefined for level-less elements (e.g., Detective).
 */
export function buildDisplayLabel(level: string, section: string | undefined): string | undefined {
  // "Unknown" is used for Detective-style classes that have no real level
  if (!level || level === 'Unknown') return undefined;
  return [level, section].filter(Boolean).join(' ');
}
