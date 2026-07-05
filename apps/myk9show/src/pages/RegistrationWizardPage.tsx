/**
 * Registration Wizard Page
 *
 * Full-page wizard for show registration with a horizontal step indicator.
 * Replaces the old dialog-based RegistrationWorkflow.
 *
 * All stateful orchestration lives in `useRegistrationWizard`; this file is
 * intentionally thin — chrome, step indicator, and step content wired to the
 * hook's values and handlers.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notifications } from '@/lib/notifications';
import { helpUrl } from '@/lib/help';
import type { PaymentMethod, PaymentDetails } from '@/types/show-registration-types';
import type { PaymentStatus, EntryStatus } from '@/types/show-registration-types';
import { useShowStore } from '@/store/showStore';
import { RegistrationErrorBoundary } from '@/components/common/ErrorBoundary';
import { DraftManager } from '@/components/shows/RegistrationWorkflow/DraftManager';
import { RegistrationProvider } from '@/context/RegistrationContext';
import HorizontalProgressIndicator from '@/components/shows/wizard/components/HorizontalProgressIndicator';
import WizardNavigation from '@/components/shows/wizard/components/WizardNavigation';
import { ReceiptExits } from '@/components/shows/wizard/components/ReceiptExits';
import { WorkflowStepContent } from '@/components/shows/RegistrationWorkflow/WorkflowStepContent';
import { useRegistrationWizard } from './RegistrationWizardPage/useRegistrationWizard';
import { getPaymentSubmitLabel } from './RegistrationWizardPage/commitLabels';

function RegistrationWizardContent() {
  const wiz = useRegistrationWizard();
  const {
    scrollTopRef,
    isInsideSidebar,
    exitTarget,
    workflowLabel,
    sidebarTitle,
    workflowSubtitle,
    currentShow,
    steps,
    currentStep,
    completedSteps,
    currentStepId,
    isLastStep,
    currentWorkflowMode,
    handleStepClick,
    draftSave,
    draftLoad,
    draftDelete,
    availableDrafts,
    clearAllDrafts,
    hasUnsavedChanges,
    handleDraftLoaded,
    currentWorkflowConfig,
    registrationData,
    optimisticState,
    showId,
    registrationId,
    registrationNumber,
    liveTotalFees,
    armbandAssignments,
    ownerResolution,
    dogsLoading,
    agreedToEntryAgreement,
    setAgreedToEntryAgreement,
    setPaymentStatus,
    setEntryStatus,
    handleDogSelectionChange,
    handleClassSelectionChange,
    handleHandlerAssignmentChange,
    handlePaymentMethodChange,
    handlePaymentDetailsChange,
    handlePaymentStatusChange,
    handleEntryStatusChange,
    proceedBlocked,
    canProceed,
    isSubmitting,
    handleNext,
    handleBack,
    handleExit,
  } = wiz;

  return (
    <RegistrationErrorBoundary>
      <div
        ref={scrollTopRef}
        className={isInsideSidebar ? 'bg-background' : 'min-h-screen bg-background'}
      >
        {/* Sticky header stack — breadcrumb + title + step indicator as ONE
            sticky unit. Keeping them together means the stepper can never slide
            under the breadcrumb: the previous separate top-28 offset was
            inherited from the vertical sidebar and didn't clear this header's own
            height. One sticky element has no offset to mis-tune. */}
        <div
          className={`border-b bg-card/95 backdrop-blur-xl sticky ${isInsideSidebar ? 'top-0' : 'top-16'} z-40`}
        >
          <div className="container mx-auto px-4 py-3 max-w-7xl sm:px-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <Button
                variant="ghost"
                size="default"
                onClick={handleExit}
                className="gap-2 hover:-translate-y-0.5 transition-all duration-300"
              >
                <ArrowLeft className="h-4 w-4" />
                {exitTarget.label}
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Shows</span>
                <span>/</span>
                <span className="truncate max-w-[200px]">{currentShow?.name || 'Show'}</span>
                <span>/</span>
                <span className="text-foreground font-medium">{workflowLabel}</span>
              </div>
              {/* Contextual deep-link to the public exhibitor guide. */}
              <a
                href={helpUrl('exhibitor-guide')}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <HelpCircle className="h-4 w-4" />
                Help
              </a>
            </div>

            {/* Title + horizontal step indicator */}
            <div className="mt-3">
              <h2 className="text-base font-semibold text-foreground">{sidebarTitle}</h2>
              {workflowSubtitle && (
                <p className="text-sm text-muted-foreground">{workflowSubtitle}</p>
              )}
              {currentShow && (
                <p className="text-xs text-muted-foreground truncate">{currentShow.name}</p>
              )}
              <div className="mt-3">
                <HorizontalProgressIndicator
                  steps={steps}
                  currentStep={currentStep}
                  completedSteps={completedSteps}
                  onStepClick={handleStepClick}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 pt-6 pb-8 max-w-7xl">
          {/* Main Content */}
          <div className="bg-card border border-border rounded-2xl shadow-sm min-h-[600px] flex flex-col">
            <div className="flex-1 p-4 sm:p-8">
              {/* Draft controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
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
                onPaymentMethodChange={(method: PaymentMethod) => handlePaymentMethodChange(method)}
                onPaymentDetailsChange={(details: PaymentDetails) =>
                  handlePaymentDetailsChange(details)
                }
                onPaymentStatusChange={(regId: string, status: PaymentStatus) =>
                  handlePaymentStatusChange(regId, status)
                }
                onEntryStatusChange={(regId: string, status: EntryStatus, reason?: string) =>
                  handleEntryStatusChange(regId, status, reason)
                }
                setPaymentStatus={setPaymentStatus}
                setEntryStatus={setEntryStatus}
                dogsLoading={dogsLoading}
                agreedToEntryAgreement={agreedToEntryAgreement}
                onAgreementChange={setAgreedToEntryAgreement}
              />
            </div>

            {/* Navigation */}
            <div className="relative px-4 sm:px-8 pb-6 sm:pb-8">
              {proceedBlocked && !isSubmitting && (
                <p role="status" className="mb-3 text-sm text-muted-foreground">
                  {proceedBlocked}
                </p>
              )}
              {isLastStep ? (
                // The entry is already committed — this is the Receipt. No "Back"
                // (it implied the submit could be undone); forward exits only (4.A).
                <ReceiptExits
                  isExhibitor={currentWorkflowMode === 'exhibitor'}
                  showId={showId}
                  onDone={handleNext}
                  isLoading={isSubmitting}
                />
              ) : (
                <WizardNavigation
                  currentStep={currentStep}
                  totalSteps={steps.length}
                  canGoBack={true}
                  canGoNext={canProceed()}
                  onBack={handleBack}
                  onNext={handleNext}
                  // The Payment "Next" IS the commit — say so, method-aware (4.A).
                  nextLabel={
                    currentStepId === 'payment'
                      ? getPaymentSubmitLabel(registrationData.paymentMethod)
                      : 'Next'
                  }
                  backLabel={currentStep === 0 ? 'Cancel' : 'Back'}
                  isLoading={isSubmitting}
                />
              )}
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
