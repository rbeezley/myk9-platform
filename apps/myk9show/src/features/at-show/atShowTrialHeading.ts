import { formatTrialDate, formatTrialLabel } from '@myk9/core';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';

/** At-show trial section header: "<trial label> · <date>" (MYK9-704). */
export function formatAtShowTrialHeading(trial: ReplicatedTrial): string {
  const trialDate = trial.date ?? trial.trial_date;
  return [
    formatTrialLabel({ name: trial.name, trialNumber: trial.trialNumber ?? trial.trial_number }),
    trialDate ? formatTrialDate(trialDate) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
