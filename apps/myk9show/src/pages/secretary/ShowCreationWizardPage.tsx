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
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useUserStore } from '@/store/userStore';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
import { getShowOfficials } from '@/hooks/queries/useShowOfficials';
import HorizontalProgressIndicator from '@/components/shows/wizard/components/HorizontalProgressIndicator';
import WizardNavigation from '@/components/shows/wizard/components/WizardNavigation';
import { PanelProvider, PanelStack } from '@/components/panels';
import {
  WIZARD_STEPS,
  type EditMode,
  type CreatedShow,
  getEditModeTitle,
  getValidationMessagesForStep,
  buildEditModeDraft,
  WizardSuccessOverlay,
  WizardValidationBanner,
  WizardHeader,
  WizardStepContent,
} from './ShowCreationWizard';
import { useShowCreationWizardActions } from './ShowCreationWizard/useShowCreationWizardActions';

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

  const editModeInitializedRef = useRef<string | null>(null);

  // Extract edit mode from URL params
  const editMode: EditMode | undefined = (() => {
    const showId = searchParams.get('showId');
    const mode = searchParams.get('mode') as 'add-trials' | 'add-classes' | 'edit-show' | null;
    return showId && mode ? { showId, mode } : undefined;
  })();

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
  } = useWizardStore();

  const { shows: zustandShows } = useShowStore();
  const { data: queryShows = [] } = useShowsQuery();
  const { trials: existingTrials } = useTrialStore();
  const { classes: existingClasses } = useClassStoreCompat();
  const { people, loadPeople } = useUserStore();

  // Initialize wizard actions
  const { handleSaveDraft, handleCreateShow, handleCreateAndPublish, handleSaveProgress } =
    useShowCreationWizardActions({
      editMode,
      setIsLoading,
      onCreated: (id, name, passcodes) => setCreatedShow({ id, name, passcodes }),
    });

  // Reset wizard state when entering fresh create mode (not edit mode)
  // so stale drafts from previous sessions don't persist.
  const hasResetRef = React.useRef(false);
  useEffect(() => {
    if (!editMode && !hasResetRef.current) {
      hasResetRef.current = true;
      resetWizard();
    }
  }, [editMode, resetWizard]);

  // Pre-select club when navigating from a club details page
  const preselectedClubId = searchParams.get('clubId');
  const { updateShowData } = useWizardStore();
  useEffect(() => {
    if (preselectedClubId && !editMode && !show.clubId) {
      updateShowData({ clubId: preselectedClubId });
    }
  }, [preselectedClubId, editMode, show.clubId, updateShowData]);

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

  // Merge Zustand and React Query show sources for lookups
  const allShows = React.useMemo(() => {
    const seen = new Set<string>();
    const merged = [...zustandShows];
    for (const s of merged) seen.add(s.id);
    for (const s of queryShows) {
      if (!seen.has(s.id)) merged.push(s);
    }
    return merged;
  }, [zustandShows, queryShows]);

  // Initialize wizard with existing show data in edit mode (once per showId)
  useEffect(() => {
    if (editMode) {
      const existingShow = allShows.find(s => s.id === editMode.showId);
      const showTrials = existingTrials.filter(t => t.showId === editMode.showId);
      const showTrialIds = new Set(showTrials.map(trial => trial.id));
      const existingClassCountForShow = existingClasses.filter(c =>
        showTrialIds.has(c.trialId)
      ).length;
      const initializationKey =
        editMode.mode === 'add-trials'
          ? `${editMode.showId}:${editMode.mode}`
          : `${editMode.showId}:${editMode.mode}:${existingClassCountForShow}`;

      if (existingShow && editModeInitializedRef.current !== initializationKey) {
        editModeInitializedRef.current = initializationKey;

        const draft = buildEditModeDraft({
          editMode,
          existingShow,
          showTrials,
          existingClasses,
          people,
        });

        // Load draft immediately with empty officials, then backfill asynchronously
        loadDraft(draft);

        getShowOfficials(existingShow.id)
          .then(o => {
            useWizardStore.setState(state => ({
              show: {
                ...state.show,
                officials: {
                  secretary: o.secretaries.map(s => s.personId),
                  chairman: o.chairmen.map(c => c.personId),
                  steward: o.stewards.map(s => s.personId),
                },
              },
            }));
          })
          .catch(() => {
            // Officials fetch failed — keep empty defaults
          });
      }
    }
  }, [editMode, allShows, existingTrials, loadDraft, people, existingClasses]);

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

  const handleNext = useCallback(async () => {
    setHasAttemptedNext(true);

    // Check validation before allowing navigation
    const messages = getValidationMessagesForStep(currentStep, show, trials);
    if (messages.length > 0) {
      // Validation failed — surface the banner, expand it, and scroll it into
      // view. Next stays enabled (see canGoNext) so this click actually fires
      // instead of the button sitting disabled with no explanation.
      setValidationExpanded(true);
      pendingBannerScrollRef.current = true;
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
  }, [currentStep, markStepCompleted, setCurrentStep, show, trials]);

  // Step navigation validation
  const canGoBack = !isLoading;

  // Get validation messages for current step
  const validationMessages = getValidationMessagesForStep(currentStep, show, trials);

  // Keep Next clickable whenever we're not mid-submit. It is deliberately NOT
  // gated on validation: a disabled Next just sits there doing nothing when a
  // required field is missing (the secretary clicks and is left guessing). Now
  // the click always fires handleNext, which either advances or surfaces the
  // validation banner + inline "N required fields remaining" hint. Decoupled
  // from completedSteps to avoid auto-advance from markStepCompleted side
  // effects during re-renders.
  const canGoNext = !isLoading;

  // Scroll the validation banner into view after a failed Next attempt, once it
  // has actually mounted. Guarded by a ref flag so it only fires on the click,
  // not on every re-render as fields are corrected. scrollIntoView is a no-op
  // stub in jsdom, hence the typeof guard.
  useEffect(() => {
    if (pendingBannerScrollRef.current && validationBannerRef.current) {
      pendingBannerScrollRef.current = false;
      if (typeof validationBannerRef.current.scrollIntoView === 'function') {
        validationBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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
            onGoToDashboard={() => {
              setCreatedShow(null);
              resetWizard();
              navigate('/secretary/dashboard');
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
                <WizardStepContent
                  currentStep={currentStep}
                  editMode={editMode}
                  existingTrials={existingTrials}
                  existingClasses={existingClasses}
                  hasAttemptedNext={hasAttemptedNext}
                  isLoading={isLoading}
                  onSaveDraft={handleSaveDraft}
                  onCreateShow={handleCreateShow}
                  onCreateAndPublish={handleCreateAndPublish}
                  onBack={handleBack}
                />
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
                  onSaveDraft={isDirty ? handleSaveProgress : undefined}
                  isLoading={isLoading}
                  remainingRequiredCount={validationMessages.length}
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
