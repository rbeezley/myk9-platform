import {
  normalizeTimeOfDay,
  trialStartTimeIssues,
  trialStartTimeMessage,
} from '@/components/trials/trialDateTime';

/**
 * The start time a wizard trial is SAVED with (MYK9-931). The typed draft is the
 * only source: a missing, blank or invalid draft refuses to build (Review blocks
 * it first; this is the backstop), and a valid one is saved as typed in the stored
 * spelling. No default is ever supplied.
 */
export function plannedStartTimeForSave(
  trial: { startTimeDraft?: string | undefined },
  trialName: string
): string {
  const issue = trialStartTimeIssues(trial);
  if (issue) throw new Error(trialStartTimeMessage(issue, trialName));
  return normalizeTimeOfDay(trial.startTimeDraft ?? '');
}

/** The trial's day for saving; a trial with no date refuses to build rather than guess one. */
export function requireTrialDate(trial: { trialDate: string }, trialName: string): string {
  if (!trial.trialDate) throw new Error(`Please select a date for ${trialName}`);
  return trial.trialDate;
}
