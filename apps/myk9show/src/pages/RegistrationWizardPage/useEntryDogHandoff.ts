/**
 * useEntryDogHandoff — honors the `?dogId=` context Dog Details started with.
 *
 * The exhibitor pressed "Enter a show" beside one dog, browsed to a show, and
 * arrived here. Preselect that dog through the dog step's OWN public handler so
 * the cart, the fee math and the draft all see an ordinary selection; nothing
 * here writes wizard state directly (MYK9-519).
 *
 * Pinned context rules:
 *  - The param stays in the URL, so a refresh or a copied link repeats the
 *    same handoff rather than silently losing it.
 *  - It applies at most once per mount, so Back/Forward into a cart the
 *    exhibitor has since edited never re-adds the dog.
 *  - A draft/resume that already chose dogs wins; the param is dropped.
 *  - A dog that is missing, deleted, not theirs or ineligible is never
 *    substituted — the step falls back to normal selection with a toast.
 *  - A show whose entry window is shut renders the closed panel instead of the
 *    dog step, so there is nothing to preselect into and no list the fallback
 *    toast could send the exhibitor to. Nothing runs at all there.
 */

import { useEffect, useRef } from 'react';
import type { Dog } from '@/types/dog-types';
import { notifications } from '@/lib/notifications';
import {
  entryDogHandoffMessage,
  resolveEntryDogHandoff,
  useEntryDogId,
} from '@/features/registration/entryDogContext';
import {
  getDogEligibilityStatus,
  isDogSelectable,
} from '@/components/shows/RegistrationWorkflow/DogSelectionStepEnhanced.helpers';

/** Stable sonner id so a remount cannot stack duplicate explanations. */
const HANDOFF_TOAST_ID = 'registration-entry-dog-handoff';

export interface EntryDogHandoffOptions {
  /** The wizard's dog roster (unfiltered — this hook applies the picker's own filter). */
  dogs: Dog[];
  /** Roster has finished loading; before this a "not found" would be a lie. */
  dogsReady: boolean;
  /** Current cart, so a resumed draft can win over the param. */
  registrationData: { selectedDogs: string[] };
  /** Only the exhibitor self-service flow carries this context. */
  currentWorkflowMode: string;
  /** Skip entirely when the workflow has no dog step to preselect into. */
  currentWorkflowConfig: { steps: readonly string[] };
  /** The wizard renders the closed/not-yet-open panel instead of any step. */
  entryCloseAvailability: { canEnter: boolean };
  /** The dog step's public selection handler. */
  handleDogSelectionChange: (dogIds: string[]) => void;
}

export function useEntryDogHandoff(options: EntryDogHandoffOptions): void {
  const {
    dogs,
    dogsReady,
    registrationData,
    currentWorkflowMode,
    currentWorkflowConfig,
    entryCloseAvailability,
    handleDogSelectionChange,
  } = options;
  const isExhibitorFlow = currentWorkflowMode === 'exhibitor';
  const hasDogSelectionStep = currentWorkflowConfig.steps.includes('dog-selection');
  const dogId = useEntryDogId();
  const appliedRef = useRef(false);

  // Every guard is re-checked on each run, but `appliedRef` makes the body a
  // one-shot: the extra renders this effect sees (fresh handler identities,
  // cart edits) must never re-add a dog the exhibitor has since removed.
  useEffect(() => {
    if (appliedRef.current) return;
    if (!dogId || !isExhibitorFlow || !hasDogSelectionStep) return;
    // Not consumed: the window can open while the page is up, and until it
    // does there is no dog step behind this panel to select into.
    if (!entryCloseAvailability.canEnter) return;
    if (!dogsReady) return;

    appliedRef.current = true;

    const handoff = resolveEntryDogHandoff({
      dogId,
      // Exactly the list `DogSelectionStep` renders: the same roster
      // (`useDogStoreCompat`, own dogs only unless the viewer holds a
      // full-roster staff role — `rosterIsOwnDogsOnly`) narrowed by the same
      // deleted/inactive rule. The handoff can therefore never select a dog
      // the picker would not have offered on this same page.
      accessibleDogs: dogs.filter(isDogSelectable),
      selectedDogs: registrationData.selectedDogs,
      eligibility: getDogEligibilityStatus,
    });

    if (handoff.status === 'applied') {
      handleDogSelectionChange(handoff.dogIds);
      return;
    }

    const message = entryDogHandoffMessage(handoff);
    if (message) notifications.warning(message, { id: HANDOFF_TOAST_ID });
  }, [
    dogId,
    dogsReady,
    isExhibitorFlow,
    hasDogSelectionStep,
    entryCloseAvailability.canEnter,
    dogs,
    registrationData,
    handleDogSelectionChange,
  ]);
}
