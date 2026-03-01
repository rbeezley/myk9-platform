import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import {
  ClassSelectionData,
  RegistrationFormData,
  HandlerInfo,
  PaymentStatus,
  EntryStatus,
} from '@/types/show-registration-types';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { useRegistrationContext } from '@/hooks/useRegistrationContext';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStore } from '@/store/showStore';
import { RegistrationErrorBoundary } from '@/components/common/ErrorBoundary';
import { DraftManager } from './DraftManager';
import { useDraftPersistence, type SavedDraft } from '@/hooks/useDraftPersistence';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useOptimisticRegistration } from '@/hooks/useOptimisticRegistration';
import { toast } from 'sonner';
import ProgressIndicator from '../wizard/components/ProgressIndicator';
import WizardNavigation from '../wizard/components/WizardNavigation';
import '@/styles/apple-registration-workflow.css';
import type { WorkflowMode, RegistrationWorkflowProps, StepId } from './RegistrationWorkflow.types';
import {
  WORKFLOW_CONFIGS,
  ALL_STEP_DEFINITIONS,
  STEP_ANIMATION_VARIANTS,
} from './RegistrationWorkflow.constants';
import { WorkflowStepContent } from './WorkflowStepContent';

export type { RegistrationWorkflowProps } from './RegistrationWorkflow.types';

export function RegistrationWorkflow({ showId, onComplete, onCancel }: RegistrationWorkflowProps) {
  // Get user permissions and context
  const { canCreateExhibitor, isSecretary, isClubAdmin, isSiteAdmin } =
    useRegistrationPermissions();
  const { mode } = useRegistrationContext();
  const { user } = useAuthContext();

  // Get data stores
  const { dogs } = useDogStoreCompat();
  const { shows = [] } = useShowStore();

  // Determine workflow mode based on permissions
  const currentWorkflowMode: WorkflowMode = useMemo(() => {
    if (mode) return mode as WorkflowMode;
    if (isSiteAdmin) return 'site_admin';
    if (isClubAdmin) return 'club_admin';
    if (isSecretary && canCreateExhibitor) return 'secretary_new';
    if (isSecretary) return 'secretary_existing';
    return 'exhibitor';
  }, [mode, isSiteAdmin, isClubAdmin, isSecretary, canCreateExhibitor]);

  const currentWorkflowConfig = WORKFLOW_CONFIGS[currentWorkflowMode];

  // Build steps based on workflow configuration
  const steps = useMemo(() => {
    return currentWorkflowConfig.steps.map((stepId, index) => ({
      ...ALL_STEP_DEFINITIONS[stepId],
      id: index, // Ensure sequential IDs for ProgressIndicator
      completed: false,
    }));
  }, [currentWorkflowConfig.steps]);

  const [currentStep, setCurrentStep] = useState(0);
  const [stepCompletionState, setStepCompletionState] = useState<Record<string, boolean>>({});
  const [registrationData, setRegistrationData] = useState<RegistrationFormData>({
    selectedDogs: [],
    entries: [],
    documents: [],
    paymentMethod: undefined,
    specialRequests: undefined,
  });
  const [classSelections, setClassSelections] = useState<ClassSelectionData[]>([]);
  const [handlerAssignments, setHandlerAssignments] = useState<Record<string, HandlerInfo>>({});
  const [registrationId, setRegistrationId] = useState<string | undefined>();
  const [registrationNumber, setRegistrationNumber] = useState<string | undefined>();
  const [isCreatingRegistration, setIsCreatingRegistration] = useState(false);

  // Payment and Entry Status State
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(PaymentStatus.PENDING);
  const [entryStatus, setEntryStatus] = useState<EntryStatus>(EntryStatus.PENDING);

  const {
    createRegistration,
    submitRegistration,
    confirmRegistration,
    currentRegistration,
    setDraftData,
  } = useShowRegistrationStore();

  // Draft persistence
  const userId = user?.id || 'anonymous';
  const currentStepId: StepId = currentWorkflowConfig.steps[currentStep] ?? 'dog-selection';

  useDraftPersistence(showId, userId, currentStepId, {
    autoSaveInterval: 30000, // 30 seconds
    debug: process.env.NODE_ENV === 'development',
  });

  // Optimistic updates
  const {
    registrationState: optimisticState,
    updateDogSelection,
    updateClassSelections,
    updateHandlerAssignments,
    updatePaymentStatus: updatePaymentStatusOptimistic,
    updateEntryStatus: updateEntryStatusOptimistic,
    batchUpdate,
  } = useOptimisticRegistration(showId, {
    formData: registrationData,
    classSelections,
    handlerAssignments,
    paymentStatus,
    entryStatus,
    stepCompletionState,
  });

  // Merge local handler assignments into optimistic state so auto-assigned
  // handlers appear immediately (the optimistic layer doesn't track them).
  const effectiveOptimisticState = useMemo(
    () => ({
      ...optimisticState,
      handlerAssignments,
    }),
    [optimisticState, handlerAssignments]
  );

  // Define helper functions first
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

  // Helper to get completed step indices for ProgressIndicator
  const getCompletedSteps = () => {
    return steps
      .map((step, index) => ({ step, index }))
      .filter(({ index }) => isStepCompleted(index))
      .map(({ index }) => index);
  };

  const currentStepData = steps[currentStep];
  const totalSteps = steps.length;
  const currentShow = shows.find(s => s.id === showId);

  // Sync registration data with draft data for auto-save
  useEffect(() => {
    const draftFormData: Partial<RegistrationFormData> = {
      selectedDogs: registrationData.selectedDogs,
      entries: registrationData.entries,
      paymentMethod: registrationData.paymentMethod,
      specialRequests: registrationData.specialRequests,
      // Include additional workflow state
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

  // Auto-assign dog owners as handlers when dogs are selected
  // Auto-assign handlers using render-time sync pattern
  const selectedDogsKey = registrationData.selectedDogs.join(',');
  const [prevSelectedDogsKey, setPrevSelectedDogsKey] = useState(selectedDogsKey);
  if (
    selectedDogsKey !== prevSelectedDogsKey &&
    registrationData.selectedDogs.length > 0 &&
    currentWorkflowConfig.smartDefaults.autoAssignHandler
  ) {
    setPrevSelectedDogsKey(selectedDogsKey);
    const newAssignments: Record<string, HandlerInfo> = { ...handlerAssignments };
    let hasNewAssignments = false;

    registrationData.selectedDogs.forEach(dogId => {
      if (!newAssignments[dogId]) {
        const dog = dogs.find(d => d.id === dogId);
        if (dog && dog.ownerId) {
          newAssignments[dogId] = {
            handlerId: dog.ownerId,
            handlerName: dog.ownerName || 'Owner',
            isOwner: true,
          };
          hasNewAssignments = true;
        }
      }
    });

    if (hasNewAssignments) {
      setHandlerAssignments(newAssignments);
    }
  }

  const canProceed = () => {
    switch (currentStepId) {
      case 'dog-selection':
        return registrationData.selectedDogs.length > 0;
      case 'class-selection':
        return (
          classSelections.length > 0 && classSelections.some(s => s.selectedClasses.length > 0)
        );
      case 'handler-assignment':
        return registrationData.selectedDogs.every(
          dogId => handlerAssignments[dogId] && handlerAssignments[dogId].handlerId
        );
      case 'payment':
        return !!registrationData.paymentMethod;
      case 'confirmation':
        return true;
      default:
        return false;
    }
  };

  const isLastStep = currentStep === steps.length - 1;

  const handleNext = async () => {
    if (!canProceed()) return;

    // Mark current step as complete
    markStepComplete(currentStep);

    if (currentStepId === 'payment' && registrationId && currentRegistration) {
      // Submit the registration after payment step
      await submitRegistration(registrationId);

      // If credit card payment, mark as confirmed
      if (registrationData.paymentMethod === 'credit_card') {
        confirmRegistration(registrationId, 'MOCK-PAYMENT-REF');
        setRegistrationNumber(currentRegistration.registrationNumber);
      }
    }

    if (!isLastStep) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete({
        ...registrationData,
        registrationNumber,
      });
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // Create registration when first dog is selected
  const handleDogSelectionChange = async (selectedDogs: string[]) => {
    // Update local state immediately for UI responsiveness
    setRegistrationData(prev => ({ ...prev, selectedDogs }));

    // Create registration on first dog selection
    if (selectedDogs.length > 0 && !registrationId && !isCreatingRegistration) {
      setIsCreatingRegistration(true);
      const reg = createRegistration(showId, userId || 'current-user-id');
      setRegistrationId(reg.id);
      setIsCreatingRegistration(false);
    }

    // Trigger optimistic update
    try {
      await updateDogSelection(selectedDogs);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update dog selection';
      toast.error(errorMessage);
    }
  };

  // Handle class selection changes with optimistic updates
  const handleClassSelectionChange = async (selections: ClassSelectionData[]) => {
    setClassSelections(selections);

    try {
      await updateClassSelections(selections);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update class selections';
      toast.error(errorMessage);
    }
  };

  // Handle handler assignment changes with optimistic updates
  const handleHandlerAssignmentChange = async (assignments: Record<string, HandlerInfo>) => {
    setHandlerAssignments(assignments);

    try {
      await updateHandlerAssignments(assignments);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update handler assignments';
      toast.error(errorMessage);
    }
  };

  const handleDraftLoaded = (draft: SavedDraft) => {
    // Restore workflow state from draft
    if (draft.data._workflowState) {
      const workflowState = draft.data._workflowState;
      setStepCompletionState(workflowState.stepCompletionState || {});
      setClassSelections(workflowState.classSelections || []);
      setHandlerAssignments(workflowState.handlerAssignments || {});
      setPaymentStatus(workflowState.paymentStatus || PaymentStatus.PENDING);
      setEntryStatus(workflowState.entryStatus || EntryStatus.PENDING);

      // Find and set current step
      const stepIndex = currentWorkflowConfig.steps.findIndex(s => s === workflowState.currentStep);
      if (stepIndex >= 0) {
        setCurrentStep(stepIndex);
      }
    }

    // Restore registration data
    setRegistrationData({
      selectedDogs: draft.data.selectedDogs || [],
      entries: draft.data.entries || [],
      documents: draft.data.documents || [],
      paymentMethod: draft.data.paymentMethod,
      specialRequests: draft.data.specialRequests,
    });

    // Also update the optimistic state to reflect the loaded data
    batchUpdate({
      formData: {
        selectedDogs: draft.data.selectedDogs || [],
        entries: draft.data.entries || [],
        documents: draft.data.documents || [],
        paymentMethod: draft.data.paymentMethod,
        specialRequests: draft.data.specialRequests,
      },
      classSelections: draft.data._workflowState?.classSelections || [],
      handlerAssignments: draft.data._workflowState?.handlerAssignments || {},
      paymentStatus: draft.data._workflowState?.paymentStatus || PaymentStatus.PENDING,
      entryStatus: draft.data._workflowState?.entryStatus || EntryStatus.PENDING,
      stepCompletionState: draft.data._workflowState?.stepCompletionState || {},
    });

    // Show success notification
    toast.success('Draft loaded successfully', {
      description: `Restored to ${currentStepData.label} step`,
    });
  };

  return (
    <RegistrationErrorBoundary>
      <div className="apple-registration-workflow w-full mx-auto space-y-6">
        {/* Clean Header - Only show if not in dialog */}
        {currentShow && !window.location.pathname.includes('/classes/') && (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-foreground mb-1">{currentShow.name}</h1>
            <p className="text-sm text-muted-foreground">
              Complete all required steps to finalize your registration
            </p>
          </div>
        )}

        {/* Step Navigation */}
        <Card className="apple-registration-card">
          <CardContent className="p-0">
            {/* Enhanced Progress Indicator */}
            <ProgressIndicator
              steps={steps}
              currentStep={currentStep}
              completedSteps={getCompletedSteps()}
              onStepClick={(step: number) => {
                // Allow navigation to completed steps or next step
                if (isStepCompleted(step) || step <= Math.max(-1, ...getCompletedSteps()) + 1) {
                  setCurrentStep(step);
                }
              }}
              className="border-b py-4 mb-8"
            />

            {/* Draft Controls - Better positioned within workflow context */}
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium">
                  Step {currentStep + 1} of {steps.length}:
                </span>
                <span>{currentStepData.label}</span>
              </div>
              <div className="apple-draft-controls">
                <DraftManager
                  showId={showId}
                  userId={userId}
                  currentStep={currentStepId}
                  onDraftLoaded={handleDraftLoaded}
                  onDraftSaved={() => {
                    toast.success('Draft saved successfully');
                  }}
                />
              </div>
            </div>

            {/* Divider between controls and content */}
            <div className="border-t border-border mb-4"></div>

            {/* Current Step Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                variants={STEP_ANIMATION_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="apple-registration-content"
              >
                <div className="apple-registration-step-header">
                  <div className="apple-registration-step-title">
                    {currentStepData.icon}
                    {currentStepData.label}
                    {currentStepData.optional && <Badge variant="outline">Optional</Badge>}
                  </div>
                  <p className="apple-registration-step-description">
                    {currentStepData.description}
                  </p>
                </div>

                {/* Step-specific content */}
                <WorkflowStepContent
                  currentStepId={currentStepId}
                  currentWorkflowConfig={currentWorkflowConfig}
                  registrationData={registrationData}
                  optimisticState={effectiveOptimisticState}
                  showId={showId}
                  registrationId={registrationId}
                  registrationNumber={registrationNumber}
                  currentRegistrationTotalFees={currentRegistration?.totalFees || 0}
                  onDogSelectionChange={handleDogSelectionChange}
                  onClassSelectionChange={handleClassSelectionChange}
                  onHandlerAssignmentChange={handleHandlerAssignmentChange}
                  onPaymentMethodChange={method =>
                    setRegistrationData(prev => ({
                      ...prev,
                      paymentMethod: method as 'credit_card' | 'check' | 'cash',
                    }))
                  }
                  onPaymentStatusChange={updatePaymentStatusOptimistic}
                  onEntryStatusChange={updateEntryStatusOptimistic}
                  setPaymentStatus={setPaymentStatus}
                  setEntryStatus={setEntryStatus}
                />
              </motion.div>
            </AnimatePresence>

            {/* Enhanced Navigation */}
            <WizardNavigation
              currentStep={currentStep}
              totalSteps={totalSteps}
              canGoBack={true}
              canGoNext={canProceed()}
              onBack={currentStep === 0 ? onCancel : handlePrevious}
              onNext={handleNext}
              nextLabel={isLastStep ? 'Complete Registration' : 'Next'}
              backLabel={currentStep === 0 ? 'Cancel' : 'Previous'}
              className="pt-8 border-t border-border mt-8"
            />
          </CardContent>
        </Card>
      </div>
    </RegistrationErrorBoundary>
  );
}
