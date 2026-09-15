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
 *     cart row is left alone — which only holds if it reconciles against the
 *     RESTORED selections, so it waits a render for step 1's state to flush.
 *
 * The hook reports whether that restore has SETTLED (applied, or ruled out).
 * Anything else that wants to seed the wizard from outside — `?dogId=`'s
 * handoff (MYK9-519) — has to wait for it, or it reads the mount commit's
 * empty `selectedDogs` as fact and overwrites a draft that was about to land.
 */

import { useEffect, useRef, useState } from 'react';
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

/**
 * `pending` until the mount-time restore has been tried; then `applied` when a
 * draft was loaded into the wizard, or `skipped` when there was none to load.
 */
type RehydrateStatus = 'pending' | 'applied' | 'skipped';

export interface WizardDraftRehydration {
  /**
   * False only while a restore may still be about to write `selectedDogs` /
   * `classSelections`. Anything that seeds the wizard from outside must wait
   * for this before treating the current state as the exhibitor's own.
   */
  rehydrationSettled: boolean;
}

export function useWizardDraftRehydration(
  state: RegistrationWizardState,
  handlers: WizardHandlers
): WizardDraftRehydration {
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
  // State, not a ref, and that is load-bearing. `handleDraftLoaded` queues the
  // restored `classSelections` and `selectedDogs`; every consumer below runs
  // LATER IN THE SAME COMMIT, so a ref would let them read the pre-rehydrate
  // (empty) values as if they were the settled truth:
  //  - the reconcile would rebuild the selections from the cart alone and —
  //    being the second `setClassSelections` of the batch — win, dropping
  //    every draft line the cart no longer carries plus each line's jump height
  //    and move-up flag, the opposite of the Back path's additions-only merge;
  //  - `useEntryDogHandoff` would see `selectedDogs: []`, conclude no draft
  //    chose dogs, and replace the restored list with the one `?dogId=` names.
  // Flipping a state flag defers both to the next render, by which point the
  // draft's own updates have flushed.
  const [rehydrateStatus, setRehydrateStatus] = useState<RehydrateStatus>('pending');
  const didRehydrate = rehydrateStatus === 'applied';
  const hasReconciled = useRef(false);

  const cartItems = useCartItems();
  const cartShowId = useCartStore(s => s.cart?.show_id ?? null);
  const cartExhibitorId = useCartStore(s => s.cart?.exhibitor_id ?? null);
  const cartIsLoading = useCartStore(s => s.isLoading);

  useEffect(() => {
    if (attemptedRehydrate.current) return;
    if (!eligible) {
      // `isInsideSidebar` comes from the URL, so a staff surface is decided on
      // the very first render and can settle now. A missing `userId` is NOT
      // decisive — auth resolves a tick later — so that case stays pending
      // rather than telling a waiting consumer there is no draft coming.
      if (isInsideSidebar) setRehydrateStatus('skipped');
      return;
    }
    // One attempt per mount, whatever the outcome: `availableDrafts` is read
    // synchronously from localStorage on the first render, so a miss here is a
    // real absence rather than a not-loaded-yet.
    attemptedRehydrate.current = true;

    const attempt = (): boolean => {
      if (!hasWizardSession(showId, userId)) return false;
      // Live state already survived (a client-side route change rather than a
      // document reload). Restoring over it would undo whatever came after the
      // last save.
      if (registrationData.selectedDogs.length > 0) return false;

      const candidate = pickRehydratableDraft(availableDrafts);
      if (!candidate) return false;
      const draft = draftLoad(candidate.id);
      if (!draft) return false;
      // Silent: the exhibitor never left, so "Draft loaded successfully" would
      // be news about something they did not do.
      return handlers.handleDraftLoaded(draft, { silent: true }) !== false;
    };

    setRehydrateStatus(attempt() ? 'applied' : 'skipped');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, isInsideSidebar, showId, userId]);

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
    if (!didRehydrate) return;
    if (cartIsLoading) return;
    // The global cart may still hold the PREVIOUS show's rows while this
    // show's cart loads; reconciling against those would copy the wrong show's
    // classes in and burn the one-shot latch.
    if (cartShowId !== showId) return;
    if (exhibitorProfile?.id && cartExhibitorId !== exhibitorProfile.id) return;
    if (cartItems.length === 0) return;

    const reconstructed = reconcileCartToSelections(cartItems, classSelections);
    // Latch only on a reconcile that actually produced something, exactly as
    // `ClassSelectionStep`'s Back path does — the two are now the same rule.
    // A null result means the cart added nothing the selections did not already
    // have; burning the one-shot on it would silently skip the real reconcile
    // when the next cart row arrives a tick later.
    if (!reconstructed) return;
    hasReconciled.current = true;
    handlers.handleClassSelectionChange(reconstructed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    didRehydrate,
    cartItems,
    classSelections,
    cartIsLoading,
    cartShowId,
    cartExhibitorId,
    showId,
    exhibitorProfile?.id,
  ]);

  return { rehydrationSettled: rehydrateStatus !== 'pending' };
}
