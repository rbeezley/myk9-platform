import { describe, expect, it } from 'vitest';

import type { DbClass, DbTrial } from '@/types/database-mappings';

import { findUnfinishedEarlierTrial } from './earlierTrialUnfinished';

const trial = (id: string, date: string, number: number | string, status = 'not_started') =>
  ({ id, date, trial_number: number, status }) as unknown as DbTrial;
const cls = (id: string, trialId: string, status: string) =>
  ({ id, trial_id: trialId, status }) as unknown as DbClass;

const TRIALS = [
  trial('t1', '2026-12-07', 1),
  trial('t2', '2026-12-07', '2'),
  trial('t3', '2026-12-08', 1),
];
const find = (
  trialId: string,
  classes: DbClass[],
  options: { trials?: DbTrial[]; counts?: Map<string, number> } = {}
) =>
  findUnfinishedEarlierTrial({
    trialId,
    trials: options.trials ?? TRIALS,
    classes,
    entryCountByClassId: options.counts,
  });

describe('findUnfinishedEarlierTrial', () => {
  it('names the earlier same-day trial while a class has not finished', () => {
    expect(find('t2', [cls('a', 't1', 'completed'), cls('b', 't1', 'in_progress')])).toEqual({
      label: 'Trial 1',
    });
    expect(find('t2', [cls('a', 't1', 'not_started')])).toEqual({ label: 'Trial 1' });
  });

  it('is null once every class is complete, for the first trial of a day, and across days', () => {
    expect(find('t2', [cls('a', 't1', 'completed')])).toBeNull();
    expect(find('t1', [cls('b', 't2', 'not_started')])).toBeNull();
    expect(find('t3', [cls('a', 't1', 'not_started')])).toBeNull();
  });

  it('does not hold a trial open for a cancelled class, a confirmed-empty class or no classes', () => {
    const rest = cls('a', 't1', 'completed');
    expect(find('t2', [rest, cls('x', 't1', 'cancelled')])).toBeNull();
    expect(find('t2', [rest, cls('e', 't1', 'not_started')], { counts: new Map() })).toBeNull();
    // Without entry counts nothing is called empty.
    expect(find('t2', [rest, cls('e', 't1', 'not_started')])).toEqual({ label: 'Trial 1' });
    expect(find('t2', [])).toBeNull();
    const cancelled = [trial('t1', '2026-12-07', 1, 'cancelled'), trial('t2', '2026-12-07', 2)];
    expect(find('t2', [cls('a', 't1', 'not_started')], { trials: cancelled })).toBeNull();
  });

  it('says nothing when this trial place in the day is a tie, and names an earlier tie by name', () => {
    const tied = [
      { ...trial('t1', '2026-12-07', 'A'), name: 'Morning' },
      { ...trial('t2', '2026-12-07', 'A'), name: 'Afternoon' },
    ] as DbTrial[];
    expect(find('t2', [cls('a', 't1', 'not_started')], { trials: tied })).toBeNull();
  });
});
