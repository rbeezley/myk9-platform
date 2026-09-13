/**
 * "Choose classes again" — the way back from an expired cart.
 *
 * Navigation alone is not enough. An expired cart is gone server-side, but the
 * wizard's own `classSelections` are local React state that survives it, so
 * landing back on the class step would show the stale picks over a cart that no
 * longer has their rows. `toggleClassSelection` reads a local selection with no
 * cart row as an ADD, so the next replacement cart would take a second copy of
 * every class — duplicate entries on the money path.
 *
 * So: drop the selections, release the dead cart, and only then navigate. Both
 * steps use the paths that already exist (`setClassSelections` from the wizard
 * state, `abandonCart` from the cart store); nothing new is written here.
 */

import type { ClassSelectionData } from '@/types/show-registration-types';

export interface StartOverDeps {
  /** Whether the store is holding a cart at all — no cart, nothing to release. */
  hasCart: boolean;
  /** Index of `class-selection` in the ACTIVE workflow; -1 if it has no such step. */
  classStepIndex: number;
  abandonCart: () => Promise<boolean>;
  setClassSelections: (selections: ClassSelectionData[]) => void;
  goToStep: (step: number) => void;
}

export async function startOverAtClassSelection({
  hasCart,
  classStepIndex,
  abandonCart,
  setClassSelections,
  goToStep,
}: StartOverDeps): Promise<void> {
  // A workflow with no class step has nowhere to send them; do nothing at all
  // rather than half-clear an entry the exhibitor cannot rebuild.
  if (classStepIndex < 0) return;

  setClassSelections([]);

  if (hasCart) {
    try {
      await abandonCart();
    } catch {
      // The cart is already expired; failing to mark it abandoned must not
      // strand the exhibitor on a dead payment step. The local selections are
      // cleared either way, so nothing can be double-added.
    }
  }

  goToStep(classStepIndex);
}
