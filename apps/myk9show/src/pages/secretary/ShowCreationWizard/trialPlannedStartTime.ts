import { format } from 'date-fns';
import {
  normalizeTimeOfDay,
  trialStartTimeIssues,
  trialStartTimeMessage,
} from '@/components/trials/trialDateTime';

/**
 * The start time a wizard trial is SAVED with (MYK9-931). The typed draft is the
 * source of truth: a blank or invalid draft refuses to build (Review blocks it
 * first; this is the backstop so the old `dateTime` can never be saved silently),
 * a valid one is saved as typed in the stored spelling, and a trial whose box was
 * never edited keeps the time carried by its `dateTime`.
 */
export function plannedStartTimeForSave(
  trial: { dateTime: string; startTimeDraft?: string | undefined },
  trialName: string
): string {
  const issue = trialStartTimeIssues(trial);
  if (issue) throw new Error(trialStartTimeMessage(issue, trialName));
  if (trial.startTimeDraft !== undefined) return normalizeTimeOfDay(trial.startTimeDraft);
  return trial.dateTime ? format(new Date(trial.dateTime), 'h:mm a') : '09:00 AM';
}
