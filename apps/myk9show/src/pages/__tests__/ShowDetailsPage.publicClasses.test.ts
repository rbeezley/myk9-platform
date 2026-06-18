import { describe, it, expect } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';
import type { Trial } from '@/components/trials/types/trial.types';
import {
  buildPublicShowClasses,
  buildPublicTrialStats,
  type TrialClassRows,
} from '../ShowDetailsPage.publicClasses';

function makeTrial(overrides: Partial<Trial> = {}): Trial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    showName: 'Heartland Scent Work Classic',
    trialDate: '2026-05-01',
    trialNumber: '1',
    status: CLASS_STATUS.SCHEDULED,
    name: 'Trial 1',
    ...overrides,
  };
}

// Shape of a PostgREST class row as returned by getClassesByTrialId.
function makeClassRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'class-1',
    element: 'Containers',
    level: 'Novice',
    section: 'A',
    start_time: '09:00:00',
    status: 'scheduled',
    judge_assignments: [
      { person_id: 'judge-1', people: { first_name: 'Ada', last_name: 'Lovelace' } },
    ],
    ...overrides,
  };
}

describe('buildPublicShowClasses', () => {
  it('reshapes PostgREST class rows into ClassInfo with trial display fields', () => {
    const trials = [makeTrial()];
    const classesByTrial: TrialClassRows[] = [{ trialId: 'trial-1', rows: [makeClassRow()] }];

    const result = buildPublicShowClasses(trials, classesByTrial, []);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'class-1',
      name: 'Containers Novice',
      element: 'Containers',
      level: 'Novice',
      section: 'A',
      judgeName: 'Ada Lovelace',
      trialId: 'trial-1',
      time: '09:00:00',
      ring: 0,
      status: CLASS_STATUS.SCHEDULED,
      entryCount: 0,
      userHasEntry: false,
      trialDate: '2026-05-01',
      trialNumber: '1',
      trialName: 'Trial 1',
    });
  });

  it('counts entries from the show-scoped entry list (matches the warm store path)', () => {
    const trials = [makeTrial()];
    const classesByTrial: TrialClassRows[] = [
      { trialId: 'trial-1', rows: [makeClassRow({ id: 'class-1' }), makeClassRow({ id: 'class-2' })] },
    ];
    const showEntries = [
      { class_id: 'class-1' },
      { class_id: 'class-1' },
      { class_id: 'class-2' },
    ];

    const result = buildPublicShowClasses(trials, classesByTrial, showEntries);

    expect(result.find(c => c.id === 'class-1')?.entryCount).toBe(2);
    expect(result.find(c => c.id === 'class-2')?.entryCount).toBe(1);
  });

  it('handles a class row with no judge assignment', () => {
    const trials = [makeTrial()];
    const classesByTrial: TrialClassRows[] = [
      { trialId: 'trial-1', rows: [makeClassRow({ judge_assignments: [] })] },
    ];

    const result = buildPublicShowClasses(trials, classesByTrial, []);

    expect(result[0].judgeName).toBe('');
  });

  it('returns an empty array when a trial has no fetched rows', () => {
    const trials = [makeTrial()];

    const result = buildPublicShowClasses(trials, [], []);

    expect(result).toEqual([]);
  });
});

describe('buildPublicTrialStats', () => {
  it('computes class count, entry count, and completed count per trial', () => {
    const classesByTrial: TrialClassRows[] = [
      {
        trialId: 'trial-1',
        rows: [
          makeClassRow({ id: 'class-1', status: 'scheduled' }),
          makeClassRow({ id: 'class-2', status: 'completed' }),
        ],
      },
    ];
    const showEntries = [{ class_id: 'class-1' }, { class_id: 'class-2' }, { class_id: 'class-2' }];

    const stats = buildPublicTrialStats(classesByTrial, showEntries);

    expect(stats['trial-1']).toEqual({
      classCount: 2,
      entryCount: 3,
      completedClasses: 1,
    });
  });

  it('returns zeroed stats for a trial with no classes', () => {
    const stats = buildPublicTrialStats([{ trialId: 'trial-1', rows: [] }], []);

    expect(stats['trial-1']).toEqual({ classCount: 0, entryCount: 0, completedClasses: 0 });
  });
});
