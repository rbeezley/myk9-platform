/**
 * "Choose classes again" — the way back from an expired cart.
 *
 * Navigation alone is not enough, and neither is clearing the selections. Three
 * pieces of wizard state outlive an expired cart, and each one is a defect:
 *
 *  - `classSelections` are local React state, so the class step would show the
 *    stale picks over a cart that no longer has their rows. `toggleClassSelection`
 *    reads a local selection with no cart row as an ADD, so the next replacement
 *    cart takes a second copy of every class — duplicate entries.
 *  - `stepCompletionState` still marks class-selection AND payment complete, so
 *    the rail lets the exhibitor walk straight back to Payment and Submit.
 *  - `currentStep` is still Payment, whose Submit control commits an entry whose
 *    classes were just cleared — an empty enrollment.
 *
 * So the reset is one SYNCHRONOUS block covering all three, and it runs to
 * completion before anything touches the network. The cart release is fired
 * afterwards and deliberately not awaited: nothing downstream depends on its
 * result, and awaiting it was the window in which Payment stayed live and
 * submittable.
 *
 * `setCurrentStep` directly rather than the rail's `handleStepClick`: that
 * helper refuses a step the exhibitor has not "reached", which is judged from
 * the very completion state being cleared here on purpose.
 *
 * The release is conditional on the cart actually being this registration's.
 * `useCartStore` is a singleton, so a wizard opened before this show's cart has
 * loaded can find a previous show's expired cart in it — abandoning that would
 * discard a cart this wizard never owned. The reset is correct either way.
 */

import type { ClassSelectionData } from '@/types/show-registration-types';

export interface StartOverDeps {
  /**
   * Whether the singleton cart store is holding THIS registration's cart.
   * False for no cart at all, and false for a previous show's leftover — which
   * must not be abandoned here; it is not this wizard's to throw away.
   */
  cartBelongsToThisRegistration: boolean;
  /** Index of `class-selection` in the ACTIVE workflow; -1 if it has no such step. */
  classStepIndex: number;
  abandonCart: () => Promise<boolean>;
  setClassSelections: (selections: ClassSelectionData[]) => void;
  setStepCompletionState: (completion: Record<string, boolean>) => void;
  setCurrentStep: (step: number) => void;
}

export function startOverAtClassSelection({
  cartBelongsToThisRegistration,
  classStepIndex,
  abandonCart,
  setClassSelections,
  setStepCompletionState,
  setCurrentStep,
}: StartOverDeps): void {
  // A workflow with no class step has nowhere to send them; do nothing at all
  // rather than half-clear an entry the exhibitor cannot rebuild.
  if (classStepIndex < 0) return;

  // One synchronous reset. React batches these into a single render, so there
  // is no frame in which the entry is empty but Payment is still live.
  setClassSelections([]);
  setStepCompletionState({});
  setCurrentStep(classStepIndex);

  // Fire and forget. The cart is already expired server-side; failing to mark
  // it abandoned must not block, or strand, the exhibitor.
  if (cartBelongsToThisRegistration) {
    void abandonCart().catch(() => {});
  }
}
