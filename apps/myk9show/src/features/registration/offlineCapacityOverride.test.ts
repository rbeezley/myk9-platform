import { describe, expect, it } from 'vitest';
import { calculateOfflineCapacityOverrides } from './offlineCapacityOverride';

const classes = [
  { id: 'class-1', trialId: 'trial-1', maxEntries: 10 },
  { id: 'class-2', trialId: 'trial-1', maxEntries: 10 },
];
const trials = [{ id: 'trial-1', date: '2026-07-13' }];
const assignments = [
  {
    classId: 'class-1',
    personId: 'judge-1',
    status: 'confirmed',
    dayCapacityOverride: 2,
  },
  {
    classId: 'class-2',
    personId: 'judge-1',
    status: 'confirmed',
    dayCapacityOverride: 2,
  },
];

describe('calculateOfflineCapacityOverrides', () => {
  it('marks a class full using every authoritative capacity-consuming status', () => {
    const overrides = calculateOfflineCapacityOverrides({
      selectedClassIds: ['class-1'],
      classes: [{ ...classes[0], maxEntries: 1 }],
      trials,
      assignments: [],
      entries: [{ classId: 'class-1', entryStatus: 'submitted' }],
      defaultJudgeDayCapacity: 125,
    });

    expect(overrides['class-1']).toBe(true);
  });

  it('marks a class with room overridden when its shared judge-day is full', () => {
    const overrides = calculateOfflineCapacityOverrides({
      selectedClassIds: ['class-1'],
      classes,
      trials,
      assignments,
      entries: [
        { classId: 'class-1', entryStatus: 'confirmed' },
        { classId: 'class-2', entryStatus: 'paid' },
      ],
      defaultJudgeDayCapacity: 125,
    });

    expect(overrides['class-1']).toBe(true);
  });

  it('does not mark an available class or count inactive entries', () => {
    const overrides = calculateOfflineCapacityOverrides({
      selectedClassIds: ['class-1'],
      classes,
      trials,
      assignments,
      entries: [{ classId: 'class-1', entryStatus: 'withdrawn' }],
      defaultJudgeDayCapacity: 2,
    });

    expect(overrides['class-1']).toBe(false);
  });
});
