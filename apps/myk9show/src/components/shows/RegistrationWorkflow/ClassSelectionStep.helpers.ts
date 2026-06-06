import type { ClassSelectionData } from '@/types/show-registration-types';
import type { Dog } from '@/types/dog-types';
import type { CartItemWithDetails } from '@/store/cartStore';
import { getShowEntryFee, type ShowFeeInfo } from './PaymentStep/utils';

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
function makeClassSelection(classId: string) {
  return { classId, jumpHeight: undefined as string | undefined, moveUpRequested: false };
}

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
    selectedClasses: [...current.selectedClasses, makeClassSelection(classId)],
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

/**
 * Reconcile wizard-level classSelections from loaded cart items.
 *
 * Returns an updated ClassSelectionData[] merging any cart items not yet
 * reflected in classSelections (i.e. returning to the form in a new session
 * where the Supabase cart persisted but wizard state was reset). Returns null
 * when already in sync — caller should skip calling onSelectionChange.
 *
 * Uses composite dog+class keys so that two dogs entering the same class are
 * each correctly detected as unsynced rather than masking each other.
 */
export function reconcileCartToSelections(
  cartItems: CartItemWithDetails[],
  classSelections: ClassSelectionData[]
): ClassSelectionData[] | null {
  const existingPairs = new Set(
    classSelections.flatMap(s => s.selectedClasses.map(c => `${s.dogId}:${c.classId}`))
  );

  // Single pass: collect only the dog+class pairs missing from wizard state.
  const additions = new Map<string, { trialId: string; classIds: string[] }>();
  for (const item of cartItems) {
    if (!item.dog_id || !item.class_id) continue;
    if (existingPairs.has(`${item.dog_id}:${item.class_id}`)) continue;
    const trialId = item.class?.trial_id ?? '';
    const entry = additions.get(item.dog_id);
    if (entry) {
      entry.classIds.push(item.class_id);
    } else {
      additions.set(item.dog_id, { trialId, classIds: [item.class_id] });
    }
  }

  if (additions.size === 0) return null;

  // Merge additions into a copy of existing selections (preserves draft metadata
  // such as jump heights on classes that were already present).
  const result = classSelections.map(s => ({ ...s, selectedClasses: [...s.selectedClasses] }));
  for (const [dogId, data] of additions) {
    const existing = result.find(s => s.dogId === dogId);
    if (existing) {
      existing.selectedClasses.push(...data.classIds.map(makeClassSelection));
    } else {
      result.push({
        dogId,
        trialId: data.trialId,
        selectedClasses: data.classIds.map(makeClassSelection),
      });
    }
  }
  return result;
}
