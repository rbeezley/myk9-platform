import { useWizardStore } from '@/store/wizardStore';

type WizardShow = ReturnType<typeof useWizardStore.getState>['show'];
type WizardTrial = ReturnType<typeof useWizardStore.getState>['trials'][number];

/**
 * Check whether a wizard step is currently valid based on the completedSteps array.
 * Each step marks itself complete when its internal validation passes.
 */
export function isStepValid(step: number, completedSteps: number[]): boolean {
  return completedSteps.includes(step);
}

/**
 * Return human-readable validation messages for a given wizard step.
 */
export function getValidationMessages(
  step: number,
  show: WizardShow,
  trials: WizardTrial[],
): string[] {
  const messages: string[] = [];

  switch (step) {
    case 0: // Show Details Step
      if (!show.name?.trim()) messages.push('Show name is required');
      if (!show.type) messages.push('Show type is required');
      if (!show.startDate) messages.push('Start date is required');
      if (!show.endDate) messages.push('End date is required');
      if (!show.location?.trim()) messages.push('Location is required');
      if (!show.clubId) messages.push('Club selection is required');
      if (!show.chairman?.trim()) messages.push('Show chairman is required');
      if (!show.secretary?.trim()) messages.push('Show secretary is required');
      if (!show.entryOpenDate) messages.push('Entry open date is required');
      if (!show.entryCloseDate) messages.push('Entry close date is required');
      break;

    case 1: // Trial Configuration Step
      if (trials.length === 0) {
        messages.push('At least one trial is required');
      } else {
        trials.forEach((trial, index) => {
          if (!trial.name?.trim()) messages.push(`Trial ${index + 1} name is required`);
          if (!trial.dateTime) messages.push(`Trial ${index + 1} date and time is required`);
          if (!trial.eventNumber?.trim()) messages.push(`Trial ${index + 1} event number is required`);
        });
      }
      break;

    case 2: { // Class Selection Step
      const totalClasses = trials.reduce((sum, trial) => sum + trial.classes.length, 0);
      if (totalClasses === 0) {
        messages.push('At least one class must be added to the trials');
      }
      break;
    }

    case 3: // Review Step — shows its own validation
      break;
  }

  return messages;
}
