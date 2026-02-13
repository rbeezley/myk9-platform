import React, { useState, useCallback, useEffect } from 'react';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { getErrorMessage } from '@myk9/core';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWizardStore } from '@/store/wizardStore';
import ProgressIndicator from '../components/ProgressIndicator';
import WizardNavigation from '../components/WizardNavigation';
import ShowDetailsStep from '../steps/ShowDetailsStep';
import TrialConfigurationStep from '../steps/TrialConfigurationStep';
import ClassSelectionStep from '../steps/ClassSelectionStep';
import ReviewStep from '../steps/ReviewStep';

import type { ShowCreationWizardProps } from './types';
import { WIZARD_STEPS } from './types';
import { isStepValid, getValidationMessages } from './validation';
import { useEditModeInit } from './useEditModeInit';
import { useShowSubmission } from './useShowSubmission';
import { useWizardPanelListener } from './useWizardPanelListener';
import ValidationBanner from './ValidationBanner';
import ConfirmCloseDialog from './ConfirmCloseDialog';

// ---------------------------------------------------------------------------
// ShowCreationWizard
// ---------------------------------------------------------------------------

export const ShowCreationWizard: React.FC<ShowCreationWizardProps> = ({
  open,
  onOpenChange,
  editMode,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  const {
    currentStep,
    completedSteps,
    isDirty,
    setCurrentStep,
    markStepCompleted,
    goToStep,
    saveProgress,
    resetWizard,
    show,
    trials,
  } = useWizardStore();

  // ---- Custom hooks ----
  useEditModeInit(editMode, open);

  const isClosingPanel = useWizardPanelListener();

  const {
    handleSaveDraftClick,
    handleCreateShowClick,
    handleCreateAndPublishClick,
  } = useShowSubmission(editMode, setIsLoading, onOpenChange);

  // ---- Close handling ----
  const handleClose = useCallback(
    (event?: Event | React.SyntheticEvent) => {
      // If we're in the middle of closing a panel, ignore this close event
      if (isClosingPanel) {
        event?.stopPropagation?.();
        return;
      }

      // More robust panel detection: check if the event comes from any panel
      if (event && 'target' in event) {
        const target = event.target as Element;
        const isFromPanel =
          target?.closest('[data-panel-stack]') !== null ||
          target?.closest('.slide-over-panel') !== null ||
          (target?.closest('[role="dialog"]') && !target?.closest('.wizard-dialog')) ||
          target?.closest('[aria-labelledby="panel-title"]') !== null;

        if (isFromPanel) {
          logger.debug('Ignoring close event from panel element', 'wizard');
          event.stopPropagation?.();
          event.preventDefault?.();
          return;
        }
      }

      if (isDirty) {
        setShowConfirmDialog(true);
        return;
      }
      onOpenChange(false);
    },
    [isDirty, onOpenChange, isClosingPanel],
  );

  const handleConfirmClose = useCallback(() => {
    resetWizard();
    onOpenChange(false);
    setShowConfirmDialog(false);
  }, [resetWizard, onOpenChange]);

  // ---- Navigation ----
  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else {
      handleClose();
    }
  }, [currentStep, setCurrentStep, handleClose]);

  const handleNext = useCallback(async () => {
    setIsLoading(true);
    try {
      markStepCompleted(currentStep);
      if (currentStep < WIZARD_STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
      }
    } catch (error) {
      logger.error('Error in wizard navigation', 'wizard', {}, error as Error);
      notifications.error('Error navigating wizard', {
        description: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentStep, markStepCompleted, setCurrentStep]);

  const handleSaveDraft = useCallback(async () => {
    setIsLoading(true);
    try {
      saveProgress();
      logger.debug('Draft saved successfully', 'wizard');
    } catch (error) {
      logger.error('Error saving draft', 'wizard', {}, error as Error);
      notifications.error('Failed to save draft', {
        description: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [saveProgress]);

  // ---- Validation ----
  const currentStepValid = isStepValid(currentStep, completedSteps);

  const handleNextWithValidation = useCallback(async () => {
    if (!currentStepValid) {
      setShowValidationErrors(true);
      return;
    }
    setShowValidationErrors(false);
    await handleNext();
  }, [currentStepValid, handleNext]);

  const canGoBack = !isLoading;
  const canGoNext = !isLoading && currentStepValid;

  const validationMessages = getValidationMessages(currentStep, show, trials);

  // ---- Effects ----

  // Reset wizard when closing
  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
      setShowValidationErrors(false);
      if (!editMode) {
        resetWizard();
      }
    }
  }, [open, setCurrentStep, editMode, resetWizard]);

  // Clear validation errors when the user addresses the issues
  useEffect(() => {
    if (showValidationErrors && currentStepValid) {
      setShowValidationErrors(false);
    }
  }, [show, trials, showValidationErrors, currentStepValid]);

  // ---- Step rendering ----
  const renderStepContent = () => {
    const stepProps = { className: 'p-6' };

    switch (currentStep) {
      case 0:
        return <ShowDetailsStep {...stepProps} />;
      case 1:
        return <TrialConfigurationStep {...stepProps} />;
      case 2:
        return <ClassSelectionStep {...stepProps} />;
      case 3:
        return (
          <ReviewStep
            {...stepProps}
            onSaveDraft={handleSaveDraftClick}
            onCreateShow={handleCreateShowClick}
            onCreateAndPublish={handleCreateAndPublishClick}
            onBack={handleBack}
          />
        );
      default:
        return <ShowDetailsStep {...stepProps} />;
    }
  };

  // ---- Render ----
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleClose();
          }
        }}
      >
        <DialogContent className="max-w-5xl wizard-dialog p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>
              {editMode
                ? `${
                    editMode.mode === 'add-trials'
                      ? 'Add Trials'
                      : editMode.mode === 'add-classes'
                        ? 'Add Classes'
                        : 'Edit Show'
                  }`
                : 'Create New Show'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col h-[80vh] max-h-[800px] min-h-[600px]">
            {/* Progress Indicator - Fixed height */}
            <div className="flex-shrink-0">
              <ProgressIndicator
                steps={WIZARD_STEPS}
                currentStep={currentStep}
                completedSteps={completedSteps}
                onStepClick={goToStep}
                className="border-b py-4"
              />
            </div>

            {/* Validation Banner */}
            {showValidationErrors && (
              <ValidationBanner messages={validationMessages} />
            )}

            {/* Step Content - Scrollable area */}
            <div className="flex-1 overflow-auto min-h-0">{renderStepContent()}</div>

            {/* Navigation - Fixed at bottom, hidden on Review step */}
            {currentStep < WIZARD_STEPS.length - 1 && (
              <div className="flex-shrink-0 px-6 pb-6">
                <WizardNavigation
                  currentStep={currentStep}
                  totalSteps={WIZARD_STEPS.length}
                  canGoBack={canGoBack}
                  canGoNext={canGoNext}
                  onBack={handleBack}
                  onNext={handleNextWithValidation}
                  onSaveDraft={isDirty ? handleSaveDraft : undefined}
                  isLoading={isLoading}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Confirmation Dialog */}
      <ConfirmCloseDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={handleConfirmClose}
      />
    </>
  );
};

export default ShowCreationWizard;
