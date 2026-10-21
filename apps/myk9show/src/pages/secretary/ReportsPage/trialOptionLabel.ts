import { formatTrialLabel } from '@myk9/core';

/**
 * One trial's label wherever Reports offers a trial: the report's trial selector and the Trial
 * financials card (MYK9-1320). The date tells apart trials that share a name on different days.
 */
export function formatTrialOptionLabel(trial: {
  name: string;
  trial_number: string;
  date: string;
}): string {
  const base = formatTrialLabel({ name: trial.name, trialNumber: trial.trial_number });
  return trial.date ? `${base} · ${trial.date}` : base;
}
