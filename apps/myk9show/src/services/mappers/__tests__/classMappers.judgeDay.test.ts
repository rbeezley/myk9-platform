/**
 * MYK9-1036: a replica class that knows its judge's id but not the name still carries the judge
 * through the row mapper, as a confirmed assignment (the replica only ever holds confirmed ones),
 * so the Result Catalog's judge-day scope does not lose the class.
 */
import { describe, expect, it } from 'vitest';

import { resolveClassJudgeFields } from '@/services/database/_shared/classJudgeFields';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { mapDatabaseToClass, mapReplicatedClassToDbRow } from '../classMappers';
import type { DbClassWithRelations } from '../classMappers';

const base = { id: 'c1', trialId: 't1', name: 'Buried Novice' } as ReplicatedClass;

describe('mapReplicatedClassToDbRow judge assignment', () => {
  it('carries a judge id with no name as a confirmed assignment', () => {
    const row = mapReplicatedClassToDbRow({ ...base, judgeId: 'judge-pat' });
    const judge = resolveClassJudgeFields({ judge_assignments: row.judge_assignments });
    expect(judge.personId).toBe('judge-pat');
    expect(judge.name).toBeUndefined();
  });

  it('carries id and name together when both are known', () => {
    const row = mapReplicatedClassToDbRow({
      ...base,
      judgeId: 'judge-pat',
      judgeName: 'Pat Lee',
    });
    const judge = resolveClassJudgeFields({ judge_assignments: row.judge_assignments });
    expect(judge).toMatchObject({ personId: 'judge-pat', name: 'Pat Lee' });
  });

  it('has no assignment when the replica has no judge', () => {
    const row = mapReplicatedClassToDbRow({ ...base });
    expect(row.judge_assignments).toBeUndefined();
  });
});

describe('mapDatabaseToClass judge (MYK9-1036)', () => {
  const person = (first: string) => ({ first_name: first, last_name: 'Judge' });
  const dbClass = (judge_assignments: unknown[]) =>
    ({
      id: 'c1',
      trial_id: 't1',
      name: 'Buried Novice',
      judge_assignments,
    }) as unknown as DbClassWithRelations;

  it('takes the confirmed assignment, not a declined one that sorts first', () => {
    const mapped = mapDatabaseToClass(
      dbClass([
        { id: 'a1', person_id: 'declined-1', status: 'declined', people: person('Dee') },
        { id: 'a2', person_id: 'confirmed-1', status: 'confirmed', people: person('Pat') },
      ])
    );
    expect(mapped.judgeId).toBe('confirmed-1');
    expect(mapped.judge).toBe('Pat Judge');
  });

  it('names no judge when the only assignment is invited or declined', () => {
    const mapped = mapDatabaseToClass(
      dbClass([{ id: 'a1', person_id: 'p1', status: 'invited', people: person('Ina') }])
    );
    expect(mapped.judgeId).toBe('');
    expect(mapped.judge).toBe('TBD');
  });

  it('keeps the first assignment for a read that did not select status', () => {
    const mapped = mapDatabaseToClass(dbClass([{ person_id: 'p1', people: person('Old') }]));
    expect(mapped.judgeId).toBe('p1');
  });
});
