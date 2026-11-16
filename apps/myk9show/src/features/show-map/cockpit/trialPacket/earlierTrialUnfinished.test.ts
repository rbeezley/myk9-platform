import { describe, expect, it } from 'vitest';

import type { DbClass, DbTrial } from '@/types/database-mappings';

import { findUnfinishedEarlierTrial } from './earlierTrialUnfinished';

const trial = (id: string, date: string, number: number, status = 'not_started') =>
  ({ id, date, trial_number: String(number), status }) as unknown as DbTrial;
const cls = (trialId: string, status: string) =>
  ({ id: `${trialId}-${status}`, trial_id: trialId, status }) as unknown as DbClass;

const TRIALS = [
  trial('t1', '2026-12-07', 1),
  trial('t2', '2026-12-07', 2),
  trial('t3', '2026-12-08', 1),
];
const find = (trialId: string, classes: DbClass[], trials = TRIALS) =>
  findUnfinishedEarlierTrial({ trialId, trials, classes });

describe('findUnfinishedEarlierTrial', () => {
  it('names the earlier same-day trial while a class has not finished', () => {
    expect(find('t2', [cls('t1', 'completed'), cls('t1', 'in_progress')])).toEqual({
      dayNumber: 1,
    });
    expect(find('t2', [cls('t1', 'not_started')])).toEqual({ dayNumber: 1 });
  });

  it('is null once every class of the earlier trial is complete', () => {
    expect(find('t2', [cls('t1', 'completed'), cls('t1', 'completed')])).toBeNull();
  });

  it('is null for the first trial of the day and for trials on other days', () => {
    expect(find('t1', [cls('t2', 'not_started')])).toBeNull();
    expect(find('t3', [cls('t1', 'not_started'), cls('t2', 'not_started')])).toBeNull();
  });

  it('ignores a cancelled earlier trial and one with no classes', () => {
    const cancelled = [trial('t1', '2026-12-07', 1, 'cancelled'), trial('t2', '2026-12-07', 2)];
    expect(find('t2', [cls('t1', 'not_started')], cancelled)).toBeNull();
    expect(find('t2', [])).toBeNull();
  });
});
