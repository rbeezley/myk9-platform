import { CLASS_STATUS } from '@myk9/core';

import { classifyClassStatus } from '@/features/show-map/showMapStatus';
import type { DbClass, DbTrial } from '@/types/database-mappings';

import {
  classRunState,
  dayNumberOf,
  isTrialFinished,
  trialLabelOf,
  type OrderableTrial,
} from '../trialStanding';

const orderable = (trial: DbTrial): OrderableTrial => ({
  id: trial.id,
  date: trial.date,
  number: trial.trial_number,
  plannedStartTime: trial.planned_start_time,
  displayOrder: trial.display_order,
  name: trial.name,
});

/**
 * The earliest trial on the SAME calendar day, before this one, that has not finished (MYK9-2075).
 * Order and "finished" are the shared rules in `trialStanding`: a cancelled or confirmed-empty class
 * holds nothing open, and a trial with nothing left to run is finished. `entryCountByClassId` is the
 * show's entry counts; without it no class is called empty. A cancelled trial never counts. Returns
 * the earlier trial's label ("Trial 1"), or null: no earlier trial, all finished, or this trial's
 * place in the day is a tie (never guess a name for the note).
 */
export function findUnfinishedEarlierTrial(input: {
  trialId: string;
  trials: readonly DbTrial[];
  classes: readonly DbClass[];
  entryCountByClassId?: ReadonlyMap<string, number> | undefined;
}): { label: string } | null {
  const all = input.trials.map(orderable);
  const trial = all.find(item => item.id === input.trialId);
  if (!trial) return null;
  const thisNumber = dayNumberOf(trial, all);
  if (thisNumber === undefined) return null;
  const earlier = all
    .filter(item => item.id !== trial.id && item.date === trial.date)
    .map(item => ({ item, number: dayNumberOf(item, all) }))
    .filter((row): row is { item: OrderableTrial; number: number } => {
      return row.number !== undefined && row.number < thisNumber;
    })
    .sort((left, right) => left.number - right.number);
  const unfinished = earlier.find(({ item }) => {
    const row = input.trials.find(candidate => candidate.id === item.id);
    if (row?.status === 'cancelled') return false;
    const states = input.classes
      .filter(cls => cls.trial_id === item.id)
      .map(cls => {
        const status = classifyClassStatus(cls.status ?? undefined);
        return classRunState({
          complete: status?.kind === 'complete',
          cancelled: status?.value === CLASS_STATUS.CANCELLED,
          entryCount: input.entryCountByClassId
            ? (input.entryCountByClassId.get(cls.id) ?? 0)
            : null,
        });
      });
    return !isTrialFinished(states);
  });
  return unfinished ? { label: trialLabelOf(unfinished.item, all) } : null;
}
