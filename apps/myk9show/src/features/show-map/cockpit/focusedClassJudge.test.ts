import { describe, expect, it } from 'vitest';

import { isJudgeChangeLocked, judgeLockReason, withAssignedJudges } from './focusedClassJudge';
import type {
  CockpitLifecycle,
  SecretaryCockpitClass,
  SecretaryCockpitSnapshot,
} from './secretaryCockpitTypes';

describe('isJudgeChangeLocked', () => {
  it.each<[CockpitLifecycle | null, boolean]>([
    ['not-started', false],
    ['in-progress', true],
    ['complete', true],
    ['cancelled', true],
    // A lifecycle the cockpit cannot read counts as started.
    [null, true],
  ])('lifecycle %s → locked %s', (value, locked) => {
    expect(isJudgeChangeLocked({ evidence: value === null ? 'unknown' : 'recorded', value })).toBe(
      locked
    );
  });
});

describe('judgeLockReason', () => {
  it.each<[CockpitLifecycle | null, RegExp]>([
    ['in-progress', /once the class starts/],
    ['complete', /once the class starts/],
    ['cancelled', /cancelled/],
    [null, /status loads/],
  ])('lifecycle %s → %s', (value, reason) => {
    expect(judgeLockReason({ evidence: value === null ? 'unknown' : 'recorded', value })).toMatch(
      reason
    );
  });
});

const cls = (overrides: Partial<SecretaryCockpitClass>): SecretaryCockpitClass => ({
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice',
  classOrder: 0,
  entryRows: [],
  attention: [],
  actions: [],
  paperwork: [],
  ...overrides,
});

const snapshotOf = (classes: SecretaryCockpitClass[]): SecretaryCockpitSnapshot => ({
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  trials: [],
  classes,
});

const nameFor = (judgeId: string) => (judgeId === 'judge-1' ? 'Jane Judge' : null);

describe('withAssignedJudges', () => {
  it('returns the same snapshot when no class has a pending assignment', () => {
    const snapshot = snapshotOf([cls({ judgeId: 'judge-1', judgeName: 'Jane Judge' })]);

    expect(withAssignedJudges(snapshot, c => c.judgeId ?? null, nameFor)).toBe(snapshot);
  });

  it("treats the row's 'TBD' and '' as no judge, not as a change", () => {
    const snapshot = snapshotOf([cls({ id: 'a', judgeId: 'TBD' }), cls({ id: 'b', judgeId: '' })]);

    expect(withAssignedJudges(snapshot, () => null, nameFor)).toBe(snapshot);
  });

  it('carries a just-assigned judge, with its name, onto that class only', () => {
    const snapshot = snapshotOf([
      cls({ id: 'class-1', judgeId: null, judgeName: null }),
      cls({ id: 'class-2', judgeId: null, judgeName: null }),
    ]);

    const result = withAssignedJudges(
      snapshot,
      c => (c.id === 'class-1' ? 'judge-1' : null),
      nameFor
    );

    expect(result.classes[0]).toMatchObject({ judgeId: 'judge-1', judgeName: 'Jane Judge' });
    expect(result.classes[1]).toBe(snapshot.classes[1]);
  });

  it('clears the name when the judge was just unassigned', () => {
    const snapshot = snapshotOf([cls({ judgeId: 'judge-1', judgeName: 'Jane Judge' })]);

    const result = withAssignedJudges(snapshot, () => null, nameFor);

    expect(result.classes[0]).toMatchObject({ judgeId: null, judgeName: null });
  });
});
