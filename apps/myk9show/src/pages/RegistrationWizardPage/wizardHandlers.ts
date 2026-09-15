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
import { getEntryWindowTimezone } from './entryCloseGuard';
import { defaultPaymentForMode, type RegistrationWizardState } from './useRegistrationWizardState';
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
    dogsReady,
    pendingDraftRegistrationRef,
    activateDraft,
    deactivateDraft,
    classes,
    currentShow,
    loadCart,
    clearCart,
    createCart,
    addItem,
    abandonCart,
    createRegistration,
    submitRegistration,
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
    paymentStatus,
    setPaymentStatus,
    setEntryStatus,
    setArmbandAssignments,
    setEntryOutcomes,
    paymentDetailsRef,
    setIsSubmitting,
    setAgreedToEntryAgreement,
    submittingRef,
    mountedRef,
    discardDraftsWithoutFinalSave,
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
      navigate(resolveRegistrationCompletionPath(showId, isLateEntryMode, state.isInsideSidebar));
      return;
    }

    // On the payment step a missing registration means there is nothing to
    // submit. Falling through to the generic advance below would mark the step
    // complete and show the Receipt for an entry that was never written — the
    // worst possible silent failure on this page. Say so and stay put.
    if (currentStepId === 'payment' && !(registrationId && currentRegistration)) {
      notifications.error(
        'We could not find this registration to submit. Go back to the dog step and reselect your dogs, then try again.'
      );
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
          isLateEntryMode,
          currentWorkflowMode,
          paymentMethod: registrationData.paymentMethod,
          paymentStatus,
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
            entryOpenDate: currentShow.entryOpenDate,
            entryCloseDate: currentShow.entryCloseDate,
            entryWindowTimezone: getEntryWindowTimezone(currentShow.trials),
          },
          currentStep,
          cart: { loadCart, clearCart, createCart, addItem, abandonCart },
          submitRegistration,
          isMounted: () => mountedRef.current,
          setIsSubmitting,
          setRegistrationNumber,
          setArmbandAssignments,
          setEntryOutcomes,
          markStepComplete,
          setCurrentStep,
          updateShowRegistration: (id, updates) => updateShowRegistration(id, updates),
          triggerSync,
          navigate: path => navigate(path),
          discardDraftsWithoutFinalSave,
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

  const draftDogsAvailable = (selectedDogs: string[]) => {
    if (
      selectedDogs.every(id => dogs.some(dog => dog.id === id)) &&
      selectedDogsOwner(dogs, selectedDogs).ok
    ) {
      return true;
    }
    notifications.error(
      'One or more dogs in this draft are unavailable. Your saved entry remains here; you can try again or start a new entry below.'
    );
    return false;
  };

  const handlePendingDraftRegistration = () => {
    const selectedDogs = registrationData.selectedDogs;
    if (!dogsReady || selectedDogs.length === 0) return;
    if (!draftDogsAvailable(selectedDogs)) {
      deactivateDraft();
      setRegistrationData({
        selectedDogs: [],
        entries: [],
        documents: [],
        paymentMethod: defaultPaymentForMode(currentWorkflowMode),
      });
      setClassSelections([]);
      setHandlerAssignments({});
      setStepCompletionState({});
      setPaymentStatus(PaymentStatus.PENDING);
      setEntryStatus(EntryStatus.PENDING);
      paymentDetailsRef.current = {};
      setAgreedToEntryAgreement(false);
      const dogStep = currentWorkflowConfig.steps.indexOf('dog-selection');
      setCurrentStep(dogStep >= 0 ? dogStep : 0);
      return;
    }
    void handleDogSelectionChange(selectedDogs);
  };

  // Class selection handler
  const handleClassSelectionChange = (selections: ClassSelectionData[]) => {
    setClassSelections(selections);
  };

  // Handler assignment handler
  const handleHandlerAssignmentChange = (assignments: Record<string, HandlerInfo>) => {
    setHandlerAssignments(assignments);
  };

  // Draft loading handler.
  //
  // `silent` is for the automatic same-tab rehydrate (MYK9-514): the exhibitor
  // reloaded, or came back from a cancelled checkout, and never chose to load
  // anything — a success toast there reports an action they did not take. The
  // failure notices stay in both modes; those explain why the wizard is empty.
  const handleDraftLoaded = (draft: SavedDraft, options?: { silent?: boolean }) => {
    if (draft.data._workflowState?.currentStep === 'confirmation') {
      notifications.error('This entry is already complete. Start a new entry below.');
      return false;
    }
    const selectedDogs = draft.data.selectedDogs ?? [];
    if (dogsReady && selectedDogs.length > 0 && !draftDogsAvailable(selectedDogs)) {
      return false;
    }
    pendingDraftRegistrationRef.current = !dogsReady && selectedDogs.length > 0;
    activateDraft(draft);
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

    if (dogsReady && !registrationId && selectedDogs.length > 0) {
      // createRegistration is synchronous — returns the new local registration directly.
      // Resolve the loaded selection's owner the same way handleDogSelectionChange does.
      const owner = selectedDogsOwner(dogs, draft.data.selectedDogs ?? []);
      if (owner.ok) {
        const reg = createRegistration(showId, userId, owner.ownerId);
        setRegistrationId(reg.id);
      }
    }

    if (!options?.silent) notifications.success('Draft loaded successfully');
    return true;
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

  const handlePaymentMethodClear = () => {
    setRegistrationData(prev => ({ ...prev, paymentMethod: undefined }));
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
    handlePendingDraftRegistration,
    handleClassSelectionChange,
    handleHandlerAssignmentChange,
    handleDraftLoaded,
    handleExit,
    handleStepClick,
    handlePaymentMethodChange,
    handlePaymentMethodClear,
    handlePaymentDetailsChange,
    handlePaymentStatusChange,
    handleEntryStatusChange,
  };
}
