import React from 'react';
import type { Trial } from '@/store/trialStore';
import type { ReplicatedReadStatus } from '@/store/trial-store-types';
import type { SyncableClassData } from '@/store/classStore';
import ShowDetailsStep from '@/components/shows/wizard/steps/ShowDetailsStep';
import TrialConfigurationStep from '@/components/shows/wizard/steps/TrialConfigurationStep';
import ClassSelectionStep from '@/components/shows/wizard/steps/ClassSelectionStep';
import ReviewStep from '@/components/shows/wizard/steps/ReviewStep';
import type { EditMode } from './show-creation-wizard-types';
import { getSubmitLabel } from './wizardLabels';
import type { TrialNameSource } from '@/utils/wizardTrialNames';

interface WizardStepContentProps {
  currentStep: number;
  editMode: EditMode | undefined;
  existingTrials: Trial[];
  existingTrialsReady: boolean;
  existingClasses: SyncableClassData[];
  hasAttemptedNext: boolean;
  isLoading: boolean;
  onCreateShow: () => void;
  onBack: () => void;
  /** True when the show's existing officials could not be read. */
  officialsUnknown?: boolean | undefined;
  /** Read status for the existing-show trial snapshot. */
  existingTrialsReadStatus?: ReplicatedReadStatus | undefined;
  /** Error from the latest existing-show trial snapshot read. */
  existingTrialsReadError?: string | null | undefined;
  /** Retry the existing-show trial snapshot read. */
  onRetryExistingTrials?: (() => void | Promise<void>) | undefined;
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
  existingTrialsReady,
  existingClasses,
  hasAttemptedNext,
  isLoading,
  onCreateShow,
  onBack,
  officialsUnknown,
  existingTrialsReadStatus,
  existingTrialsReadError,
  onRetryExistingTrials,
}) => {
  const stepProps = { className: '' };
  const showExistingTrials =
    editMode?.mode === 'add-trials' ? existingTrials.filter(t => t.showId === editMode.showId) : [];
  const existingTrialNameSources: TrialNameSource[] = showExistingTrials.map(trial => ({
    id: trial.id,
    name: trial.name ?? '',
    trialDate: trial.trialDate ?? '',
  }));

  switch (currentStep) {
    case 0:
      return <ShowDetailsStep {...stepProps} />;
    case 1: {
      return (
        <TrialConfigurationStep
          {...stepProps}
          existingTrialCount={showExistingTrials.length}
          existingTrials={existingTrialNameSources}
          existingTrialsReady={existingTrialsReady}
          existingTrialsReadStatus={existingTrialsReadStatus}
          existingTrialsReadError={existingTrialsReadError}
          onRetryExistingTrials={onRetryExistingTrials}
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
          existingTrials={existingTrialNameSources}
        />
      );
    case 3:
      return (
        <ReviewStep
          {...stepProps}
          isLoading={isLoading}
          onCreateShow={onCreateShow}
          onBack={onBack}
          officialsUnknown={officialsUnknown}
          submitLabel={getSubmitLabel(editMode?.mode)}
          existingTrials={existingTrialNameSources}
        />
      );
    default:
      return <ShowDetailsStep {...stepProps} />;
  }
};
