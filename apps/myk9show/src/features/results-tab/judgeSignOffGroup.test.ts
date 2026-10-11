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
    takesJudgeSignOff: true,
    signOffRecordable: true,
    signOffNeedsCompletion: false,
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
        row('c2', { phase: 'cancelled', takesJudgeSignOff: false }),
        row('c3', { phase: 'no-dogs', takesJudgeSignOff: false }),
        row('c4', {
          judgeId: 'judge-2',
          judgeName: 'Sam Judge',
          judgeDayKey: 'judge:judge-2|2026-10-10',
        }),
        row('c5', { trialDate: '2026-10-11', judgeDayKey: 'judge:judge-1|2026-10-11' }),
      ],
      'c1'
    );
    expect(group?.classes.map(item => item.id)).toEqual(['c1']);
  });

  it('lists a class with only entries not yet accepted and keeps the day open for it', () => {
    // Its expected count is 0 ("no dogs") but it is not KNOWN empty, so it is not finished.
    const group = buildJudgeSignOffGroup(
      'show-1',
      [row('c1'), row('c2', { phase: 'no-dogs', runFinished: false, signOffRecordable: false })],
      'c1'
    );
    expect(group?.classes.map(item => item.id)).toEqual(['c1', 'c2']);
    expect(group).toMatchObject({ finishedCount: 1, dayComplete: false, recordClassIds: [] });
  });

  it('does not list a class known to have nothing to run, but it does not hold the day open', () => {
    const group = buildJudgeSignOffGroup(
      'show-1',
      [
        row('c1'),
        row('c2', {
          phase: 'no-dogs',
          runFinished: true,
          takesJudgeSignOff: false,
          signOffRecordable: false,
        }),
      ],
      'c1'
    );
    expect(group?.classes.map(item => item.id)).toEqual(['c1']);
    expect(group).toMatchObject({ dayComplete: true, recordClassIds: ['c1'] });
  });

  it('returns null when nothing in the day can be signed', () => {
    expect(
      buildJudgeSignOffGroup(
        'show-1',
        [row('c1', { phase: 'cancelled', takesJudgeSignOff: false })],
        'c1'
      )
    ).toBeNull();
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

  it('names the judge and date the marked catalog covers, from the Show Map judge id', () => {
    const group = buildJudgeSignOffGroup(
      'show-1',
      [row('c1'), row('c2', { trialId: 'trial-2', trialLabel: 'Trial 2' })],
      'c1'
    );
    expect(group?.catalogJudgeDay).toEqual({ judgeId: 'judge-1', date: '2026-10-10' });
  });

  it('has no judge day when the class has no judge id or no date (the narrow scope remains)', () => {
    expect(
      buildJudgeSignOffGroup('show-1', [row('c1', { judgeId: '' })], 'c1')?.catalogJudgeDay
    ).toBeUndefined();
    expect(
      buildJudgeSignOffGroup('show-1', [row('c1', { trialDate: '' })], 'c1')?.catalogJudgeDay
    ).toBeUndefined();
  });
});
