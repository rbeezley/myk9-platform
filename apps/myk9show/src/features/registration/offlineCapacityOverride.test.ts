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
      selections: [{ key: 'dog-1|class-1', classId: 'class-1' }],
      classes: [{ ...classes[0], maxEntries: 1 }],
      trials,
      assignments: [],
      entries: [{ classId: 'class-1', entryStatus: 'submitted' }],
      defaultJudgeDayCapacity: 125,
    });

    expect(overrides['dog-1|class-1']).toBe(true);
  });

  it('marks a class with room overridden when its shared judge-day is full', () => {
    const overrides = calculateOfflineCapacityOverrides({
      selections: [{ key: 'dog-1|class-1', classId: 'class-1' }],
      classes,
      trials,
      assignments,
      entries: [
        { classId: 'class-1', entryStatus: 'confirmed' },
        { classId: 'class-2', entryStatus: 'paid' },
      ],
      defaultJudgeDayCapacity: 125,
    });

    expect(overrides['dog-1|class-1']).toBe(true);
  });

  it('does not mark an available class or count inactive entries', () => {
    const overrides = calculateOfflineCapacityOverrides({
      selections: [{ key: 'dog-1|class-1', classId: 'class-1' }],
      classes,
      trials,
      assignments,
      entries: [{ classId: 'class-1', entryStatus: 'withdrawn' }],
      defaultJudgeDayCapacity: 2,
    });

    expect(overrides['dog-1|class-1']).toBe(false);
  });

  it('marks only the later selection when a batch consumes the final class spot', () => {
    const overrides = calculateOfflineCapacityOverrides({
      selections: [
        { key: 'dog-1|class-1', classId: 'class-1' },
        { key: 'dog-2|class-1', classId: 'class-1' },
      ],
      classes: [{ ...classes[0], maxEntries: 1 }],
      trials,
      assignments: [],
      entries: [],
      defaultJudgeDayCapacity: 125,
    });

    expect(overrides).toEqual({
      'dog-1|class-1': false,
      'dog-2|class-1': true,
    });
  });

  it('marks only the later selection when a batch consumes the final judge-day spot', () => {
    const overrides = calculateOfflineCapacityOverrides({
      selections: [
        { key: 'dog-1|class-1', classId: 'class-1' },
        { key: 'dog-2|class-2', classId: 'class-2' },
      ],
      classes,
      trials,
      assignments: assignments.map(assignment => ({
        ...assignment,
        dayCapacityOverride: 1,
      })),
      entries: [],
      defaultJudgeDayCapacity: 125,
    });

    expect(overrides).toEqual({
      'dog-1|class-1': false,
      'dog-2|class-2': true,
    });
  });

  it('ignores capacity overrides on unconfirmed judge assignments', () => {
    const overrides = calculateOfflineCapacityOverrides({
      selections: [{ key: 'dog-1|class-1', classId: 'class-1' }],
      classes,
      trials,
      assignments: [
        ...assignments.map(assignment => ({ ...assignment, dayCapacityOverride: null })),
        {
          classId: 'class-1',
          personId: 'judge-1',
          status: 'pending',
          dayCapacityOverride: 1,
        },
      ],
      entries: [{ classId: 'class-2', entryStatus: 'confirmed' }],
      defaultJudgeDayCapacity: 2,
    });

    expect(overrides['dog-1|class-1']).toBe(false);
  });
});
