import React from 'react';
import type { Trial } from '@/store/trialStore';
import type { SyncableClassData } from '@/store/classStore';
import ShowDetailsStep from '@/components/shows/wizard/steps/ShowDetailsStep';
import TrialConfigurationStep from '@/components/shows/wizard/steps/TrialConfigurationStep';
import ClassSelectionStep from '@/components/shows/wizard/steps/ClassSelectionStep';
import ReviewStep from '@/components/shows/wizard/steps/ReviewStep';
import type { EditMode } from './show-creation-wizard-types';
import { getSubmitLabel, getPublishLabel } from './wizardLabels';

interface WizardStepContentProps {
  currentStep: number;
  editMode: EditMode | undefined;
  existingTrials: Trial[];
  existingClasses: SyncableClassData[];
  hasAttemptedNext: boolean;
  isLoading: boolean;
  onSaveDraft: () => void;
  onCreateShow: () => void;
  onCreateAndPublish: () => void;
  onBack: () => void;
}

/**
 * Renders the active wizard step. Each step is gated on `currentStep`; the
 * edit-mode-specific props (existing trial counts, DB classes, submit/publish
 * labels) are derived here so the page body stays declarative.
 */
export const WizardStepContent: React.FC<WizardStepContentProps> = ({
  currentStep,
  editMode,
  existingTrials,
  existingClasses,
  hasAttemptedNext,
  isLoading,
  onSaveDraft,
  onCreateShow,
  onCreateAndPublish,
  onBack,
}) => {
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
          onSaveDraft={onSaveDraft}
          onCreateShow={onCreateShow}
          onCreateAndPublish={onCreateAndPublish}
          onBack={onBack}
          submitLabel={getSubmitLabel(editMode?.mode)}
          publishLabel={getPublishLabel(editMode?.mode)}
        />
      );
    default:
      return <ShowDetailsStep {...stepProps} />;
  }
};
