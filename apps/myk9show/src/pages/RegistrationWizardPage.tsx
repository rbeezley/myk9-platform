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

import { useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notifications } from '@/lib/notifications';
import { helpUrl } from '@/lib/help';
import { cn } from '@/lib/utils';
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
import { RegistrationWizardShell } from '@/components/shows/RegistrationWorkflow/RegistrationWizardShell';
import { useRegistrationWizard } from './RegistrationWizardPage/useRegistrationWizard';
import { getPaymentSubmitLabel } from './RegistrationWizardPage/commitLabels';

/** Stable id so the Next button can point at the blocked-reason text. */
const PROCEED_BLOCKED_ID = 'registration-wizard-blocked-reason';

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
    entryCloseAvailability,
    isLastStep,
    isLateEntryMode,
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
    capacityReady,
    capacityError,
    capacityUnavailable,
    refetchClassAvailability,
    waitlistClassIds,
    blockedClassIds,
    armbandAssignments,
    entryOutcomes,
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

  const showBlockedReason = !!proceedBlocked && !isSubmitting;

  // Move focus to the step heading whenever the step changes. Without this the
  // wizard scrolls but focus stays put — and on the payment -> receipt swap the
  // focused Next button is unmounted entirely, dropping focus to <body> so a
  // keyboard user restarts from the top of the document. Focusing a heading
  // that names the step also announces where they now are.
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const hasMountedStep = useRef(false);
  useEffect(() => {
    if (!hasMountedStep.current) {
      // Don't steal focus on first render — the user has just navigated here.
      hasMountedStep.current = true;
      return;
    }
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [currentStep]);

  return (
    <RegistrationErrorBoundary>
      <RegistrationWizardShell
        rootRef={scrollTopRef}
        isInsideSidebar={isInsideSidebar}
        header={
          <div className="container mx-auto px-4 py-3 max-w-7xl sm:px-6">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              {/* size="touch", not "default": default is h-10 (measured 181x40
                  in Chrome), under the 44px floor. The sibling exit on the
                  entry-closed panel already carries min-h-[44px]; this one is
                  the only way out of the wizard on every other step. */}
              <Button
                variant="ghost"
                size="touch"
                onClick={handleExit}
                className="gap-2 hover:-translate-y-0.5 transition-all duration-300"
              >
                <ArrowLeft className="h-4 w-4" />
                {exitTarget.label}
              </Button>
              {/* min-w-0 is load-bearing: without it this flex child cannot
                  shrink below its content, so the truncate on the show name
                  never engages and the row overflows at 375px. */}
              <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <span>Shows</span>
                <span>/</span>
                <span className="truncate max-w-[200px]">{currentShow?.name || 'Show'}</span>
                <span>/</span>
                <span className="text-foreground font-medium">{workflowLabel}</span>
              </div>
              {/* Contextual deep-link to the guide for whoever is actually driving
                  the wizard. F17: this always pointed at the exhibitor guide, so a
                  secretary taking a mail-in or late entry was sent to instructions
                  written for the person entering their own dog. */}
              <a
                href={helpUrl(
                  currentWorkflowMode === 'exhibitor' ? 'exhibitor-guide' : 'secretary-guide'
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <HelpCircle className="h-4 w-4" />
                Help
              </a>
            </div>

            {/* Title + horizontal step indicator */}
            <div className="mt-3">
              <h1 className="text-base font-semibold text-foreground">{sidebarTitle}</h1>
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
        }
        footer={
          entryCloseAvailability.canEnter ? (
            <>
              <p
                id={PROCEED_BLOCKED_ID}
                role="status"
                className={cn(
                  'mb-3 text-sm text-muted-foreground',
                  !showBlockedReason && 'sr-only'
                )}
              >
                {showBlockedReason ? proceedBlocked : ''}
              </p>
              {isLastStep ? (
                <ReceiptExits
                  isExhibitor={currentWorkflowMode === 'exhibitor'}
                  showId={showId}
                  onDone={handleNext}
                  doneLabel={
                    currentWorkflowMode === 'exhibitor'
                      ? undefined
                      : isLateEntryMode
                        ? 'Return to Show Desk'
                        : 'Return to Entry Management'
                  }
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
                  nextLabel={
                    currentStepId === 'payment'
                      ? getPaymentSubmitLabel(registrationData.paymentMethod)
                      : 'Next'
                  }
                  backLabel={currentStep === 0 ? 'Cancel' : 'Back'}
                  isLoading={isSubmitting}
                  {...(showBlockedReason ? { blockedReasonId: PROCEED_BLOCKED_ID } : {})}
                />
              )}
            </>
          ) : null
        }
      >
        {entryCloseAvailability.canEnter && (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <h2
                ref={stepHeadingRef}
                tabIndex={-1}
                className="text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {steps[currentStep]?.label}
                <span className="sr-only">{` — step ${currentStep + 1} of ${steps.length}`}</span>
              </h2>
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

            <div className="mb-6 border-t border-border" />
          </>
        )}

        {!entryCloseAvailability.canEnter ? (
          <div className="mx-auto max-w-2xl rounded-xl border border-border bg-muted/30 p-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {entryCloseAvailability.unavailableReason === 'not_yet_open'
                ? 'Entries not open yet'
                : 'Entries closed'}
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              {entryCloseAvailability.unavailableReason === 'not_yet_open'
                ? 'This show is not accepting online entries yet.'
                : 'This show is no longer accepting normal online entries.'}
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {entryCloseAvailability.reason ??
                'Contact the show team if you need help with a late entry or a change.'}
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild className="min-h-[44px]">
                <Link to={entryCloseAvailability.recoveryHref}>Message the show team</Link>
              </Button>
              <Button variant="outline" className="min-h-[44px]" onClick={handleExit}>
                {exitTarget.label}
              </Button>
            </div>
          </div>
        ) : (
          <>
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

            {/* The page h1 is the wizard title and the step components render
                h3s, so without this the heading tree skips a level. It also
                gives a screen-reader user the current step by name at the point
                the step's own content begins. */}
            {/* Step content */}
            <WorkflowStepContent
              currentStepId={currentStepId}
              currentWorkflowConfig={currentWorkflowConfig}
              currentWorkflowMode={currentWorkflowMode}
              registrationData={registrationData}
              optimisticState={optimisticState}
              showId={showId}
              registrationId={registrationId}
              registrationNumber={registrationNumber}
              currentRegistrationTotalFees={liveTotalFees}
              capacityReady={capacityReady}
              capacityError={capacityError}
              capacityUnavailable={capacityUnavailable}
              onRetryAvailability={refetchClassAvailability}
              waitlistClassIds={waitlistClassIds}
              blockedClassIds={blockedClassIds}
              armbandAssignments={armbandAssignments}
              entryOutcomes={entryOutcomes}
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
              offlineFirstCreate={isLateEntryMode && currentWorkflowMode !== 'exhibitor'}
              agreedToEntryAgreement={agreedToEntryAgreement}
              onAgreementChange={setAgreedToEntryAgreement}
            />
          </>
        )}
      </RegistrationWizardShell>
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
