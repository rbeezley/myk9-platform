import React, { useState, useCallback, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { AlertTriangle, ArrowLeft, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { MyK9QAccessCard } from '@/components/secretary/MyK9QAccessCard';
import { Button } from '@/components/ui/button';
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
import VerticalProgressIndicator from '@/components/shows/wizard/components/VerticalProgressIndicator';
import WizardNavigation from '@/components/shows/wizard/components/WizardNavigation';
import ShowDetailsStep from '@/components/shows/wizard/steps/ShowDetailsStep';
import TrialConfigurationStep from '@/components/shows/wizard/steps/TrialConfigurationStep';
import ClassSelectionStep from '@/components/shows/wizard/steps/ClassSelectionStep';
import ReviewStep from '@/components/shows/wizard/steps/ReviewStep';
import { PanelProvider, PanelStack } from '@/components/panels';
import { WIZARD_STEPS, type EditMode } from './ShowCreationWizard';
import { getValidationMessagesForStep } from './ShowCreationWizard/showCreationWizardValidation';
import { useShowCreationWizardActions } from './ShowCreationWizard/useShowCreationWizardActions';

const ShowCreationWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [validationExpanded, setValidationExpanded] = useState(false);
  const [hasAttemptedNext, setHasAttemptedNext] = useState(false);
  const [createdShow, setCreatedShow] = useState<{ id: string; name: string } | null>(null);
  const stepContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!createdShow) return;
    // Two-burst confetti: immediate burst from both sides, then a second pop
    const fire = (opts: confetti.Options) =>
      confetti({ zIndex: 9999, disableForReducedMotion: true, ...opts });
    fire({ particleCount: 80, spread: 70, origin: { x: 0.3, y: 0.6 } });
    fire({ particleCount: 80, spread: 70, origin: { x: 0.7, y: 0.6 } });
    const t = setTimeout(() => {
      fire({ particleCount: 50, spread: 100, origin: { x: 0.5, y: 0.5 }, scalar: 0.8 });
    }, 350);
    return () => clearTimeout(t);
  }, [createdShow]);
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
      onCreated: (id, name) => setCreatedShow({ id, name }),
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

        // In add-trials mode, don't load existing trials — start fresh.
        // Existing trials should be edited via Edit Trial on the trial detail page.
        const wizardTrials =
          editMode.mode === 'add-trials'
            ? []
            : showTrials.map(trial => {
                const trialClasses = existingClasses.filter(c => c.trialId === trial.id);

                const wizardClasses = trialClasses.map(classData => {
                  let judgeId = '';
                  if (classData.judge && classData.judge !== 'TBD') {
                    const matchingJudge = existingShow.assignedJudges?.find(
                      j => j.judgeName === classData.judge
                    );
                    if (matchingJudge) {
                      judgeId = matchingJudge.judgeId;
                    }
                  }

                  return {
                    templateId: classData.templateId || '',
                    customizations: {
                      className: classData.className,
                      element: classData.element,
                      level: classData.level,
                      section: classData.section,
                      fieldOverrides: {},
                    },
                    judgeId: judgeId,
                  };
                });

                return {
                  id: trial.id,
                  name: trial.type || trial.name || 'Trial',
                  dateTime: trial.trialDate,
                  eventNumber: trial.eventNumber || '',
                  trialType: trial.trialType || undefined,
                  classes: wizardClasses,
                };
              });

        // Build judge details from show's assigned judges
        const showJudges = existingShow.assignedJudges || [];
        const judgeDetailsMap: Record<
          string,
          {
            name: string;
            email: string;
            phone: string;
            certifications: string[];
            notes: string;
          }
        > = {};
        showJudges.forEach(judge => {
          const personInfo = people.find(p => p.id === judge.judgeId);

          judgeDetailsMap[judge.judgeId] = {
            name: personInfo ? `${personInfo.firstName} ${personInfo.lastName}` : judge.judgeName,
            email: personInfo?.email || '',
            phone: personInfo?.phone || '',
            certifications: personInfo?.judgeQualifications?.map(q => q.organization) || [],
            notes: '',
          };
        });

        const draft = {
          show: {
            name: existingShow.name,
            organization: existingShow.organization as 'AKC' | 'UKC' | 'Other',
            startDate: existingShow.startDate,
            endDate: existingShow.endDate,
            location: existingShow.location,
            clubId: existingShow.clubId,
            entryOpenDate: existingShow.entryOpenDate,
            entryCloseDate: existingShow.entryCloseDate,
            preEntryFee: parseFloat(existingShow.preEntryFee) || 0,
            dayOfShowFee: parseFloat(existingShow.dayOfShowFee || '0') || 0,
            startingArmbandNumber: existingShow.startingArmbandNumber ?? 100,
            acceptCheckPayments: existingShow.acceptCheckPayments ?? false,
            acceptCashPayments: existingShow.acceptCashPayments ?? false,
            officials: {
              secretary: [] as string[],
              chairman: [] as string[],
              steward: [] as string[],
            },
            judgeIds: showJudges.map(j => j.judgeId),
          },
          trials: wizardTrials,
          judgeDetails: judgeDetailsMap,
          currentStep: editMode.mode === 'add-trials' ? 1 : editMode.mode === 'add-classes' ? 2 : 0,
          completedSteps:
            editMode.mode === 'add-trials' ? [0] : editMode.mode === 'add-classes' ? [0, 1] : [],
        };

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
      // Validation failed — show the banner but don't navigate
      setValidationExpanded(true);
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

  // Enable Next when validation passes (decoupled from completedSteps to prevent
  // auto-advance caused by markStepCompleted side effects during re-renders)
  const canGoNext = !isLoading && validationMessages.length === 0;

  // Render current step content
  const renderStepContent = () => {
    const stepProps = { className: '' };

    switch (currentStep) {
      case 0:
        return <ShowDetailsStep {...stepProps} />;
      case 1: {
        const existingTrialCount =
          editMode?.mode === 'add-trials'
            ? existingTrials.filter(t => t.showId === editMode.showId).length
            : 0;
        return (
          <TrialConfigurationStep
            {...stepProps}
            existingTrialCount={existingTrialCount}
            submitted={hasAttemptedNext}
          />
        );
      }
      case 2:
        return (
          <ClassSelectionStep
            {...stepProps}
            submitted={hasAttemptedNext}
            existingDBClasses={
              editMode?.mode === 'add-classes' || editMode?.mode === 'add-trials'
                ? existingClasses.map(c => ({
                    trialId: c.trialId,
                    className: c.className || '',
                    element: c.element || '',
                    level: c.level || '',
                    section: c.section || '',
                  }))
                : undefined
            }
          />
        );
      case 3:
        return (
          <ReviewStep
            {...stepProps}
            isLoading={isLoading}
            onSaveDraft={handleSaveDraft}
            onCreateShow={handleCreateShow}
            onCreateAndPublish={handleCreateAndPublish}
            onBack={handleBack}
            submitLabel={
              editMode?.mode === 'add-trials'
                ? 'Add Trials (Unpublished)'
                : editMode?.mode === 'add-classes'
                  ? 'Add Classes (Unpublished)'
                  : 'Create Show (Unpublished)'
            }
            publishLabel={
              editMode?.mode === 'add-trials'
                ? 'Add & Publish Trials'
                : editMode?.mode === 'add-classes'
                  ? 'Add & Publish Classes'
                  : 'Create & Publish Show'
            }
          />
        );
      default:
        return <ShowDetailsStep {...stepProps} />;
    }
  };

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
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background p-8">
            <CheckCircle className="h-16 w-16 text-green-500" />
            <div className="text-center">
              <h1 className="text-3xl font-bold">Show Created!</h1>
              <p className="mt-1 text-muted-foreground">{createdShow.name}</p>
            </div>
            <div className="w-full max-w-md">
              <MyK9QAccessCard showId={createdShow.id} showName={createdShow.name} />
            </div>
            <Button
              size="lg"
              onClick={() => {
                setCreatedShow(null);
                resetWizard();
                navigate('/secretary/dashboard');
              }}
            >
              Go to Dashboard
            </Button>
          </div>
        )}

        {/* Header with breadcrumb and back button */}
        <div className="border-b bg-card/95 backdrop-blur-xl sticky top-0 z-40">
          <div className="container mx-auto px-6 py-4 max-w-7xl">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="gap-2 hover:-translate-y-0.5 transition-all duration-300"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Secretary</span>
                <span>/</span>
                <span>Create Show</span>
                <span>/</span>
                <span className="text-foreground font-medium">
                  {editMode
                    ? `${
                        editMode.mode === 'add-trials'
                          ? 'Add Trials'
                          : editMode.mode === 'add-classes'
                            ? 'Add Classes'
                            : 'Edit Show'
                      }`
                    : 'Wizard'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 pt-6 pb-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 sm:gap-6">
            {/* Sidebar - Progress Indicator */}
            <div className="lg:col-span-1">
              <div className="sticky top-16">
                <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-4 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative">
                    <h2 className="text-base font-semibold mb-4 text-foreground group-hover:text-primary transition-colors duration-300">
                      {editMode
                        ? `${
                            editMode.mode === 'add-trials'
                              ? 'Add Trials'
                              : editMode.mode === 'add-classes'
                                ? 'Add Classes'
                                : 'Edit Show'
                          }`
                        : 'Create New Show'}
                    </h2>
                    <VerticalProgressIndicator
                      steps={WIZARD_STEPS}
                      currentStep={currentStep}
                      completedSteps={completedSteps}
                      onStepClick={goToStep}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-1">
              <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl min-h-[700px] flex flex-col transition-all duration-300 hover:shadow-lg">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                {/* Collapsible Validation Banner — only shown after user clicks Next */}
                {hasAttemptedNext && validationMessages.length > 0 && (
                  <div className="relative border-b border-amber-200/50 dark:border-amber-700/50 rounded-t-2xl overflow-hidden">
                    <button
                      onClick={() => setValidationExpanded(!validationExpanded)}
                      className="w-full px-6 sm:px-8 py-3 bg-gradient-to-r from-amber-50/80 to-amber-100/80 dark:from-amber-900/30 dark:to-amber-800/30 backdrop-blur-sm flex items-center justify-between hover:from-amber-100/80 hover:to-amber-150/80 dark:hover:from-amber-900/40 dark:hover:to-amber-800/40 transition-colors duration-200"
                    >
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          {validationMessages.length} required field
                          {validationMessages.length !== 1 ? 's' : ''} need
                          {validationMessages.length === 1 ? 's' : ''} attention
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          {validationExpanded ? 'Hide' : 'Show'} details
                        </span>
                        {validationExpanded ? (
                          <ChevronUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        )}
                      </div>
                    </button>

                    <div
                      className={`overflow-hidden transition-all duration-300 ease-out ${
                        validationExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div className="px-6 sm:px-8 py-4 bg-gradient-to-r from-amber-50/60 to-amber-100/60 dark:from-amber-900/20 dark:to-amber-800/20">
                        <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1.5">
                          {validationMessages.map((message, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <span className="block w-1.5 h-1.5 bg-amber-500 dark:bg-amber-400 rounded-full mt-1.5 flex-shrink-0" />
                              <span>{message}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step Content with Transition */}
                <div className="relative flex-1 overflow-auto">
                  <div
                    ref={stepContentRef}
                    key={currentStep}
                    className="p-6 sm:p-8 animate-in fade-in slide-in-from-right-4 duration-300"
                    role="region"
                    aria-label={`Step ${currentStep + 1}: ${WIZARD_STEPS[currentStep]?.label}`}
                  >
                    {renderStepContent()}
                  </div>
                </div>

                {/* Navigation - Fixed at bottom, hidden on Review step */}
                {currentStep < WIZARD_STEPS.length - 1 && (
                  <div className="relative border-t bg-gradient-to-r from-muted/10 to-muted/5 backdrop-blur-sm p-4 sm:p-6 rounded-b-2xl">
                    <WizardNavigation
                      currentStep={currentStep}
                      totalSteps={WIZARD_STEPS.length}
                      canGoBack={canGoBack}
                      canGoNext={canGoNext}
                      onBack={handleBack}
                      onNext={handleNext}
                      onSaveDraft={isDirty ? handleSaveProgress : undefined}
                      isLoading={isLoading}
                    />
                  </div>
                )}
              </div>
            </div>
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
              className="bg-amber-500 hover:bg-amber-600"
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
