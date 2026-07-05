/**
 * createWizardHandlers — the behavior half of the registration wizard.
 *
 * Pure factory (not a hook): given the state hook's return value, it builds the
 * action handlers that close over those setters/refs. Keeping them here rather
 * than inline in the hook keeps both files under the 500-line ceiling and puts
 * all of the "what happens when the user clicks" logic in one place.
 *
 * Submission behavior (`submitPaymentStep`, last-step navigation) is deliberately
 * left identical to the pre-refactor page — only its location changed.
 */

import { notifications } from '@/lib/notifications';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import {
  PaymentStatus,
  EntryStatus,
  type ClassSelectionData,
  type HandlerInfo,
  type PaymentMethod,
  type PaymentDetails,
} from '@/types/show-registration-types';
import type { StepId } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import { selectedDogsOwner } from '@/features/registration/selectedDogsOwner';
import { resolveRegistrationCompletionPath } from '../RegistrationWizardPage.routes';
import { submitPaymentStep } from './submitPaymentStep';
import type { RegistrationWizardState } from './useRegistrationWizardState';
import type { SavedDraft } from '@/hooks/useDraftPersistence';

export function createWizardHandlers(state: RegistrationWizardState) {
  const {
    showId,
    userId,
    navigate,
    isLateEntryMode,
    exitTarget,
    canAssignArmbands,
    exhibitorProfile,
    triggerSync,
    dogs,
    classes,
    currentShow,
    loadCart,
    clearCart,
    createCart,
    addItem,
    abandonCart,
    createRegistration,
    submitRegistration,
    confirmRegistration,
    currentRegistration,
    updateShowRegistration,
    storeUpdatePaymentStatus,
    storeUpdateEntryStatus,
    currentWorkflowMode,
    currentWorkflowConfig,
    currentStep,
    setCurrentStep,
    setStepCompletionState,
    registrationData,
    setRegistrationData,
    setClassSelections,
    setHandlerAssignments,
    registrationId,
    setRegistrationId,
    setRegistrationNumber,
    isCreatingRegistration,
    setIsCreatingRegistration,
    setPaymentStatus,
    setEntryStatus,
    setArmbandAssignments,
    paymentDetailsRef,
    setIsSubmitting,
    setAgreedToEntryAgreement,
    submittingRef,
    mountedRef,
    discardDraftsWithoutFinalSave,
    clearDraftData,
    currentStepId,
    completedSteps,
    ownerResolution,
    canProceed,
    isLastStep,
    isStepCompleted,
    markStepComplete,
  } = state;

  // Navigation handlers
  const handleExit = () => {
    // Destination + label come from one resolver (resolveRegistrationExit) so
    // the button copy can never claim a place the navigation doesn't go.
    if (exitTarget.path) {
      navigate(exitTarget.path);
      return;
    }
    navigate(-1);
  };

  const handleNext = async () => {
    if (submittingRef.current || !canProceed()) return;

    // On the last step, complete registration and navigate away
    if (isLastStep) {
      markStepComplete(currentStep);
      notifications.success(
        isLateEntryMode
          ? 'Late entry completed successfully'
          : 'Registration completed successfully'
      );
      navigate(resolveRegistrationCompletionPath(showId, isLateEntryMode));
      return;
    }

    if (currentStepId === 'payment' && registrationId && currentRegistration) {
      if (!currentShow) {
        notifications.error('Show not found. Please go back and try again.');
        return;
      }
      // submittingRef is the in-flight guard read at the top of handleNext;
      // it's owned here so it resets on every path. setIsSubmitting (the
      // mounted-gated spinner flag) is owned by submitPaymentStep.
      submittingRef.current = true;
      try {
        await submitPaymentStep({
          showId,
          userId,
          registrationId,
          previousStatus: currentRegistration.status,
          currentWorkflowMode,
          paymentMethod: registrationData.paymentMethod,
          paymentDetails: paymentDetailsRef.current,
          ownerResolution,
          exhibitorProfileId: exhibitorProfile?.id ?? '',
          classSelections: state.classSelections,
          handlerAssignments: state.handlerAssignments,
          classes,
          canAssignArmbands,
          showFeeInfo: {
            preEntryFee: currentShow.preEntryFee || '0',
            dayOfShowFee: currentShow.dayOfShowFee,
            startDate: currentShow.startDate,
          },
          currentStep,
          cart: { loadCart, clearCart, createCart, addItem, abandonCart },
          submitRegistration,
          confirmRegistration,
          isMounted: () => mountedRef.current,
          setIsSubmitting,
          setRegistrationNumber,
          setArmbandAssignments,
          markStepComplete,
          setCurrentStep,
          updateShowRegistration: (id, updates) => updateShowRegistration(id, updates),
          triggerSync,
          navigate: path => navigate(path),
          discardDraftsWithoutFinalSave,
          clearDraftData,
        });
      } finally {
        submittingRef.current = false;
      }
      return;
    }

    markStepComplete(currentStep);
    setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (currentStepId === 'payment') {
      setAgreedToEntryAgreement(false);
    }
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    } else {
      handleExit();
    }
  };

  // Dog selection handler
  const handleDogSelectionChange = async (selectedDogs: string[]) => {
    setRegistrationData(prev => ({ ...prev, selectedDogs }));

    if (selectedDogs.length === 0 || isCreatingRegistration) {
      return;
    }

    // Defer registration creation until we have a single, resolvable owner.
    // selectedDogsOwner handles the empty case; here we additionally bail
    // when the cart spans multiple owners (canProceed will surface the error).
    const owner = selectedDogsOwner(dogs, selectedDogs);
    if (!owner.ok) return;

    // Owner-change guard: if the user replaces their selection with a
    // different exhibitor's dog(s), the existing registration's handlerId is
    // now stale. Reset it so a fresh registration is created under the new
    // owner. Without this, submission would file the entry under the PREVIOUS
    // exhibitor — silently re-introducing the wrong-attribution bug.
    if (registrationId) {
      const existing = useShowRegistrationStore.getState().getRegistration(registrationId);
      if (existing && existing.handlerId !== owner.ownerId) {
        setRegistrationId(undefined);
      } else {
        return;
      }
    }

    setIsCreatingRegistration(true);
    const reg = createRegistration(showId || '', userId, owner.ownerId);
    setRegistrationId(reg.id);
    setIsCreatingRegistration(false);
  };

  // Class selection handler
  const handleClassSelectionChange = (selections: ClassSelectionData[]) => {
    setClassSelections(selections);
  };

  // Handler assignment handler
  const handleHandlerAssignmentChange = (assignments: Record<string, HandlerInfo>) => {
    setHandlerAssignments(assignments);
  };

  // Draft loading handler
  const handleDraftLoaded = (draft: SavedDraft) => {
    if (draft.data._workflowState) {
      const workflowState = draft.data._workflowState;
      setStepCompletionState(workflowState.stepCompletionState || {});
      setClassSelections(workflowState.classSelections || []);
      setHandlerAssignments(workflowState.handlerAssignments || {});
      setPaymentStatus(workflowState.paymentStatus || PaymentStatus.PENDING);
      setEntryStatus(workflowState.entryStatus || EntryStatus.PENDING);

      // Map steps that may have been removed from the current workflow config
      let targetStep = workflowState.currentStep;
      if (!currentWorkflowConfig.steps.includes(targetStep as StepId)) {
        targetStep = 'class-selection';
      }
      const stepIndex = currentWorkflowConfig.steps.findIndex(s => s === targetStep);
      if (stepIndex >= 0) {
        setCurrentStep(stepIndex);
      }
    }

    setRegistrationData({
      selectedDogs: draft.data.selectedDogs || [],
      entries: draft.data.entries || [],
      documents: draft.data.documents || [],
      paymentMethod: draft.data.paymentMethod,
      specialRequests: draft.data.specialRequests,
    });

    if (!registrationId && (draft.data.selectedDogs?.length ?? 0) > 0) {
      // createRegistration is synchronous — returns the new local registration directly.
      // Resolve the loaded selection's owner the same way handleDogSelectionChange does.
      const owner = selectedDogsOwner(dogs, draft.data.selectedDogs ?? []);
      if (owner.ok) {
        const reg = createRegistration(showId, userId, owner.ownerId);
        setRegistrationId(reg.id);
      }
    }

    notifications.success('Draft loaded successfully');
  };

  // Step indicator click: jump to a completed step or the next step in sequence.
  const handleStepClick = (step: number) => {
    if (isStepCompleted(step) || step <= Math.max(-1, ...completedSteps) + 1) {
      if (currentStepId === 'payment') {
        setAgreedToEntryAgreement(false);
      }
      setCurrentStep(step);
    }
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setRegistrationData(prev => ({ ...prev, paymentMethod: method }));
  };

  const handlePaymentDetailsChange = (details: PaymentDetails) => {
    paymentDetailsRef.current = details;
  };

  const handlePaymentStatusChange = (regId: string, status: PaymentStatus) => {
    storeUpdatePaymentStatus(regId, status);
  };

  const handleEntryStatusChange = (regId: string, status: EntryStatus, reason?: string) => {
    storeUpdateEntryStatus(regId, status, reason);
  };

  return {
    handleNext,
    handleBack,
    handleDogSelectionChange,
    handleClassSelectionChange,
    handleHandlerAssignmentChange,
    handleDraftLoaded,
    handleExit,
    handleStepClick,
    handlePaymentMethodChange,
    handlePaymentDetailsChange,
    handlePaymentStatusChange,
    handleEntryStatusChange,
  };
}
