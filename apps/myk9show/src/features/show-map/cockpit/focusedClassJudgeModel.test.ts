import { describe, expect, it } from 'vitest';

import { isJudgeChangeLocked, judgeLockReason } from './focusedClassJudgeModel';
import type { CockpitLifecycle } from './secretaryCockpitTypes';

const lockInput = (
  value: CockpitLifecycle | null,
  begun: { completed?: number; actualStart?: string } = {}
) => ({
  lifecycle: { evidence: value === null ? ('unknown' as const) : ('recorded' as const), value },
  progress: {
    evidence: 'computed' as const,
    value: { completed: begun.completed ?? 0, total: 10 },
  },
  actualStart: { evidence: 'recorded' as const, value: begun.actualStart ?? null },
});

describe('isJudgeChangeLocked', () => {
  it.each<[CockpitLifecycle | null, boolean]>([
    ['not-started', false],
    ['in-progress', true],
    ['complete', true],
    ['cancelled', true],
    // A lifecycle the cockpit cannot read counts as started.
    [null, true],
  ])('lifecycle %s → locked %s', (value, locked) => {
    expect(isJudgeChangeLocked(lockInput(value))).toBe(locked);
  });
});

describe('judgeLockReason', () => {
  // A ringside device behind on sync leaves the status at not-started while the class runs.
  it('locks a not-started class once a dog is scored or a start is recorded', () => {
    expect(judgeLockReason(lockInput('not-started', { completed: 1 }))).toMatch(
      /once the class starts/
    );
    expect(
      judgeLockReason(lockInput('not-started', { actualStart: '2026-07-20T14:00:00Z' }))
    ).toMatch(/once the class starts/);
    expect(judgeLockReason(lockInput('not-started'))).toBeNull();
  });

  it.each<[CockpitLifecycle | null, RegExp]>([
    ['in-progress', /once the class starts/],
    ['complete', /once the class starts/],
    ['cancelled', /cancelled/],
    [null, /status loads/],
  ])('lifecycle %s → %s', (value, reason) => {
    expect(judgeLockReason(lockInput(value))).toMatch(reason);
  });
});
