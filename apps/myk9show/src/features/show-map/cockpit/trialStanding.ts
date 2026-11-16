import { computeDayTrialNumber } from '@/pages/secretary/ReportsPage/dayTrialNumber';
import type { DbTrial } from '@/types/database-mappings';

import { isClassConfirmedEmpty } from '../showMapStatus';

/**
 * The ONE trial order and the ONE "trial finished" rule (MYK9-2075), shared by the packet panel's
 * earlier-trial note, the next trial's card and the night-before checklist line. Nothing else may
 * order trials or decide a trial is done, so the three can never disagree.
 */

export interface OrderableTrial {
  id: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** The trial_number column: text in the database, but a fixture or cached row may hold a number. */
  number?: string | number | null | undefined;
  plannedStartTime?: string | null | undefined;
  /** The trials.display_order column, as stored. */
  displayOrder?: string | number | null | undefined;
  name?: string | null | undefined;
}

const asDbTrial = (trial: OrderableTrial): DbTrial =>
  ({
    id: trial.id,
    date: trial.date,
    trial_number: trial.number == null ? null : String(trial.number),
    planned_start_time: trial.plannedStartTime ?? null,
    display_order:
      trial.displayOrder == null || trial.displayOrder === '' ? null : Number(trial.displayOrder),
    created_at: null,
  }) as unknown as DbTrial;

/**
 * The trial's place in its own day: 1 for the only trial that day, `computeDayTrialNumber`
 * otherwise. Undefined when the day's order is a tie, because no number can be named honestly.
 */
export function dayNumberOf(
  trial: OrderableTrial,
  all: readonly OrderableTrial[]
): number | undefined {
  const sameDay = all.filter(other => other.date === trial.date);
  if (sameDay.length <= 1) return 1;
  const rows = all.map(asDbTrial);
  const index = all.findIndex(other => other.id === trial.id);
  return index < 0 ? undefined : computeDayTrialNumber(rows[index]!, rows);
}

/** Trials in show order: by day, then the day's trial order, then as given. */
export function orderTrials<T>(items: readonly T[], read: (item: T) => OrderableTrial): T[] {
  const trials = items.map(read);
  return items
    .map((item, index) => ({
      item,
      index,
      date: trials[index]!.date,
      dayNumber: dayNumberOf(trials[index]!, trials) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.dayNumber - right.dayNumber ||
        left.index - right.index
    )
    .map(row => row.item);
}

/** "Trial 2", or the trial's own name when its place in the day is a tie; never a guessed number. */
export function trialLabelOf(trial: OrderableTrial, all: readonly OrderableTrial[]): string {
  const number = dayNumberOf(trial, all);
  if (number !== undefined) return `Trial ${number}`;
  return trial.name?.trim() || 'Another trial that day';
}

export type ClassRunState = 'complete' | 'cancelled' | 'empty' | 'open';

/**
 * What one class means for "is the trial finished". A cancelled class and a confirmed-empty one
 * (`isClassConfirmedEmpty`) never run, so they hold nothing open.
 */
export function classRunState(input: {
  complete: boolean;
  cancelled: boolean;
  entryCount?: number | null | undefined;
  runListCount?: number | null | undefined;
}): ClassRunState {
  if (input.complete) return 'complete';
  if (input.cancelled) return 'cancelled';
  if (isClassConfirmedEmpty({ entryCount: input.entryCount, runListCount: input.runListCount })) {
    return 'empty';
  }
  return 'open';
}

/** Finished: nothing left to run. A trial with no remaining classes counts as finished. */
export function isTrialFinished(states: readonly ClassRunState[]): boolean {
  return states.every(state => state !== 'open');
}

/** A trial that finished by running something, not one that never had a class to run. */
export function trialFinishedByRunning(states: readonly ClassRunState[]): boolean {
  return states.includes('complete') && isTrialFinished(states);
}
