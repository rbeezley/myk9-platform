/**
 * useRegistrationWizard — composes the wizard's state and behavior.
 *
 * `useRegistrationWizardState` owns all state, refs, stores, and the effects
 * that don't call handlers. `createWizardHandlers` builds the action handlers
 * over that state. The one effect that bridges the two — auto-selecting all
 * dogs when there's no dog-selection step, which calls `handleDogSelectionChange`
 * — lives here so it can see both halves.
 *
 * The page component renders against this hook's merged return.
 */

import { useEffect } from 'react';
import { useRegistrationWizardState } from './useRegistrationWizardState';
import { createWizardHandlers } from './wizardHandlers';

export function useRegistrationWizard() {
  const state = useRegistrationWizardState();
  const handlers = createWizardHandlers(state);

  const {
    dogs,
    dogsLoading,
    dogsReady,
    currentWorkflowConfig,
    registrationData,
    hasAutoSelectedDogs,
    pendingDraftRegistrationRef,
  } = state;

  useEffect(() => {
    if (!dogsReady || !pendingDraftRegistrationRef.current) return;
    pendingDraftRegistrationRef.current = false;
    if (registrationData.selectedDogs.length > 0) {
      void handlers.handleDogSelectionChange(registrationData.selectedDogs);
    }
    // The pending flag is set only by a draft load that preceded the roster.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dogsReady, registrationData.selectedDogs]);

  // Auto-select all dogs when dog-selection step is not in the workflow (exhibitor
  // flow). Runs once after dogs load; draft loading restores selectedDogs so
  // hasAutoSelectedDogs prevents re-triggering.
  useEffect(() => {
    if (hasAutoSelectedDogs.current) return;
    if (dogsLoading) return;
    if (currentWorkflowConfig.steps.includes('dog-selection')) return;
    if (registrationData.selectedDogs.length > 0) return;
    if (dogs.length === 0) return;

    hasAutoSelectedDogs.current = true;
    const allDogIds = dogs.map(d => d.id);
    handlers.handleDogSelectionChange(allDogIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dogsLoading, dogs, currentWorkflowConfig.steps, registrationData.selectedDogs.length]);

  return { ...state, ...handlers };
}
