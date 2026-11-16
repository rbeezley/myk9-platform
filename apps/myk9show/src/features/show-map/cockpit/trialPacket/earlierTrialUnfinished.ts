import { deriveTrialStatusKey } from '@myk9/core';

import { classifyClassStatus } from '@/features/show-map/showMapStatus';
import { computeDayTrialNumber } from '@/pages/secretary/ReportsPage/dayTrialNumber';
import type { DbClass, DbTrial } from '@/types/database-mappings';

/** Trial status keys that still hold move-ups open: nothing finished, or only some of it. */
const UNFINISHED = new Set(['not-started', 'in-progress']);

function isUnfinished(trial: DbTrial, classes: readonly DbClass[]): boolean {
  const own = classes.filter(cls => cls.trial_id === trial.id);
  const key = deriveTrialStatusKey({
    trialStatus: trial.status,
    classCount: own.length,
    completedCount: own.filter(cls => classifyClassStatus(cls.status ?? undefined)?.kind === 'complete')
      .length,
    hasStarted: own.some(cls => classifyClassStatus(cls.status ?? undefined)?.kind === 'active'),
  });
  return UNFINISHED.has(key);
}

/**
 * The earliest trial on the SAME calendar day, before this one, that has not finished (MYK9-2075).
 * "Finished" is the trial status the Show Desk already shows (`deriveTrialStatusKey`): every class
 * complete. A cancelled trial or one with no classes cannot move dogs, so it never counts. Returns
 * the earlier trial's number within the day, or null: no earlier trial, all finished, or the day
 * order is ambiguous (never guess a name for the note).
 */
export function findUnfinishedEarlierTrial(input: {
  trialId: string;
  trials: readonly DbTrial[];
  classes: readonly DbClass[];
}): { dayNumber: number } | null {
  const trial = input.trials.find(item => item.id === input.trialId);
  if (!trial) return null;
  const thisNumber = computeDayTrialNumber(trial, [...input.trials]);
  if (thisNumber === undefined) return null;
  const earlier = input.trials
    .filter(item => item.id !== trial.id && item.date === trial.date)
    .map(item => ({ item, dayNumber: computeDayTrialNumber(item, [...input.trials]) }))
    .filter(
      (row): row is { item: DbTrial; dayNumber: number } =>
        row.dayNumber !== undefined && row.dayNumber < thisNumber
    )
    .sort((left, right) => left.dayNumber - right.dayNumber);
  const open = earlier.find(row => isUnfinished(row.item, input.classes));
  return open ? { dayNumber: open.dayNumber } : null;
}
