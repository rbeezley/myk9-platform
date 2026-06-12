/**
 * Registration Wizard Page
 *
 * Full-page wizard for show registration with vertical step indicator.
 * Replaces the old dialog-based RegistrationWorkflow.
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useMatch, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@myk9/core';
import { notifications } from '@/lib/notifications';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import {
  ClassSelectionData,
  RegistrationFormData,
  HandlerInfo,
  PaymentStatus,
  EntryStatus,
  makeHandlerKey,
} from '@/types/show-registration-types';
import type { PaymentMethod, PaymentDetails } from '@/types/show-registration-types';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { useCartStore } from '@/store/cartStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { calculateTotalFees } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import { RegistrationErrorBoundary } from '@/components/common/ErrorBoundary';
import { DraftManager } from '@/components/shows/RegistrationWorkflow/DraftManager';
import { useDraftPersistence, type SavedDraft } from '@/hooks/useDraftPersistence';
import { useAuthContext } from '@/hooks/useAuthContext';
import { RegistrationProvider } from '@/context/RegistrationContext';
import VerticalProgressIndicator from '@/components/shows/wizard/components/VerticalProgressIndicator';
import WizardNavigation from '@/components/shows/wizard/components/WizardNavigation';
import { WorkflowStepContent } from '@/components/shows/RegistrationWorkflow/WorkflowStepContent';
import type {
  WorkflowMode,
  StepId,
} from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import type { ArmbandAssignment } from '@/components/shows/RegistrationWorkflow/ConfirmationStep.types';
import {
  WORKFLOW_CONFIGS,
  ALL_STEP_DEFINITIONS,
} from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.constants';
import {
  selectedDogsOwner,
  type SelectedDogsOwnerResult,
} from '@/features/registration/selectedDogsOwner';
import { submitShowRegistration } from '@/features/registration/submitShowRegistration';
import { submitRegistrationCartCheckout } from '@/features/registration/registrationCartCheckout';
import {
  isShowDeskLateEntryMode,
  resolveRegistrationCompletionPath,
} from './RegistrationWizardPage.routes';
import { proceedBlockedReason } from './RegistrationWizardPage/proceedGating';

function RegistrationWizardContent() {
  const { showId: showIdParam } = useParams<{ showId: string }>();
  // showId is guaranteed by the outer RegistrationWizardPage guard
  const showId = showIdParam!;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isInsideSidebar = !!useMatch('/secretary/*');
  const isLateEntryMode = isShowDeskLateEntryMode(searchParams);
  const workflowLabel = isLateEntryMode ? 'Late entry' : 'Register';
  const sidebarTitle = isLateEntryMode ? 'Late entry' : 'Register for Show';

  // Auth and permissions
  const { isSecretary, isClubAdmin, isSiteAdmin, canAssignArmbands } = useRegistrationPermissions();
  const { user } = useAuthContext();
  const { triggerSync } = useReplicationSync();

  // Trigger a sync on mount so any pending local mutations are uploaded
  // before the user interacts with the cart (which requires server-side records).
  const hasSynced = useRef(false);
  useEffect(() => {
    if (!hasSynced.current) {
      hasSynced.current = true;
      triggerSync();
    }
  }, [triggerSync]);

  // INTENT: Re-set mountedRef to true on each mount so React StrictMode's
  // double-invocation of effects in dev (mount → cleanup → mount) doesn't
  // leave the ref permanently false. Without the explicit `= true`, the
  // first cleanup runs and any later async await chain bails out via the
  // `if (!mountedRef.current) return;` guards even though the component
  // is still mounted.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Data stores
  const { dogs, isLoading: dogsLoading } = useDogStoreCompat();
  const { shows = [] } = useShowStore();
  const { classes = [] } = useClassStoreCompat();
  const { updateRegistration } = useEntryStore();
  const loadCart = useCartStore(state => state.loadCart);
  const clearCart = useCartStore(state => state.clearCart);
  const createCart = useCartStore(state => state.createCart);
  const addItem = useCartStore(state => state.addItem);
  const abandonCart = useCartStore(state => state.abandonCart);
  const currentShow = useMemo(() => shows.find(s => s.id === showId), [shows, showId]);

  // Derived from role flags, not RegistrationContext.mode — that value defaults
  // to 'exhibitor' while RBAC loads, which would hide the secretary search UI.
  const currentWorkflowMode: WorkflowMode = useMemo(() => {
    if (isSiteAdmin) return 'site_admin';
    if (isClubAdmin) return 'club_admin';
    if (isSecretary) return 'secretary_new';
    return 'exhibitor';
  }, [isSiteAdmin, isClubAdmin, isSecretary]);

  const currentWorkflowConfig = WORKFLOW_CONFIGS[currentWorkflowMode];

  // Reset step state when workflow mode changes mid-session (e.g. role change)
  // to prevent stale completions from a previous mode allowing skipping payment.
  const prevWorkflowMode = useRef(currentWorkflowMode);
  useEffect(() => {
    if (prevWorkflowMode.current !== currentWorkflowMode) {
      prevWorkflowMode.current = currentWorkflowMode;
      setStepCompletionState({});
      setCurrentStep(0);
    }
  }, [currentWorkflowMode]);

  // Build steps for VerticalProgressIndicator
  const steps = useMemo(() => {
    return currentWorkflowConfig.steps.map((stepId, index) => ({
      ...ALL_STEP_DEFINITIONS[stepId],
      id: index,
      completed: false,
    }));
  }, [currentWorkflowConfig.steps]);

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [stepCompletionState, setStepCompletionState] = useState<Record<string, boolean>>({});
  const [registrationData, setRegistrationData] = useState<RegistrationFormData>({
    selectedDogs: [],
    entries: [],
    documents: [],
    paymentMethod: undefined,
    specialRequests: undefined,
  });

  // Resolve the exhibitor that this submission is filed under. For exhibitor
  // self-service this equals the caller's own people.id (since they only see
  // dogs they own). For mail-in (advancedSearch=true) the secretary may have
  // selected dogs from a different exhibitor — that exhibitor's people.id
  // becomes the enrollment handler.
  const ownerResolution: SelectedDogsOwnerResult = useMemo(
    () => selectedDogsOwner(dogs, registrationData.selectedDogs),
    [dogs, registrationData.selectedDogs]
  );

  const [classSelections, setClassSelections] = useState<ClassSelectionData[]>([]);
  const [handlerAssignments, setHandlerAssignments] = useState<Record<string, HandlerInfo>>({});
  const [registrationId, setRegistrationId] = useState<string | undefined>();
  const [registrationNumber, setRegistrationNumber] = useState<string | undefined>();
  const [isCreatingRegistration, setIsCreatingRegistration] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(PaymentStatus.PENDING);
  const [entryStatus, setEntryStatus] = useState<EntryStatus>(EntryStatus.PENDING);
  const [armbandAssignments, setArmbandAssignments] = useState<ArmbandAssignment[]>([]);
  const paymentDetailsRef = useRef<PaymentDetails>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToEntryAgreement, setAgreedToEntryAgreement] = useState(false);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const hasAutoSelectedDogs = useRef(false);

  const {
    createRegistration,
    submitRegistration,
    confirmRegistration,
    currentRegistration,
    setDraftData,
    clearDraftData,
    updateRegistration: updateShowRegistration,
    updatePaymentStatus: storeUpdatePaymentStatus,
    updateEntryStatus: storeUpdateEntryStatus,
  } = useShowRegistrationStore();

  // Draft persistence
  const userId = user?.id || 'anonymous';
  const clampedStep = Math.min(currentStep, currentWorkflowConfig.steps.length - 1);
  const currentStepId: StepId = currentWorkflowConfig.steps[clampedStep];

  const {
    saveDraft: draftSave,
    loadDraft: draftLoad,
    deleteDraft: draftDelete,
    availableDrafts,
    clearAllDrafts,
    discardDraftsWithoutFinalSave,
    hasUnsavedChanges,
  } = useDraftPersistence(showId || '', userId, currentStepId, {
    autoSaveInterval: 30000,
    debug: import.meta.env.DEV,
  });

  // Step helpers
  const isStepCompleted = (stepIndex: number) => {
    const stepId = currentWorkflowConfig.steps[stepIndex];
    return stepId ? stepCompletionState[stepId] || false : false;
  };

  const markStepComplete = (stepIndex: number) => {
    const stepId = currentWorkflowConfig.steps[stepIndex];
    if (stepId) {
      setStepCompletionState(prev => ({ ...prev, [stepId]: true }));
    }
  };

  const optimisticState = useMemo(
    () => ({
      formData: registrationData,
      classSelections,
      handlerAssignments,
      paymentStatus,
      entryStatus,
    }),
    [registrationData, classSelections, handlerAssignments, paymentStatus, entryStatus]
  );

  const completedSteps = useMemo(() => {
    return steps
      .map((_step, index) => index)
      .filter(index => {
        const stepId = currentWorkflowConfig.steps[index];
        return stepId ? stepCompletionState[stepId] || false : false;
      });
  }, [steps, currentWorkflowConfig.steps, stepCompletionState]);

  // Sync draft data
  useEffect(() => {
    const draftFormData: Partial<RegistrationFormData> = {
      selectedDogs: registrationData.selectedDogs,
      entries: registrationData.entries,
      paymentMethod: registrationData.paymentMethod,
      specialRequests: registrationData.specialRequests,
      _workflowState: {
        currentStep: currentStepId,
        stepCompletionState,
        classSelections,
        handlerAssignments,
        paymentStatus,
        entryStatus,
      },
    };
    setDraftData(draftFormData);
  }, [
    registrationData,
    currentStepId,
    stepCompletionState,
    classSelections,
    handlerAssignments,
    paymentStatus,
    entryStatus,
    setDraftData,
  ]);

  // Auto-assign dog owners as handlers for each entry (dog+class) when class selections change.
  // Derived key tracks the set of entries; useEffect fires only when entries change.
  const liveTotalFees = useMemo(
    () =>
      calculateTotalFees(
        registrationData.selectedDogs,
        classSelections,
        dogs,
        classes,
        currentShow
          ? {
              preEntryFee: currentShow.preEntryFee || '0',
              dayOfShowFee: currentShow.dayOfShowFee,
              startDate: currentShow.startDate,
            }
          : undefined
      ).total,
    [registrationData.selectedDogs, classSelections, dogs, classes, currentShow]
  );

  const classSelectionsKey = useMemo(
    () =>
      classSelections
        .flatMap(s => s.selectedClasses.map(c => makeHandlerKey(s.dogId, c.classId)))
        .sort()
        .join(','),
    [classSelections]
  );

  useEffect(() => {
    if (classSelections.length === 0 || !currentWorkflowConfig.smartDefaults.autoAssignHandler) {
      return;
    }

    setHandlerAssignments(prev => {
      const newAssignments = { ...prev };
      let hasNewAssignments = false;

      classSelections.forEach(selection => {
        const dog = dogs.find(d => d.id === selection.dogId);
        if (!dog || !dog.ownerId) return;

        selection.selectedClasses.forEach(cls => {
          const key = makeHandlerKey(selection.dogId, cls.classId);
          if (!newAssignments[key]) {
            newAssignments[key] = {
              handlerId: dog.ownerId!,
              handlerName: dog.ownerName || 'Owner',
              isOwner: true,
            };
            hasNewAssignments = true;
          }
        });
      });

      return hasNewAssignments ? newAssignments : prev;
    });
    // classSelectionsKey is derived from classSelections — captures entry changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classSelectionsKey, dogs, currentWorkflowConfig.smartDefaults.autoAssignHandler]);

  // Auto-select all dogs when dog-selection step is not in the workflow (exhibitor flow).
  // Runs once after dogs load; draft loading restores selectedDogs so hasAutoSelectedDogs
  // prevents re-triggering.
  useEffect(() => {
    if (hasAutoSelectedDogs.current) return;
    if (dogsLoading) return;
    if (currentWorkflowConfig.steps.includes('dog-selection')) return;
    if (registrationData.selectedDogs.length > 0) return;
    if (dogs.length === 0) return;

    hasAutoSelectedDogs.current = true;
    const allDogIds = dogs.map(d => d.id);
    handleDogSelectionChange(allDogIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dogsLoading, dogs, currentWorkflowConfig.steps, registrationData.selectedDogs.length]);

  // Validation — proceedBlockedReason is the single source of truth; the
  // returned copy renders next to the disabled Next button so the user is
  // never left guessing why the wizard won't advance.
  const allEntryKeys = classSelections.flatMap(s =>
    s.selectedClasses.map(c => makeHandlerKey(s.dogId, c.classId))
  );
  const proceedBlocked = proceedBlockedReason({
    stepId: currentStepId,
    selectedDogsCount: registrationData.selectedDogs.length,
    ownerSelectionOk: ownerResolution.ok,
    hasSelectedClasses:
      classSelections.length > 0 && classSelections.some(s => s.selectedClasses.length > 0),
    hasSeparateHandlerStep: currentWorkflowConfig.steps.includes('handler-assignment'),
    entryCount: allEntryKeys.length,
    unassignedHandlerCount: allEntryKeys.filter(key => !handlerAssignments[key]?.handlerName)
      .length,
    totalFees: liveTotalFees,
    hasPaymentMethod: !!registrationData.paymentMethod,
    needsAgreement: !!currentShow?.organization,
    agreedToEntryAgreement,
  });
  const canProceed = () => proceedBlocked === null;

  const isLastStep = currentStep === steps.length - 1;

  // Navigation handlers
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
      submittingRef.current = true;
      setIsSubmitting(true);
      const previousStatus = currentRegistration.status;
      const paymentDetails = paymentDetailsRef.current;
      try {
        if (registrationData.paymentMethod === 'credit_card') {
          await submitRegistrationCartCheckout({
            showId,
            ownerResolution,
            classSelections,
            handlerAssignments,
            classes,
            showFeeInfo: {
              preEntryFee: currentShow.preEntryFee || '0',
              dayOfShowFee: currentShow.dayOfShowFee,
              startDate: currentShow.startDate,
            },
            deps: {
              loadCart,
              clearCart,
              createCart,
              addItem,
              abandonCart,
              deleteDraft: async () => {
                discardDraftsWithoutFinalSave();
                clearDraftData();
              },
              navigate: path => navigate(path),
            },
          });
          return;
        }

        // Update local Zustand state to reflect submission in progress
        const submissionResult = await submitShowRegistration({
          showId,
          userId,
          registrationId,
          ownerResolution,
          paymentMethod: registrationData.paymentMethod,
          paymentDetails,
          classSelections,
          handlerAssignments,
          classes,
          canAssignArmbands,
          showFeeInfo: {
            preEntryFee: currentShow.preEntryFee || '0',
            dayOfShowFee: currentShow.dayOfShowFee,
            startDate: currentShow.startDate,
          },
          isActive: () => mountedRef.current,
          deps: {
            submitRegistration,
            confirmRegistration,
            updateEntryRegistration: updateRegistration,
          },
        });
        if (submissionResult.aborted) return;
        setRegistrationNumber(submissionResult.registrationNumber);
        if (submissionResult.armbandAssignments.length > 0) {
          setArmbandAssignments(submissionResult.armbandAssignments);
        }
        if (submissionResult.armbandFailures.length > 0) {
          // Entries are submitted; only the armband writes failed. Warn loudly
          // so the secretary assigns these manually instead of discovering
          // missing ring numbers on show day. The wizard auto-advances to the
          // confirmation step, so the toast must persist until dismissed.
          const count = submissionResult.armbandFailures.length;
          notifications.error(
            `Entries submitted, but armband assignment failed for ${count} dog${count === 1 ? '' : 's'}. Assign armbands manually from Entries Management.`,
            { duration: Infinity, action: { label: 'Dismiss', onClick: () => {} } }
          );
        }
        triggerSync();
        markStepComplete(currentStep);
        setCurrentStep(prev => prev + 1);
        return;
      } catch (error) {
        // Roll back local registration status so retry starts from correct state
        updateShowRegistration(registrationId, { status: previousStatus });
        console.error('Registration payment submission failed:', error);
        if (mountedRef.current) {
          notifications.error(getErrorMessage(error));
        }
      } finally {
        submittingRef.current = false;
        if (mountedRef.current) {
          setIsSubmitting(false);
        }
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
      navigate(-1);
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

  return (
    <RegistrationErrorBoundary>
      <div className={isInsideSidebar ? 'bg-background' : 'min-h-screen bg-background'}>
        {/* Header with back button and breadcrumb */}
        <div
          className={`border-b bg-card/95 backdrop-blur-xl sticky ${isInsideSidebar ? 'top-0' : 'top-16'} z-40`}
        >
          <div className="container mx-auto px-6 py-4 max-w-7xl">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="default"
                onClick={() => navigate(-1)}
                className="gap-2 hover:-translate-y-0.5 transition-all duration-300"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Shows</span>
                <span>/</span>
                <span className="truncate max-w-[200px]">{currentShow?.name || 'Show'}</span>
                <span>/</span>
                <span className="text-foreground font-medium">{workflowLabel}</span>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`container mx-auto px-4 sm:px-6 ${isInsideSidebar ? 'pt-6' : 'pt-20 sm:pt-24'} pb-8 max-w-7xl`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 sm:gap-6">
            {/* Sidebar - Progress Indicator */}
            <div className="lg:col-span-1">
              <div className={`sticky ${isInsideSidebar ? 'top-14' : 'top-28 lg:top-32'}`}>
                <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-4 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative">
                    <h2 className="text-base font-semibold mb-1 text-foreground group-hover:text-primary transition-colors duration-300">
                      {sidebarTitle}
                    </h2>
                    {currentShow && (
                      <p className="text-xs text-muted-foreground mb-4 truncate">
                        {currentShow.name}
                      </p>
                    )}
                    <VerticalProgressIndicator
                      steps={steps}
                      currentStep={currentStep}
                      completedSteps={completedSteps}
                      onStepClick={(step: number) => {
                        if (isStepCompleted(step) || step <= Math.max(-1, ...completedSteps) + 1) {
                          if (currentStepId === 'payment') {
                            setAgreedToEntryAgreement(false);
                          }
                          setCurrentStep(step);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-1">
              <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl min-h-[600px] flex flex-col transition-all duration-300 hover:shadow-lg">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative flex-1 p-6 sm:p-8">
                  {/* Draft controls */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="font-medium">
                        Step {currentStep + 1} of {steps.length}:
                      </span>
                      <span>{steps[currentStep]?.label}</span>
                    </div>
                    <DraftManager
                      saveDraft={draftSave}
                      loadDraft={draftLoad}
                      deleteDraft={draftDelete}
                      availableDrafts={availableDrafts}
                      clearAllDrafts={clearAllDrafts}
                      hasUnsavedChanges={!!hasUnsavedChanges}
                      onDraftLoaded={handleDraftLoaded}
                      onDraftSaved={() => notifications.success('Draft saved')}
                    />
                  </div>

                  <div className="border-t border-border mb-6" />

                  {/* Multi-owner / orphan-owner cart guard */}
                  {currentStepId === 'dog-selection' &&
                    registrationData.selectedDogs.length > 0 &&
                    !ownerResolution.ok && (
                      <div
                        role="alert"
                        className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                      >
                        {ownerResolution.owners.length >= 2
                          ? "This wizard processes one exhibitor's entries at a time. The selected dogs belong to multiple owners. Please remove all but one owner's dogs before continuing."
                          : 'One or more selected dogs has no owner on file. An enrollment must be filed under an exhibitor — please add an owner to the dog (or remove it from the cart) before continuing.'}
                      </div>
                    )}

                  {/* Step content */}
                  <WorkflowStepContent
                    currentStepId={currentStepId}
                    currentWorkflowConfig={currentWorkflowConfig}
                    registrationData={registrationData}
                    optimisticState={optimisticState}
                    showId={showId}
                    registrationId={registrationId}
                    registrationNumber={registrationNumber}
                    currentRegistrationTotalFees={liveTotalFees}
                    armbandAssignments={armbandAssignments}
                    onDogSelectionChange={handleDogSelectionChange}
                    onClassSelectionChange={handleClassSelectionChange}
                    onHandlerAssignmentChange={handleHandlerAssignmentChange}
                    onPaymentMethodChange={(method: PaymentMethod) =>
                      setRegistrationData(prev => ({
                        ...prev,
                        paymentMethod: method,
                      }))
                    }
                    onPaymentDetailsChange={(details: PaymentDetails) => {
                      paymentDetailsRef.current = details;
                    }}
                    onPaymentStatusChange={(regId: string, status: PaymentStatus) => {
                      storeUpdatePaymentStatus(regId, status);
                    }}
                    onEntryStatusChange={(regId: string, status: EntryStatus, reason?: string) => {
                      storeUpdateEntryStatus(regId, status, reason);
                    }}
                    setPaymentStatus={setPaymentStatus}
                    setEntryStatus={setEntryStatus}
                    dogsLoading={dogsLoading}
                    agreedToEntryAgreement={agreedToEntryAgreement}
                    onAgreementChange={setAgreedToEntryAgreement}
                  />
                </div>

                {/* Navigation */}
                <div className="relative px-6 sm:px-8 pb-6 sm:pb-8">
                  {proceedBlocked && !isSubmitting && (
                    <p role="status" className="mb-3 text-sm text-muted-foreground">
                      {proceedBlocked}
                    </p>
                  )}
                  <WizardNavigation
                    currentStep={currentStep}
                    totalSteps={steps.length}
                    canGoBack={true}
                    canGoNext={canProceed()}
                    onBack={handleBack}
                    onNext={handleNext}
                    nextLabel={isLastStep ? 'Complete Registration' : 'Next'}
                    backLabel={currentStep === 0 ? 'Cancel' : 'Back'}
                    isLoading={isSubmitting}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RegistrationErrorBoundary>
  );
}

// Wrap with RegistrationProvider for RBAC context
export default function RegistrationWizardPage() {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const { shows } = useShowStore();

  if (!showId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No show selected.</p>
          <Button variant="outline" onClick={() => navigate('/shows')}>
            Browse Shows
          </Button>
        </div>
      </div>
    );
  }

  // shows.length === 0 means still loading from replication — let the inner
  // component handle that state. Once shows are populated, verify this one exists.
  const showExists = shows.length === 0 || shows.some(s => s.id === showId);
  if (!showExists) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Show not found.</p>
          <Button variant="outline" onClick={() => navigate('/shows')}>
            Browse Shows
          </Button>
        </div>
      </div>
    );
  }

  return (
    <RegistrationProvider>
      <RegistrationWizardContent />
    </RegistrationProvider>
  );
}
