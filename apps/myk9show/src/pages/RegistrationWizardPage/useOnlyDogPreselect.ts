/**
 * useOnlyDogPreselect — ticks an exhibitor's only dog for her (MYK9-1795,
 * choice-audit A4). The tick is a real selection but is marked as untouched
 * (`useAutoTickMarker`), so a passive look at the form drafts nothing.
 *
 * Applies at most once per mount, so an untick is never re-applied. Waits for
 * the same gates as the `?dogId=` handoff, and stands down for a `?dogId=`
 * link, a workflow without the exhibitor dog step, a closed entry window and a
 * saved entry waiting to be resumed.
 */

import { useEffect, useRef } from 'react';
import type { Dog } from '@/types/dog-types';
import { resolveOnlyDogPreselect, useEntryDogId } from '@/features/registration/entryDogContext';
import {
  getDogEligibilityStatus,
  isDogSelectable,
} from '@/components/shows/RegistrationWorkflow/DogSelectionStepEnhanced.helpers';

export interface OnlyDogPreselectOptions {
  dogs: Dog[];
  dogsReady: boolean;
  registrationData: { selectedDogs: string[] };
  currentWorkflowMode: string;
  rehydrationSettled: boolean;
  currentWorkflowConfig: { steps: readonly string[] };
  entryCloseAvailability: { canEnter: boolean };
  availableDrafts: { selectedDogsCount?: number; completed?: boolean }[];
  handleDogSelectionChange: (dogIds: string[]) => void;
  markAutoTick: (dogId: string) => void;
}

export function useOnlyDogPreselect(options: OnlyDogPreselectOptions): void {
  const {
    dogs,
    dogsReady,
    registrationData,
    currentWorkflowMode,
    rehydrationSettled,
    currentWorkflowConfig,
    entryCloseAvailability,
    availableDrafts = [],
    handleDogSelectionChange,
    markAutoTick,
  } = options;
  const entryDogId = useEntryDogId();
  const appliedRef = useRef(false);
  const eligible =
    currentWorkflowMode === 'exhibitor' &&
    currentWorkflowConfig.steps.includes('dog-selection') &&
    entryCloseAvailability.canEnter;

  useEffect(() => {
    if (appliedRef.current || !eligible || !dogsReady || !rehydrationSettled) return;
    appliedRef.current = true;
    const dogId = resolveOnlyDogPreselect({
      entryDogId,
      accessibleDogs: dogs.filter(isDogSelectable),
      selectedDogs: registrationData.selectedDogs,
      hasResumableDraft: availableDrafts.some(
        draft => (draft.selectedDogsCount ?? 0) > 0 && !draft.completed
      ),
      eligibility: getDogEligibilityStatus,
    });
    if (!dogId) return;
    handleDogSelectionChange([dogId]);
    markAutoTick(dogId);
  }, [
    eligible,
    dogsReady,
    rehydrationSettled,
    entryDogId,
    dogs,
    registrationData.selectedDogs,
    availableDrafts,
    handleDogSelectionChange,
    markAutoTick,
  ]);
}
