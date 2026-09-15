import type { ClassSelectionData } from '@/types/show-registration-types';
import type { Dog } from '@/types/dog-types';
import type { CartItemWithDetails, NewCartItem } from '@/store/cartStore';
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

interface ToggleClassSelectionOptions {
  useCartFlow: boolean;
  cartItems: CartItemWithDetails[];
  classSelections: ClassSelectionData[];
  dogId: string;
  trialId: string;
  classId: string;
  entryFee: number;
  onSelectionChange: (selections: ClassSelectionData[]) => void;
  addItem: (item: NewCartItem) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  setAddingItem: (itemKey: string | null) => void;
  /**
   * Live read of whether an add is already in flight. A getter, not a value:
   * two clicks landing in the same React batch both close over the same stale
   * render-time value, so only a read at call time can see the first click's
   * write (MYK9-530).
   */
  isAddInFlight: () => boolean;
  /**
   * Whether the cart being mutated is this show's and this exhibitor's, and has
   * finished loading (`isCartReady`). The chips are rendered disabled while it
   * is false; this is the second half of that guard, for a click that lands
   * anyway (MYK9-542).
   */
  isCartReady: boolean;
  /** Called once per click that the readiness gate turned away. */
  onBlockedByCart: () => void;
  notifyAdded: () => void;
  notifyError: (message: string) => void;
}

export async function toggleClassSelection({
  useCartFlow,
  cartItems,
  classSelections,
  dogId,
  trialId,
  classId,
  entryFee,
  onSelectionChange,
  addItem,
  removeItem,
  setAddingItem,
  isAddInFlight,
  isCartReady,
  onBlockedByCart,
  notifyAdded,
  notifyError,
}: ToggleClassSelectionOptions): Promise<void> {
  const cartItem = findCartItem(cartItems, dogId, classId);
  const isSelected = isClassSelected(dogId, classId, cartItems, classSelections);

  if (!useCartFlow) {
    onSelectionChange(
      isSelected
        ? removeClassFromSelections(classSelections, dogId, classId)
        : addClassToSelections(classSelections, dogId, trialId, classId)
    );
    return;
  }

  // Nothing may be computed against a cart that is still loading, or that is
  // still the previous show's -- see `isCartReady` for what each branch does
  // wrong in that window. The chips render disabled meanwhile, so this is the
  // keyboard/race path rather than the ordinary one (MYK9-542).
  if (!isCartReady) {
    onBlockedByCart();
    return;
  }

  // Ignore every cart click while an add is still in flight. The whole cart
  // flow is blocked, not just a repeat of the same chip: `addItem` computes the
  // new item list from the cart it read on entry, so a second mutation started
  // mid-add would be computed against a list that is about to be replaced.
  if (isAddInFlight()) return;

  // Branch on the SAME predicate the chip renders from (`isClassSelected`),
  // not on `cartItem` alone. A pair present in `classSelections` but missing
  // from the locally-held cart list renders checked, and branching on the cart
  // row sent that click down the ADD path, where the bare insert died on
  // `entry_cart_items_unique_dog_class_idx` (23505) -- MYK9-530.
  if (isSelected) {
    if (cartItem) {
      // Hold the same in-flight flag the add path holds: a remove and an add
      // that overlap both compute their new item list from the cart they read
      // on entry, so whichever `set` lands second silently drops the other's
      // row from the local list -- the same divergence this fix exists to
      // close. `finally`, so a rejected mutation cannot wedge the step with a
      // flag that is never cleared (MYK9-530 review).
      setAddingItem(`${dogId}-${classId}`);
      let removed: boolean;
      try {
        removed = await removeItem(cartItem.id);
      } finally {
        setAddingItem(null);
      }
      if (!removed) {
        notifyError('Failed to remove from cart');
        return;
      }
    }
    // No local cart row to delete: deselecting is the whole job here. Any DB
    // row the local list had lost is reconciled back on the next cart load
    // (`reconcileCartToSelections`), and `addItem` now tolerates it besides.
    onSelectionChange(removeClassFromSelections(classSelections, dogId, classId));
    return;
  }

  setAddingItem(`${dogId}-${classId}`);
  let added: boolean;
  try {
    added = await addItem({ dogId, classId, entryFeeCents: entryFee * 100 });
  } finally {
    setAddingItem(null);
  }
  if (!added) {
    notifyError('Failed to add to cart');
    return;
  }
  notifyAdded();
  onSelectionChange(addClassToSelections(classSelections, dogId, trialId, classId));
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
 *
 * `extra` distinguishes two classes that share an element and a level with no
 * section between them — the Heartland Saturday trial runs both "Interior
 * Advanced" and "Interior Advanced Preliminary". Without it both chips read
 * "Advanced" and choosing between them is a coin flip at $30 a class
 * (MYK9-489).
 *
 * The caller computes it with `buildClassDisambiguator`, the same rule the
 * public premium uses, so the two surfaces cannot drift — and so it stays ''
 * for every class that has no twin. Passing raw name text here unconditionally
 * publishes this project's fixture names ("Advanced Load 2 Class 1") to
 * exhibitors; the collision gate is what prevents that.
 */
export function buildDisplayLabel(
  level: string,
  section: string | undefined,
  extra?: string
): string | undefined {
  // "Unknown" is used for Detective-style classes that have no real level
  if (!level || level === 'Unknown') return undefined;
  return [level, section, extra].filter(Boolean).join(' ');
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
