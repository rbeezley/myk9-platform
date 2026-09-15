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
    if (!dogsReady) return;

    appliedRef.current = true;

    const handoff = resolveEntryDogHandoff({
      dogId,
      // The roster is already scoped to what this user may enter; narrow it
      // only by what the picker itself would hide.
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
    dogs,
    registrationData,
    handleDogSelectionChange,
  ]);
}
