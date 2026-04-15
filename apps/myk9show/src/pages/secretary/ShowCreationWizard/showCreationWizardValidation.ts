/**
 * Validation logic for the Show Creation Wizard
 */

interface ShowData {
  name: string;
  organization: string;
  startDate: string;
  endDate: string;
  location: string;
  clubId: string;
  entryOpenDate: string;
  entryCloseDate: string;
  officials: {
    secretary: string[];
    chairman: string[];
    steward: string[];
  };
}

interface Trial {
  id: string;
  name: string;
  dateTime: string;
  eventNumber: string;
  trialType?: string | undefined;
  classes: Array<{
    templateId: string;
    customizations: Record<string, unknown>;
    judgeId?: string | undefined;
  }>;
}

/**
 * Get validation messages for the Show Details step (step 0)
 */
export function getShowDetailsValidationMessages(show: ShowData): string[] {
  const messages: string[] = [];

  if (!show.name?.trim()) messages.push('Show name is required');
  if (!show.organization) messages.push('Organization is required');
  if (!show.startDate) messages.push('Start date is required');
  if (!show.endDate) messages.push('End date is required');
  if (!show.location?.trim()) messages.push('Location is required');
  if (!show.clubId) messages.push('Club selection is required');
  if (show.officials.chairman.length === 0) messages.push('Show chairman is required');
  if (show.officials.secretary.length === 0) messages.push('Show secretary is required');
  if (!show.entryOpenDate) messages.push('Entry open date is required');
  if (!show.entryCloseDate) messages.push('Entry close date is required');

  return messages;
}

/**
 * Get validation messages for the Trial Configuration step (step 1)
 */
export function getTrialValidationMessages(trials: Trial[], organization?: string): string[] {
  const messages: string[] = [];
  const requiresEventNumber = organization === 'AKC';

  if (trials.length === 0) {
    messages.push('At least one trial is required');
  } else {
    trials.forEach((trial, index) => {
      if (!trial.name?.trim()) messages.push(`Trial ${index + 1} name is required`);
      if (!trial.trialType) messages.push(`Trial ${index + 1} type is required`);
      if (!trial.dateTime) messages.push(`Trial ${index + 1} date and time is required`);
      if (requiresEventNumber && !trial.eventNumber?.trim())
        messages.push(`Trial ${index + 1} event number is required for AKC events`);
    });
  }

  return messages;
}

/**
 * Get validation messages for the Class Selection step (step 2)
 */
export function getClassValidationMessages(trials: Trial[]): string[] {
  const messages: string[] = [];

  const totalClasses = trials.reduce((sum, trial) => sum + trial.classes.length, 0);
  if (totalClasses === 0) {
    messages.push('At least one class must be added to the trials');
  } else {
    // Ensure every trial has at least one class
    trials.forEach(trial => {
      if (trial.classes.length === 0) {
        messages.push(`${trial.name || 'A trial'} needs at least one class`);
      }
    });
  }

  return messages;
}

/**
 * Get all validation messages for a given step
 */
export function getValidationMessagesForStep(
  step: number,
  show: ShowData,
  trials: Trial[]
): string[] {
  switch (step) {
    case 0:
      return getShowDetailsValidationMessages(show);
    case 1:
      return getTrialValidationMessages(trials, show.organization);
    case 2:
      return getClassValidationMessages(trials);
    case 3:
      // Review step shows its own validation
      return [];
    default:
      return [];
  }
}
