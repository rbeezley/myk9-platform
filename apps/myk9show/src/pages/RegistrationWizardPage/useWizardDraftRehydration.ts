/**
 * Rehydrate the wizard from its own saved draft on mount (MYK9-514, MYK9-509).
 *
 * The wizard's selections are React state, so a reload rebuilt them from
 * nothing while the cart still held the fees — and the return from a cancelled
 * Stripe checkout landed on that same empty wizard. The draft
 * `useDraftPersistence` already writes (30s tick, `pagehide`, unmount) IS the
 * persisted wizard state; this hook is the missing read side. There is no
 * second store.
 *
 * Three effects, in the order they matter:
 *
 *  1. Restore, once, when a same-tab marker says this sitting was already in
 *     progress. `wizardDraftSession` owns that rule and the reasoning behind
 *     it; a fresh visit still gets MYK9-508's explicit Resume panel instead.
 *  2. Keep the marker in step with the wizard — set while there is something
 *     worth coming back to, cleared once the entry is confirmed.
 *  3. Reconcile the cart into the restored selections exactly once, using the
 *     same `reconcileCartToSelections` the Back path runs when the class step
 *     remounts. Rehydrating straight onto Payment never mounts that step, so
 *     without this a cart row added elsewhere would be invisible until Back.
 *     Like the Back path, it only merges cart rows IN; a selection with no
 *     cart row is left alone.
 */

import { useEffect, useRef } from 'react';
import { useCartStore, useCartItems } from '@/store/cartStore';
import { reconcileCartToSelections } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.helpers';
import {
  clearWizardSession,
  hasWizardSession,
  markWizardSessionOpen,
  pickRehydratableDraft,
} from '@/hooks/wizardDraftSession';
import type { RegistrationWizardState } from './useRegistrationWizardState';
import type { createWizardHandlers } from './wizardHandlers';

type WizardHandlers = ReturnType<typeof createWizardHandlers>;

export function useWizardDraftRehydration(
  state: RegistrationWizardState,
  handlers: WizardHandlers
): void {
  const {
    showId,
    userId,
    isInsideSidebar,
    availableDrafts,
    draftLoad,
    currentStepId,
    registrationData,
    classSelections,
    exhibitorProfile,
  } = state;

  // Self-service only. The on-behalf surfaces are a staff workstation where a
  // silently restored entry would belong to whoever sat there last; they keep
  // the explicit draft list. `isInsideSidebar` comes from the URL, so unlike
  // `currentWorkflowMode` it does not flip once RBAC resolves.
  const eligible = !isInsideSidebar && !!userId && userId !== 'anonymous';

  const attemptedRehydrate = useRef(false);
  const didRehydrate = useRef(false);
  const hasReconciled = useRef(false);

  const cartItems = useCartItems();
  const cartShowId = useCartStore(s => s.cart?.show_id ?? null);
  const cartExhibitorId = useCartStore(s => s.cart?.exhibitor_id ?? null);
  const cartIsLoading = useCartStore(s => s.isLoading);

  useEffect(() => {
    if (attemptedRehydrate.current) return;
    if (!eligible) return;
    // One attempt per mount, whatever the outcome: `availableDrafts` is read
    // synchronously from localStorage on the first render, so a miss here is a
    // real absence rather than a not-loaded-yet.
    attemptedRehydrate.current = true;
    if (!hasWizardSession(showId, userId)) return;
    // Live state already survived (a client-side route change rather than a
    // document reload). Restoring over it would undo whatever came after the
    // last save.
    if (registrationData.selectedDogs.length > 0) return;

    const candidate = pickRehydratableDraft(availableDrafts);
    if (!candidate) return;
    const draft = draftLoad(candidate.id);
    if (!draft) return;
    // Silent: the exhibitor never left, so "Draft loaded successfully" would be
    // news about something they did not do.
    if (handlers.handleDraftLoaded(draft, { silent: true }) === false) return;
    didRehydrate.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, showId, userId]);

  useEffect(() => {
    if (!eligible) return;
    if (currentStepId === 'confirmation') {
      clearWizardSession(showId, userId);
      return;
    }
    if (registrationData.selectedDogs.length > 0) markWizardSessionOpen(showId, userId);
  }, [eligible, showId, userId, currentStepId, registrationData.selectedDogs.length]);

  useEffect(() => {
    if (hasReconciled.current) return;
    if (!didRehydrate.current) return;
    if (cartIsLoading) return;
    // The global cart may still hold the PREVIOUS show's rows while this
    // show's cart loads; reconciling against those would copy the wrong show's
    // classes in and burn the one-shot latch.
    if (cartShowId !== showId) return;
    if (exhibitorProfile?.id && cartExhibitorId !== exhibitorProfile.id) return;
    if (cartItems.length === 0) return;

    const reconstructed = reconcileCartToSelections(cartItems, classSelections);
    hasReconciled.current = true;
    if (!reconstructed) return;
    handlers.handleClassSelectionChange(reconstructed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cartItems,
    classSelections,
    cartIsLoading,
    cartShowId,
    cartExhibitorId,
    showId,
    exhibitorProfile?.id,
  ]);
}
