import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useWizardStore } from '@/store/wizardStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useUserStore } from '@/store/userStore';
import HorizontalProgressIndicator from '@/components/shows/wizard/components/HorizontalProgressIndicator';
import WizardNavigation from '@/components/shows/wizard/components/WizardNavigation';
import { PanelProvider, PanelStack } from '@/components/panels';
import {
  WIZARD_STEPS,
  type EditMode,
  type CreatedShow,
  getEditModeTitle,
  getValidationMessagesForStep,
  WizardSuccessOverlay,
  WizardValidationBanner,
  WizardHeader,
  WizardStepContent,
  WizardEditModeGate,
  WizardDraftResumeBanner,
  shouldOfferDraftResume,
  useEditModeInitialization,
  useWritableEditModeResolution,
  parseEditMode,
} from './ShowCreationWizard';
import { useShowCreationWizardActions } from './ShowCreationWizard/useShowCreationWizardActions';
import { applyReturnedClubId } from './ShowCreationWizard/applyReturnedClubId';

const ShowCreationWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [validationExpanded, setValidationExpanded] = useState(false);
  const [hasAttemptedNext, setHasAttemptedNext] = useState(false);
  const [createdShow, setCreatedShow] = useState<CreatedShow | null>(null);
  const stepContentRef = useRef<HTMLDivElement>(null);
  const validationBannerRef = useRef<HTMLDivElement>(null);
  // Set by a failed Next click so the effect below scrolls the banner into
  // view once it has mounted. A ref (not state) keeps this a one-shot signal
  // that doesn't re-fire as the secretary fixes fields.
  const pendingBannerScrollRef = useRef(false);

  // Extract edit mode from URL params. `parseEditMode` allowlists the two modes
  // the app actually links to; previously an unchecked `as` cast turned ANY
  // string into an EditModeType.
  const editMode: EditMode | undefined = parseEditMode(
    searchParams.get('showId'),
    searchParams.get('mode')
  );

  const {
    currentStep,
    completedSteps,
    isDirty,
    setCurrentStep,
    markStepCompleted,
    goToStep,
    resetWizard,
    loadDraft,
    show,
    trials,
    lastSaved,
  } = useWizardStore();

  // DERIVED, never latched on mount. `getOptimalStorage` returns an async
  // `getItem` on BOTH branches, so zustand's persist middleware hydrates
  // asynchronously in every environment -- a useState initializer here read the
  // pristine store and the banner could never render on the one mount that
  // matters, leaving the removed reset-on-mount with no replacement guard.
  //
  // `!isDirty` is what keeps it from appearing as soon as the secretary types
  // the first character of a genuinely new show: `isDirty` is not persisted, so
  // a rehydrated draft always arrives clean, while live typing sets it true.
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const hasResumableDraft = shouldOfferDraftResume({
    isEditMode: Boolean(editMode),
    dismissed: resumeDismissed,
    isDirty,
    showName: show.name,
    trialCount: trials.length,
  });

  const { trials: existingTrials } = useTrialStore();
  const { classes: existingClasses } = useClassStoreCompat();
  const { people, loadPeople } = useUserStore();

  // Initialize wizard actions
  const { handleCreateShow } = useShowCreationWizardActions({
    editMode,
    setIsLoading,
    onCreated: (id, name, passcodes, passcodeError) =>
      setCreatedShow({ id, name, passcodes, passcodeError: passcodeError ?? null }),
  });

  // NOTE: deliberately no reset-on-mount. It used to destroy the persisted
  // draft on every fresh create, losing the secretary's show setup while a
  // "Save Draft" button claimed the opposite.

  // Pre-select club when navigating from a club details page
  const preselectedClubId = searchParams.get('clubId');
  const { updateShowData } = useWizardStore();
  useEffect(() => {
    applyReturnedClubId(preselectedClubId, editMode, updateShowData);
  }, [preselectedClubId, editMode, updateShowData]);

  // Load people data when page mounts (clubs handled by global store subscriptions)
  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  // Keyboard navigation handler - Escape to prompt save draft
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDirty) {
        // Don't trigger if a popover, dropdown, or dialog overlay is open —
        // Escape should only close the innermost overlay (e.g., date picker)
        const hasOpenOverlay = document.querySelector(
          '[data-open], [data-state="open"], [role="dialog"], [role="alertdialog"]'
        );
        if (hasOpenOverlay) return;

        e.preventDefault();
        setShowConfirmDialog(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty]);

  // Focus first input when step changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (stepContentRef.current) {
        const firstInput = stepContentRef.current.querySelector<HTMLInputElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
        );
        if (firstInput && typeof firstInput.focus === 'function') {
          firstInput.focus();
        }
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [currentStep]);

  // Is the edit-mode target show available to the same store that will write it?
  const { editModeResolution, retryWritableShow } = useWritableEditModeResolution(editMode);

  const { officialsUnavailable, resetInitialization } = useEditModeInitialization({
    editMode,
    editModeResolution,
    existingTrials,
    existingClasses,
    people,
    isDirty,
    loadDraft,
  });

  const handleRetryWritableShow = useCallback(() => {
    resetInitialization();
    retryWritableShow();
  }, [resetInitialization, retryWritableShow]);

  // Handle wizard close
  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowConfirmDialog(true);
      return;
    }
    navigate('/shows');
  }, [isDirty, navigate]);

  // Handle confirmation dialog result
  const handleConfirmClose = useCallback(() => {
    resetWizard();
    navigate('/shows');
    setShowConfirmDialog(false);
  }, [resetWizard, navigate]);

  // Navigation handlers
  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else {
      handleClose();
    }
  }, [currentStep, setCurrentStep, handleClose]);

  // Scroll the validation banner into view. scrollIntoView is a no-op stub in
  // jsdom, hence the typeof guard. Stable identity so handleNext/the effect can
  // depend on it.
  const scrollBannerIntoView = useCallback(() => {
    const el = validationBannerRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleNext = useCallback(async () => {
    setHasAttemptedNext(true);

    // Check validation before allowing navigation
    const messages = getValidationMessagesForStep(currentStep, show, trials);
    if (messages.length > 0) {
      // Validation failed — surface the banner, expand it, and scroll it into
      // view. Next stays enabled (see canGoNext) so this click actually fires
      // instead of the button sitting disabled with no explanation.
      setValidationExpanded(true);
      if (validationBannerRef.current) {
        // Banner already mounted (a repeat failed click) — scroll now. We can't
        // rely on the post-render effect here: setState above is a no-op when
        // the values are unchanged, so React may skip the re-render entirely.
        scrollBannerIntoView();
      } else {
        // First failed attempt — the banner mounts on the render this click
        // triggers. Defer the scroll to the effect below, which fires once it's
        // in the DOM. (Not left set on the repeat path, so no stray delayed
        // scroll during later field edits.)
        pendingBannerScrollRef.current = true;
      }
      return;
    }

    setIsLoading(true);

    try {
      // Mark step complete only after validation passes
      markStepCompleted(currentStep);

      if (currentStep < WIZARD_STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
        setHasAttemptedNext(false); // Reset for next step
      }
    } catch (error) {
      logger.error('Error in wizard navigation', 'wizard', {}, error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentStep, markStepCompleted, setCurrentStep, show, trials, scrollBannerIntoView]);

  // Step navigation validation
  const canGoBack = !isLoading;

  // Get validation messages for current step
  const validationMessages = getValidationMessagesForStep(currentStep, show, trials);

  // Keep Next clickable whenever we're not mid-submit. It is deliberately NOT
  // gated on validation: a disabled Next just sits there doing nothing when the
  // step is incomplete (the secretary clicks and is left guessing). Now the
  // click always fires handleNext, which either advances or surfaces the
  // validation banner + inline "N items remaining" hint. Decoupled from
  // completedSteps to avoid auto-advance from markStepCompleted side effects
  // during re-renders.
  const canGoNext = !isLoading;

  // First-mount scroll: on the first failed Next the banner mounts on the
  // triggered render, so handleNext defers the scroll here. Guarded by the ref
  // flag so it fires exactly once per first-attempt, not on every re-render as
  // fields are corrected. Repeat clicks scroll synchronously in handleNext.
  useEffect(() => {
    if (pendingBannerScrollRef.current && validationBannerRef.current) {
      pendingBannerScrollRef.current = false;
      scrollBannerIntoView();
    }
  });

  // Wizard state is reset explicitly on cancel (handleConfirmClose) or
  // successful creation (saveShow). No unmount cleanup needed — the Zustand
  // persist middleware preserves form data across navigations so users don't
  // lose work if they briefly leave the page.

  return (
    <PanelProvider
      onEntityCreated={(entity, context) => {
        logger.debug('Entity created', 'wizard', {
          entityName: entity.name || entity.id,
          entityType: context.entityType,
        });
        if (context.selectionCallback) {
          context.selectionCallback(entity);
        }
      }}
      onPanelResult={(panelId, result) => {
        logger.debug('Panel result', 'wizard', {
          panelId,
          action: result.action,
          success: result.success,
        });
      }}
    >
      <div className="min-h-screen bg-background">
        {/* Success overlay — shown after show creation, before navigating away */}
        {createdShow && (
          <WizardSuccessOverlay
            createdShow={createdShow}
            onReviewShow={() => {
              const createdShowId = createdShow.id;
              setCreatedShow(null);
              resetWizard();
              navigate(`/shows/${createdShowId}`);
            }}
          />
        )}

        {/* Header with breadcrumb and back button */}
        <WizardHeader editMode={editMode} onClose={handleClose} />

        <div className="container mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
          {/* Title */}
          <h2 className="text-base font-semibold mb-4 text-foreground">
            {getEditModeTitle(editMode) ?? 'Create New Show'}
          </h2>

          {/* Horizontal step indicator — sticky under the page header so the
              steps stay visible while the form scrolls. Kept a direct child of
              the tall container (not nested in a short title wrapper) so it
              sticks for the whole scroll, not just while the title is on screen. */}
          <div className="sticky top-16 z-30 mb-4 rounded-2xl border border-border bg-card px-3 py-4 shadow-sm sm:mb-6 sm:px-6 sm:py-5">
            <HorizontalProgressIndicator
              steps={WIZARD_STEPS}
              currentStep={currentStep}
              completedSteps={completedSteps}
              onStepClick={goToStep}
            />
          </div>

          {/* Main Content — flat cream worksheet region (not a card) so the inner
              step cards are the single lifting card layer, never card-in-card. */}
          <div className="relative flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-background sm:min-h-[700px]">
            {hasResumableDraft && (
              <WizardDraftResumeBanner
                lastSaved={lastSaved}
                onStartFresh={() => {
                  resetWizard();
                  setResumeDismissed(true);
                }}
              />
            )}

            {officialsUnavailable && (
              <div
                className="border-b border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground sm:px-6"
                role="alert"
              >
                We couldn&rsquo;t load this show&rsquo;s current officials, so the Officials fields
                below may look empty even if people are already assigned. Check them before saving.
              </div>
            )}

            {/* Collapsible Validation Banner — only shown after user clicks Next.
                Wrapped so handleNext can scroll it into view on a failed attempt. */}
            {hasAttemptedNext && validationMessages.length > 0 && (
              <div ref={validationBannerRef}>
                <WizardValidationBanner
                  messages={validationMessages}
                  expanded={validationExpanded}
                  onToggle={() => setValidationExpanded(!validationExpanded)}
                />
              </div>
            )}

            {/* Step Content with Transition */}
            <div className="relative flex-1 overflow-auto">
              <div
                ref={stepContentRef}
                key={currentStep}
                className="animate-in fade-in slide-in-from-right-4 p-4 duration-300 sm:p-8"
                role="region"
                aria-label={`Step ${currentStep + 1}: ${WIZARD_STEPS[currentStep]?.label}`}
              >
                {editModeResolution.state === 'loading' ||
                editModeResolution.state === 'unavailable' ? (
                  <WizardEditModeGate
                    state={editModeResolution.state}
                    onRetry={handleRetryWritableShow}
                    onLeave={() => navigate('/shows')}
                  />
                ) : (
                  <WizardStepContent
                    currentStep={currentStep}
                    editMode={editMode}
                    existingTrials={existingTrials}
                    existingClasses={existingClasses}
                    hasAttemptedNext={hasAttemptedNext}
                    isLoading={isLoading}
                    onCreateShow={handleCreateShow}
                    onBack={handleBack}
                    officialsUnknown={officialsUnavailable}
                  />
                )}
              </div>
            </div>

            {/* Navigation - Fixed at bottom, hidden on Review step */}
            {currentStep < WIZARD_STEPS.length - 1 && (
              <div className="relative border-t bg-muted/20 p-4 sm:p-6 rounded-b-2xl">
                <WizardNavigation
                  currentStep={currentStep}
                  totalSteps={WIZARD_STEPS.length}
                  canGoBack={canGoBack}
                  canGoNext={canGoNext}
                  onBack={handleBack}
                  onNext={handleNext}
                  isLoading={isLoading}
                  remainingIssueCount={validationMessages.length}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panel Stack for slide-over panels */}
      <PanelStack maxPanels={3} />

      {/* Unsaved Changes Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes that will be lost. Are you sure you want to leave the wizard?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClose}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              Leave Wizard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelProvider>
  );
};

export default ShowCreationWizardPage;
