import { describe, expect, it } from 'vitest';

import { needsReprintAfterEarlierTrial } from './trialReprintNote';
import type {
  PaperworkState,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

const trials: SecretaryCockpitTrial[] = [
  { id: 't1', date: '2026-12-07', number: 'Trial 1', order: 0 },
  { id: 't2', date: '2026-12-07', number: 'Trial 2', order: 1 },
  { id: 't3', date: '2026-12-08', number: 'Trial 3', order: 2 },
];

function cls(
  id: string,
  trialId: string,
  lifecycle: SecretaryCockpitClass['lifecycle'],
  sheet?: PaperworkState
): SecretaryCockpitClass {
  return {
    id,
    trialId,
    name: id,
    classOrder: 0,
    lifecycle,
    attention: [],
    actions: [],
    entryRows: [],
    paperwork: sheet ? [{ reportId: 'check-in-sheet', label: 'Check-in sheet', state: sheet }] : [],
  };
}

const needs = (trialId: string, classes: SecretaryCockpitClass[]) =>
  needsReprintAfterEarlierTrial({
    trial: trials.find(item => item.id === trialId)!,
    trials,
    classes,
  });

describe('needsReprintAfterEarlierTrial', () => {
  it('shows when the earlier trial finished and this trial printed sheets have changed', () => {
    expect(needs('t2', [cls('a', 't1', 'complete'), cls('b', 't2', 'not-started', 'stale')])).toBe(
      true
    );
  });

  it('stays quiet while the earlier trial is still running', () => {
    expect(
      needs('t2', [
        cls('a', 't1', 'complete'),
        cls('a2', 't1', 'in-progress'),
        cls('b', 't2', 'not-started', 'stale'),
      ])
    ).toBe(false);
  });

  it('stays quiet when nothing printed has changed, or nothing was printed', () => {
    expect(needs('t2', [cls('a', 't1', 'complete'), cls('b', 't2', 'not-started', 'current')])).toBe(
      false
    );
    expect(
      needs('t2', [cls('a', 't1', 'complete'), cls('b', 't2', 'not-started', 'unconfirmed')])
    ).toBe(false);
  });

  it('ignores cancelled classes in the earlier trial but not a trial with none to run', () => {
    expect(
      needs('t2', [
        cls('a', 't1', 'complete'),
        cls('a2', 't1', 'cancelled'),
        cls('b', 't2', 'not-started', 'stale'),
      ])
    ).toBe(true);
    expect(needs('t2', [cls('b', 't2', 'not-started', 'stale')])).toBe(false);
  });

  it('has no note for the first trial of a day or an earlier day', () => {
    expect(needs('t1', [cls('a', 't1', 'not-started', 'stale')])).toBe(false);
    expect(needs('t3', [cls('a', 't1', 'complete'), cls('c', 't3', 'not-started', 'stale')])).toBe(
      false
    );
  });
});
