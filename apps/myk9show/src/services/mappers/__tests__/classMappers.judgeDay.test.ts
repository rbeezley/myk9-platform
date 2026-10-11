/**
 * MYK9-1036: a replica class that knows its judge's id but not the name still carries the judge
 * through the row mapper, as a confirmed assignment (the replica only ever holds confirmed ones),
 * so the Result Catalog's judge-day scope does not lose the class.
 */
import { describe, expect, it } from 'vitest';

import { resolveClassJudgeFields } from '@/services/database/_shared/classJudgeFields';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { mapReplicatedClassToDbRow } from '../classMappers';

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
