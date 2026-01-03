import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dog, Trophy, CreditCard, CheckSquare, UserCheck } from 'lucide-react';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import { DogSelectionStep } from './DogSelectionStep';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';
import { ClassSelectionStep } from './ClassSelectionStep';
import { PaymentStep } from './PaymentStep';
import { ConfirmationStep } from './ConfirmationStep';
import { ClassSelectionData, RegistrationFormData, HandlerInfo, PaymentStatus, EntryStatus } from '@/types/show-registration-types';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { useRegistrationContext } from '@/hooks/useRegistrationContext';
import { HandlerAssignmentStep } from './HandlerAssignmentStep';
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { useShowStore } from '@/store/showStore';
import { RegistrationErrorBoundary, SearchErrorBoundary, PaymentErrorBoundary } from '@/components/common/ErrorBoundary';
import { DraftManager } from './DraftManager';
import { useDraftPersistence } from '@/hooks/useDraftPersistence';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useOptimisticRegistration } from '@/hooks/useOptimisticRegistration';
import { useOptimisticFeedback } from '@/hooks/useOptimisticFeedback';
import { useRegistrationConflicts } from '@/hooks/useRegistrationConflicts';
import { ConflictResolutionDialog } from '@/components/sync/ConflictResolutionDialog';
import { toast } from 'sonner';
import ProgressIndicator from '../wizard/components/ProgressIndicator';
import WizardNavigation from '../wizard/components/WizardNavigation';
import '@/styles/apple-registration-workflow.css';

interface RegistrationStep {
  id: number;
  label: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
  optional?: boolean;
  requiredForRole?: string[];
}

type WorkflowMode = 'exhibitor' | 'secretary_existing' | 'secretary_new' | 'club_admin' | 'site_admin';

interface WorkflowConfig {
  steps: string[];
  features: {
    bulkSelection: boolean;
    createNew: boolean;
    advancedSearch: boolean;
    handlerAssignment: boolean;
    paymentOverride: boolean;
    statusManagement: boolean;
  };
  smartDefaults: {
    autoAssignHandler: boolean;
    autoCalculateFees: boolean;
    delayRegistrationCreation: boolean;
  };
}

interface RegistrationWorkflowProps {
  showId: string;
  onComplete: (data: RegistrationFormData) => void;
  onCancel: () => void;
}

const WORKFLOW_CONFIGS: Record<WorkflowMode, WorkflowConfig> = {
  exhibitor: {
    steps: ['dog-selection', 'class-selection', 'payment', 'confirmation'],
    features: {
      bulkSelection: false,
      createNew: false,
      advancedSearch: false,
      handlerAssignment: false,
      paymentOverride: false,
      statusManagement: false
    },
    smartDefaults: {
      autoAssignHandler: true,
      autoCalculateFees: true,
      delayRegistrationCreation: false
    }
  },
  secretary_existing: {
    steps: ['dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
    features: {
      bulkSelection: true,
      createNew: false,
      advancedSearch: true,
      handlerAssignment: true,
      paymentOverride: true,
      statusManagement: true
    },
    smartDefaults: {
      autoAssignHandler: false,
      autoCalculateFees: true,
      delayRegistrationCreation: true
    }
  },
  secretary_new: {
    steps: ['dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
    features: {
      bulkSelection: true,
      createNew: true,
      advancedSearch: true,
      handlerAssignment: true,
      paymentOverride: true,
      statusManagement: true
    },
    smartDefaults: {
      autoAssignHandler: false,
      autoCalculateFees: true,
      delayRegistrationCreation: true
    }
  },
  club_admin: {
    steps: ['dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
    features: {
      bulkSelection: true,
      createNew: true,
      advancedSearch: true,
      handlerAssignment: true,
      paymentOverride: true,
      statusManagement: true
    },
    smartDefaults: {
      autoAssignHandler: false,
      autoCalculateFees: false,
      delayRegistrationCreation: true
    }
  },
  site_admin: {
    steps: ['dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
    features: {
      bulkSelection: true,
      createNew: true,
      advancedSearch: true,
      handlerAssignment: true,
      paymentOverride: true,
      statusManagement: true
    },
    smartDefaults: {
      autoAssignHandler: false,
      autoCalculateFees: false,
      delayRegistrationCreation: true
    }
  }
};

const ALL_STEP_DEFINITIONS: Record<string, Omit<RegistrationStep, 'completed'>> = {
  'dog-selection': {
    id: 0,
    label: 'Select Dogs',
    description: 'Choose which dogs to register',
    icon: <Dog className="h-5 w-5" />
  },
  'class-selection': {
    id: 1,
    label: 'Classes',
    description: 'Select classes for each dog',
    icon: <Trophy className="h-5 w-5" />
  },
  'handler-assignment': {
    id: 2,
    label: 'Handlers',
    description: 'Assign handlers for entries',
    icon: <UserCheck className="h-5 w-5" />,
    requiredForRole: ['secretary_existing', 'secretary_new', 'club_admin', 'site_admin']
  },
  'payment': {
    id: 3,
    label: 'Payment',
    description: 'Review fees and payment',
    icon: <CreditCard className="h-5 w-5" />
  },
  'confirmation': {
    id: 4,
    label: 'Confirmation',
    description: 'Review and confirm',
    icon: <CheckSquare className="h-5 w-5" />
  }
};

export function RegistrationWorkflow({ showId, onComplete, onCancel }: RegistrationWorkflowProps) {
  // Get user permissions and context
  const { canCreateExhibitor, isSecretary, isClubAdmin, isSiteAdmin } = useRegistrationPermissions();
  const { mode } = useRegistrationContext();
  const { user } = useAuthContext();
  
  // Get data stores
  const { dogs = [] } = useDogStore();
  const { people = [] } = useUserStore();
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
      completed: false
    }));
  }, [currentWorkflowConfig.steps]);
  
  const [currentStep, setCurrentStep] = useState(0);
  const [stepCompletionState, setStepCompletionState] = useState<Record<string, boolean>>({});
  const [registrationData, setRegistrationData] = useState<RegistrationFormData>({
    selectedDogs: [],
    entries: [],
    documents: [],
    paymentMethod: undefined,
    specialRequests: undefined
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
    // updateRegistration,
    // addEntry,
    // addClassToEntry,
    // calculateFees,
    submitRegistration,
    confirmRegistration,
    currentRegistration,
    setDraftData
  } = useShowRegistrationStore();

  // Draft persistence  
  const userId = user?.id || 'anonymous';
  const currentStepId = currentWorkflowConfig.steps[currentStep] || 'unknown';
  
  useDraftPersistence(showId, userId, currentStepId, {
    autoSaveInterval: 30000, // 30 seconds
    debug: process.env.NODE_ENV === 'development'
  });

  // Optimistic updates
  const {
    registrationState: optimisticState,
    updateDogSelection,
    updateClassSelections,
    updateHandlerAssignments,
    updatePaymentStatus: updatePaymentStatusOptimistic,
    updateEntryStatus: updateEntryStatusOptimistic,
    batchUpdate
  } = useOptimisticRegistration(showId, {
    formData: registrationData,
    classSelections,
    handlerAssignments,
    paymentStatus,
    entryStatus,
    stepCompletionState
  });

  // Optimistic feedback
  const { showError } = useOptimisticFeedback();

  // Conflict resolution
  const {
    selectedConflict,
    setSelectedConflictId
  } = useRegistrationConflicts(showId, registrationId);

  // Define unused but required function to satisfy hook requirements
  const resolveRegistrationConflict = () => {};
  const dismissConflict = () => {};

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
        entryStatus
      }
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
    setDraftData
  ]);

  // Auto-assign dog owners as handlers when dogs are selected
  useEffect(() => {
    if (registrationData.selectedDogs.length > 0 && currentWorkflowConfig.smartDefaults.autoAssignHandler) {
      const newAssignments: Record<string, HandlerInfo> = { ...handlerAssignments };
      let hasNewAssignments = false;
      
      registrationData.selectedDogs.forEach(dogId => {
        if (!newAssignments[dogId]) {
          const dog = dogs.find(d => d.id === dogId);
          if (dog) {
            const owner = people.find(p => p.id === dog.ownerId);
            if (owner) {
              newAssignments[dogId] = {
                handlerId: owner.id,
                handlerName: `${owner.firstName} ${owner.lastName}`,
                isOwner: true
              };
              hasNewAssignments = true;
            }
          }
        }
      });
      
      if (hasNewAssignments) {
        setHandlerAssignments(newAssignments);
      }
    }
  }, [registrationData.selectedDogs, dogs, people, currentWorkflowConfig.smartDefaults.autoAssignHandler, handlerAssignments]);

  const canProceed = () => {
    switch (currentStepId) {
      case 'dog-selection':
        return registrationData.selectedDogs.length > 0;
      case 'class-selection':
        return classSelections.length > 0 && 
               classSelections.some(s => s.selectedClasses.length > 0);
      case 'handler-assignment':
        // Check if all selected dogs have handler assignments
        return registrationData.selectedDogs.every(dogId => 
          handlerAssignments[dogId] && handlerAssignments[dogId].handlerId
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
        registrationNumber
      });
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // Create registration when first dog is selected
  const handleDogSelectionChange = async (dogs: string[]) => {
    // Update local state immediately for UI responsiveness
    setRegistrationData(prev => ({ ...prev, selectedDogs: dogs }));
    
    // Create registration on first dog selection
    if (dogs.length > 0 && !registrationId && !isCreatingRegistration) {
      setIsCreatingRegistration(true);
      const reg = createRegistration(showId, userId || 'current-user-id');
      setRegistrationId(reg.id);
      setIsCreatingRegistration(false);
    }
    
    // Trigger optimistic update
    try {
      await updateDogSelection(dogs);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update dog selection';
      showError(errorMessage);
    }
  };

  // Handle class selection changes with optimistic updates
  const handleClassSelectionChange = async (selections: ClassSelectionData[]) => {
    setClassSelections(selections);
    
    try {
      await updateClassSelections(selections);
      
      // Disabled automatic conflict check during normal workflow
      // Only check conflicts when explicitly needed (e.g., after server sync)
      // await performConflictCheck({
      //   formData: registrationData,
      //   classSelections: selections,
      //   handlerAssignments
      // });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update class selections';
      showError(errorMessage);
    }
  };

  // Handle handler assignment changes with optimistic updates
  const handleHandlerAssignmentChange = async (assignments: Record<string, HandlerInfo>) => {
    setHandlerAssignments(assignments);
    
    try {
      await updateHandlerAssignments(assignments);
      
      // Disabled automatic conflict check during normal workflow
      // Only check conflicts when explicitly needed (e.g., after server sync)
      // await performConflictCheck({
      //   formData: registrationData,
      //   classSelections,
      //   handlerAssignments: assignments
      // });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update handler assignments';
      showError(errorMessage);
    }
  };

  // Update registration entries when class selections change - removed to prevent infinite loop

  const stepVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  };

  return (
    <RegistrationErrorBoundary>
      <div className="apple-registration-workflow w-full mx-auto space-y-6">
        {/* Clean Header - Only show if not in dialog */}
        {currentShow && !window.location.pathname.includes('/classes/') && (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-foreground mb-1">
              {currentShow.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Complete all required steps to finalize your registration
            </p>
          </div>
        )}

      {/* Removed banner-style OptimisticFeedback to reduce visual distraction */}

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
              <span className="font-medium">Step {currentStep + 1} of {steps.length}:</span>
              <span>{currentStepData.label}</span>
            </div>
            <div className="apple-draft-controls">
              <DraftManager
                showId={showId}
                userId={userId}
                currentStep={currentStepId}
                onDraftLoaded={(draft) => {
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
                  specialRequests: draft.data.specialRequests
                });

                // Also update the optimistic state to reflect the loaded data
                batchUpdate({
                  formData: {
                    selectedDogs: draft.data.selectedDogs || [],
                    entries: draft.data.entries || [],
                    documents: draft.data.documents || [],
                    paymentMethod: draft.data.paymentMethod,
                    specialRequests: draft.data.specialRequests
                  },
                  classSelections: draft.data._workflowState?.classSelections || [],
                  handlerAssignments: draft.data._workflowState?.handlerAssignments || {},
                  paymentStatus: draft.data._workflowState?.paymentStatus || PaymentStatus.PENDING,
                  entryStatus: draft.data._workflowState?.entryStatus || EntryStatus.PENDING,
                  stepCompletionState: draft.data._workflowState?.stepCompletionState || {}
                });

                // Show success notification
                toast.success('Draft loaded successfully', {
                  description: `Restored to ${currentStepData.label} step`
                });
              }}
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
              variants={stepVariants}
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
                  {currentStepData.optional && (
                    <Badge variant="outline">Optional</Badge>
                  )}
                </div>
                <p className="apple-registration-step-description">{currentStepData.description}</p>
              </div>

              {/* Step-specific content */}
              <div className="min-h-[300px]">
                {currentStepId === 'dog-selection' && (
                  <SearchErrorBoundary>
                    {currentWorkflowConfig.features.advancedSearch ? (
                      <DogSelectionStepEnhanced
                        selectedDogs={registrationData.selectedDogs}
                        onSelectionChange={handleDogSelectionChange}
                      />
                    ) : (
                      <DogSelectionStep
                        selectedDogs={registrationData.selectedDogs}
                        onSelectionChange={handleDogSelectionChange}
                      />
                    )}
                  </SearchErrorBoundary>
                )}
                
                {currentStepId === 'class-selection' && (
                  <ClassSelectionStep
                    selectedDogs={optimisticState.formData.selectedDogs}
                    classSelections={optimisticState.classSelections}
                    onSelectionChange={handleClassSelectionChange}
                    showId={showId}
                  />
                )}
                
                {currentStepId === 'handler-assignment' && (
                  <HandlerAssignmentStep
                    selectedDogs={optimisticState.formData.selectedDogs}
                    classSelections={optimisticState.classSelections}
                    handlerAssignments={optimisticState.handlerAssignments}
                    onHandlerAssignmentChange={handleHandlerAssignmentChange}
                    showId={showId}
                  />
                )}
                
                {currentStepId === 'payment' && (
                  <PaymentErrorBoundary>
                    <PaymentStep
                      selectedDogs={optimisticState.formData.selectedDogs}
                      classSelections={optimisticState.classSelections}
                      paymentMethod={optimisticState.formData.paymentMethod || ''}
                      paymentStatus={optimisticState.paymentStatus}
                      entryStatus={optimisticState.entryStatus}
                      onPaymentMethodChange={(method) => 
                        setRegistrationData(prev => ({ 
                          ...prev,
                          paymentMethod: method as 'credit_card' | 'check' | 'cash'
                        }))
                      }
                      onPaymentStatusChange={async (status: PaymentStatus) => {
                        setPaymentStatus(status);
                        if (registrationId) {
                          try {
                            await updatePaymentStatusOptimistic(registrationId, status);
                          } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : 'Failed to update payment status';
                            showError(errorMessage);
                          }
                        }
                      }}
                      onEntryStatusChange={async (status: EntryStatus, reason?: string) => {
                        setEntryStatus(status);
                        if (registrationId) {
                          try {
                            await updateEntryStatusOptimistic(registrationId, status, reason);
                          } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : 'Failed to update entry status';
                            showError(errorMessage);
                          }
                        }
                      }}
                      showId={showId}
                      registrationId={registrationId}
                    />
                  </PaymentErrorBoundary>
                )}
                
                {currentStepId === 'confirmation' && (
                  <ConfirmationStep
                    registrationNumber={registrationNumber}
                    selectedDogs={optimisticState.formData.selectedDogs}
                    classSelections={optimisticState.classSelections}
                    documents={optimisticState.formData.documents}
                    paymentMethod={optimisticState.formData.paymentMethod || ''}
                    paymentStatus={optimisticState.paymentStatus}
                    entryStatus={optimisticState.entryStatus}
                    totalFees={currentRegistration?.totalFees || 0}
                    showId={showId}
                    onDownloadReceipt={() => console.log('Download receipt')}
                    onSendEmail={() => console.log('Send email')}
                    onStatusChange={async (dogId: string, status: EntryStatus) => {
                      setEntryStatus(status);
                      if (registrationId) {
                        try {
                          await updateEntryStatusOptimistic(registrationId, status);
                        } catch (error: unknown) {
                          const errorMessage = error instanceof Error ? error.message : 'Failed to update entry status';
                          showError(errorMessage);
                        }
                      }
                    }}
                    onNotificationToggle={(type, enabled) => {
                      console.log(`Notification ${type}: ${enabled}`);
                      // Here you would integrate with notification service
                    }}
                  />
                )}
              </div>
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

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        conflict={selectedConflict}
        isOpen={!!selectedConflict}
        onClose={() => setSelectedConflictId(null)}
        onResolve={resolveRegistrationConflict}
        onDismiss={dismissConflict}
      />
    </RegistrationErrorBoundary>
  );
}