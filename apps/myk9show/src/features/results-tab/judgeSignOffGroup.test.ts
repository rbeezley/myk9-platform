import { describe, expect, it } from 'vitest';

import { buildJudgeSignOffGroup } from './judgeSignOffGroup';
import type { ResultsClassRow } from './buildResultsClassRows';

function row(id: string, overrides: Partial<ResultsClassRow> = {}): ResultsClassRow {
  return {
    id,
    trialId: 'trial-1',
    trialDate: '2026-10-10',
    trialLabel: 'Trial 1',
    name: `Class ${id}`,
    judgeName: 'Pat Judge',
    judgeId: 'judge-1',
    judgeDayKey: 'judge:judge-1|2026-10-10',
    registryId: 'AKC',
    phase: 'done',
    runFinished: true,
    signOffRecordable: true,
    judgeSignedOffAt: null,
    ...overrides,
  } as ResultsClassRow;
}

describe('buildJudgeSignOffGroup', () => {
  it('records the whole finished day, skipping classes already signed or not Completed', () => {
    const group = buildJudgeSignOffGroup(
      'show-1',
      [
        row('c1'),
        row('c2', { judgeSignedOffAt: '2026-10-10T21:00:00Z' }),
        row('c3', { signOffRecordable: false }),
      ],
      'c1'
    );
    expect(group).toMatchObject({
      judgeName: 'Pat Judge',
      dayLabel: 'Sat, Oct 10',
      finishedCount: 3,
      signedCount: 1,
      dayComplete: true,
      recordClassIds: ['c1'],
    });
  });

  it('offers nothing to record while the judge still has a class to run', () => {
    const group = buildJudgeSignOffGroup(
      'show-1',
      [row('c1'), row('c2', { runFinished: false, phase: 'in-ring', signOffRecordable: false })],
      'c1'
    );
    expect(group).toMatchObject({ finishedCount: 1, dayComplete: false, recordClassIds: [] });
  });

  it('leaves out cancelled and no-dog classes, and other judges and dates', () => {
    const group = buildJudgeSignOffGroup(
      'show-1',
      [
        row('c1'),
        row('c2', { phase: 'cancelled' }),
        row('c3', { phase: 'no-dogs' }),
        row('c4', { judgeId: 'judge-2', judgeName: 'Sam Judge' }),
        row('c5', { trialDate: '2026-10-11' }),
      ],
      'c1'
    );
    expect(group?.classes.map(item => item.id)).toEqual(['c1']);
  });

  it('returns null when nothing in the day can be signed', () => {
    expect(buildJudgeSignOffGroup('show-1', [row('c1', { phase: 'cancelled' })], 'c1')).toBeNull();
  });

  it('picks the narrowest existing Result Catalog scope that covers the day', () => {
    const scopeOf = (rows: ResultsClassRow[]) =>
      buildJudgeSignOffGroup('show-1', rows, rows[0]!.id)?.catalogScope;

    expect(scopeOf([row('c1')])).toEqual({
      kind: 'class',
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'c1',
    });
    expect(scopeOf([row('c1'), row('c2')])).toEqual({
      kind: 'trial',
      showId: 'show-1',
      trialId: 'trial-1',
    });
    expect(scopeOf([row('c1'), row('c2', { trialId: 'trial-2' })])).toEqual({
      kind: 'show',
      showId: 'show-1',
    });
  });
});
