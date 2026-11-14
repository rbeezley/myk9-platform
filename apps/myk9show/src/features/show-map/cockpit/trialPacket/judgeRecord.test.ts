import { describe, expect, it } from 'vitest';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';

import { buildJudgeRecords, judgeRecordReminder } from './judgeRecord';

function row(id: string, judgeName: string, overrides: Partial<ResultsClassRow> = {}) {
  return {
    id,
    trialId: 't1',
    trialDate: '2026-12-07',
    trialLabel: 'Trial 1',
    name: `Class ${id}`,
    judgeName,
    judgeId: `id-${judgeName}`,
    judgeSignedOffAt: '2026-12-07T21:00:00Z',
    registryId: 'AKC',
    runFinished: true,
    takesJudgeSignOff: true,
    entries: [
      {
        entryId: `e-${id}`,
        armband: '101',
        dogName: 'Juni',
        handlerName: 'Jamie Walker',
        placement: 1,
        resultLabel: 'Q',
        qualified: true,
        timeLabel: '0:41.25',
        faults: 0,
      },
    ],
    ...overrides,
  } as unknown as ResultsClassRow;
}

const build = (rows: ResultsClassRow[]) =>
  buildJudgeRecords({ rows, entryInfo: [], correctionsByEntryId: new Map() });

describe('buildJudgeRecords', () => {
  it("holds only one judge's classes, and none of another judge's", () => {
    const records = build([row('a', 'Pat'), row('b', 'Sam'), row('c', 'Pat')]);

    const pat = records.find(record => record.judgeName === 'Pat')!;
    expect(pat.sections.flatMap(section => section.classes.map(item => item.classId))).toEqual([
      'a',
      'c',
    ]);
    expect(pat.review.classes.map(item => item.classId)).toEqual(['a', 'c']);
    expect(pat.judgeId).toBe('id-Pat');
    const sam = records.find(record => record.judgeName === 'Sam')!;
    expect(sam.review.classes.map(item => item.classId)).toEqual(['b']);
  });

  it('makes one record per judge per day, each trial its own section', () => {
    const records = build([
      row('a', 'Pat'),
      row('b', 'Pat', { trialId: 't2', trialLabel: 'Trial 2' }),
      row('c', 'Pat', { trialId: 't3', trialLabel: 'Trial 1', trialDate: '2026-12-08' }),
    ]);

    expect(records.map(record => [record.day, record.classCount])).toEqual([
      ['2026-12-07', 2],
      ['2026-12-08', 1],
    ]);
    expect(
      records[0]!.sections.map(section => [section.trialLabel, section.classes.length])
    ).toEqual([
      ['Trial 1', 1],
      ['Trial 2', 1],
    ]);
    expect(records[0]!.dayLabel).toContain('Dec 7');
  });

  it("is ready only when the judge's last class of that day is initialled", () => {
    const records = build([
      row('a', 'Pat'),
      row('b', 'Pat', { judgeSignedOffAt: null }),
      row('c', 'Sam'),
      row('d', 'Pat', { trialDate: '2026-12-08' }),
    ]);

    const ready = (name: string, day: string) =>
      records.find(record => record.judgeName === name && record.day === day)!.ready;
    expect(ready('Pat', '2026-12-07')).toBe(false);
    expect(ready('Sam', '2026-12-07')).toBe(true);
    expect(ready('Pat', '2026-12-08')).toBe(true);
  });

  it('leaves out a class with no sign-off or no judge', () => {
    const records = build([
      row('a', 'Pat'),
      row('b', 'Pat', { takesJudgeSignOff: false }),
      row('c', '', { judgeId: '' }),
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]!.classCount).toBe(1);
  });

  it('keeps the corrected-score notes on the lines', () => {
    const [record] = buildJudgeRecords({
      rows: [row('a', 'Pat')],
      entryInfo: [],
      correctionsByEntryId: new Map([
        ['e-a', [{ fieldLabel: 'time', was: '0:38.50', now: '0:41.25', at: '10:42 AM' }]],
      ]),
    });

    expect(record!.review.classes[0]!.pages[0]!.lines[0]!.correctionNote).toContain('0:38.50');
  });
});

describe('judgeRecordReminder', () => {
  it("reminds a UKC judge, in the plan's own words, and no one else", () => {
    expect(judgeRecordReminder('UKC')).toBe(
      "UKC: give the judge a copy of the signed judge's book before they leave."
    );
    expect(judgeRecordReminder('ukc ')).not.toBeNull();
    expect(judgeRecordReminder('AKC')).toBeNull();
    expect(judgeRecordReminder('ASCA')).toBeNull();
  });
});
