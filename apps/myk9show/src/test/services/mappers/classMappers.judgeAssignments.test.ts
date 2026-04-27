/**
 * Read-path coverage for judge data round-tripping through the replication
 * layer.
 *
 * The bug: `ReplicatedClass` stores `judgeName` and `judgeId` (set during
 * sync from the joined `judge_assignments` payload), but
 * `mapReplicatedClassToDbRow` only attaches a `judge_assignments` array when
 * the caller passes it explicitly via options. Most call sites
 * (`getClassesByTrialId` in particular) don't pass it, so the resulting row
 * has no judge data — `mapDbClassToClassData` then resolves
 * `judge: 'TBD'`, `judgeId: ''` even though the replicated row knows the
 * answer. The Edit panel opens with no saved judge selected.
 *
 * Fix: when the replicated row already carries `judgeId`/`judgeName`,
 * synthesize the `judge_assignments` shape mappers downstream expect.
 */
import { describe, it, expect } from 'vitest';
import { mapReplicatedClassToDbRow, mapDatabaseToClass } from '@/services/mappers/classMappers';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

function makeReplicatedClass(overrides: Partial<ReplicatedClass> = {}): ReplicatedClass {
  return {
    id: 'cls-1',
    trialId: 'trial-1',
    name: 'Container Master',
    description: null,
    level: 'Master',
    entryFee: 30,
    maxEntries: 40,
    startTime: '09:00:00',
    element: 'Container',
    section: 'A',
    classStatus: 'upcoming',
    classOrder: 1,
    isCompleted: false,
    isScoringFinalized: false,
    isResultsReviewed: false,
    ...overrides,
  } as ReplicatedClass;
}

describe('mapReplicatedClassToDbRow — judge data round-trip', () => {
  it('synthesizes judge_assignments from stored judgeId + judgeName', () => {
    const replicated = makeReplicatedClass({
      judgeId: 'judge-uuid-1',
      judgeName: 'Richard Beezley',
    });

    const dbRow = mapReplicatedClassToDbRow(replicated);

    expect(dbRow.judge_assignments).toEqual([
      {
        person_id: 'judge-uuid-1',
        people: { first_name: 'Richard', last_name: 'Beezley' },
      },
    ]);
  });

  it('handles single-name judges (last_name = empty string)', () => {
    const replicated = makeReplicatedClass({
      judgeId: 'judge-uuid-2',
      judgeName: 'Madonna',
    });

    const dbRow = mapReplicatedClassToDbRow(replicated);

    expect(dbRow.judge_assignments).toEqual([
      { person_id: 'judge-uuid-2', people: { first_name: 'Madonna', last_name: '' } },
    ]);
  });

  it('preserves multi-word last names', () => {
    const replicated = makeReplicatedClass({
      judgeId: 'judge-uuid-3',
      judgeName: 'Mary Van Der Berg',
    });

    const dbRow = mapReplicatedClassToDbRow(replicated);

    expect(dbRow.judge_assignments).toEqual([
      {
        person_id: 'judge-uuid-3',
        people: { first_name: 'Mary', last_name: 'Van Der Berg' },
      },
    ]);
  });

  it('omits judge_assignments entirely when no judge stored', () => {
    const replicated = makeReplicatedClass({});

    const dbRow = mapReplicatedClassToDbRow(replicated);

    expect(dbRow.judge_assignments).toBeUndefined();
  });

  it('caller-supplied options.judgeAssignments take precedence', () => {
    // PostgREST round-trip case: caller already has the joined data.
    const replicated = makeReplicatedClass({
      judgeId: 'judge-uuid-stale',
      judgeName: 'Stale Cached Judge',
    });

    const dbRow = mapReplicatedClassToDbRow(replicated, {
      judgeAssignments: [
        {
          person_id: 'judge-uuid-fresh',
          people: { first_name: 'Fresh', last_name: 'Data' },
        },
      ],
    });

    expect(dbRow.judge_assignments).toEqual([
      { person_id: 'judge-uuid-fresh', people: { first_name: 'Fresh', last_name: 'Data' } },
    ]);
  });

  it('round-trips through mapDatabaseToClass to produce judge name + id', () => {
    // End-to-end assertion: replicated row → dbRow → ClassData with judge populated.
    const replicated = makeReplicatedClass({
      judgeId: 'judge-uuid-1',
      judgeName: 'Richard Beezley',
    });

    const dbRow = mapReplicatedClassToDbRow(replicated);
    const classData = mapDatabaseToClass(dbRow as never);

    expect(classData.judge).toBe('Richard Beezley');
    expect(classData.judgeId).toBe('judge-uuid-1');
  });
});
