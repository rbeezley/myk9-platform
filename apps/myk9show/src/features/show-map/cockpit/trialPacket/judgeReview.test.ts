import { describe, expect, it } from 'vitest';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';

import {
  REVIEW_PAGE_CAPACITY,
  buildJudgeReviews,
  judgeProgress,
  paginateReviewLines,
  reviewSummary,
  type ReviewLine,
} from './judgeReview';
import type { ScoreCorrection } from './judgeReviewCorrections';

type Entry = ResultsClassRow['entries'][number];

function entry(armband: string, overrides: Partial<Entry> = {}): Entry {
  return {
    entryId: `e-${armband}`,
    armband,
    dogName: `Dog ${armband}`,
    handlerName: 'Jamie Walker',
    placement: null,
    resultLabel: 'Q',
    qualified: true,
    timeLabel: '0:40.00',
    faults: 0,
    scored: true,
    pointsEarned: null,
    timeSeconds: 40,
    placementTie: null,
    placementTiebreak: null,
    ...overrides,
  };
}

function row(
  id: string,
  judgeName: string,
  overrides: Partial<ResultsClassRow> = {}
): ResultsClassRow {
  return {
    id,
    trialId: 'trial-1',
    trialDate: '2026-12-07',
    trialLabel: 'Trial 1',
    name: `Class ${id}`,
    judgeName,
    judgeId: judgeName ? `id-${judgeName.toLowerCase().replace(/\s/g, '-')}` : '',
    judgeSignedOffAt: null,
    registryId: 'AKC',
    runFinished: true,
    takesJudgeSignOff: true,
    entries: [entry('101'), entry('102')],
    ...overrides,
  } as unknown as ResultsClassRow;
}

const NONE = new Map<string, readonly ScoreCorrection[]>();

describe('buildJudgeReviews', () => {
  const rows = [
    row('interior', 'Pat Donovan'),
    row('exterior', 'Sam Lee'),
    row('container', 'Pat Donovan'),
    row('buried', ''),
    row('cancelled', 'Pat Donovan', { takesJudgeSignOff: false }),
  ];

  it("gives each judge only that judge's classes, in the order the rows come", () => {
    const judges = buildJudgeReviews({ rows, entryInfo: [], correctionsByEntryId: NONE });

    expect(judges.map(judge => [judge.judgeName, judge.classes.map(item => item.classId)])).toEqual(
      [
        ['Pat Donovan', ['interior', 'container']],
        ['Sam Lee', ['exterior']],
      ]
    );
  });

  it('leaves out a class nobody judges and a class that takes no sign-off', () => {
    const judges = buildJudgeReviews({ rows, entryInfo: [], correctionsByEntryId: NONE });

    const everyClass = judges.flatMap(judge => judge.classes.map(item => item.classId));
    expect(everyClass).not.toContain('buried');
    expect(everyClass).not.toContain('cancelled');
  });

  it('summarises the packet as the cover words it', () => {
    const [pat] = buildJudgeReviews({ rows, entryInfo: [], correctionsByEntryId: NONE });

    expect(reviewSummary(pat!)).toBe('Pat Donovan · 2 classes · 2 pages to initial');
  });

  it('words each result with its place and the reason an NQ was given', () => {
    const judges = buildJudgeReviews({
      rows: [
        row('c1', 'Pat Donovan', {
          entries: [
            entry('101', { placement: 1 }),
            entry('102', { resultLabel: 'NQ', qualified: false }),
            entry('103', { resultLabel: 'ABS', qualified: false }),
          ],
        }),
      ],
      entryInfo: [{ id: 'e-102', disqualification_reason: 'Left the ring' }],
      correctionsByEntryId: NONE,
    });

    expect(judges[0]!.classes[0]!.pages[0]!.lines.map(line => line.result)).toEqual([
      'Q, 1st',
      'NQ: Left the ring',
      'ABS',
    ]);
  });

  it("puts the changed-after-submission note on the corrected dog's line only", () => {
    const corrections = new Map<string, readonly ScoreCorrection[]>([
      ['e-102', [{ fieldLabel: 'time', was: '0:38.50', now: '0:41.25', at: '10:42 AM' }]],
    ]);

    const judges = buildJudgeReviews({
      rows: [row('c1', 'Pat Donovan')],
      entryInfo: [],
      correctionsByEntryId: corrections,
    });

    expect(judges[0]!.classes[0]!.pages[0]!.lines.map(line => line.correctionNote)).toEqual([
      '',
      'Changed after you submitted: time was 0:38.50, corrected by the secretary at 10:42 AM',
    ]);
  });

  it('is done only when every class is finished, and initialled only when all are signed off', () => {
    const judges = buildJudgeReviews({
      rows: [
        row('a', 'Pat Donovan', { judgeSignedOffAt: '2026-12-07T20:00:00Z' }),
        row('b', 'Pat Donovan', { runFinished: false }),
        row('c', 'Sam Lee', { judgeSignedOffAt: '2026-12-07T20:00:00Z' }),
      ],
      entryInfo: [],
      correctionsByEntryId: NONE,
    });

    expect(judges.map(judge => [judge.judgeName, judge.done, judge.initialled])).toEqual([
      ['Pat Donovan', false, false],
      ['Sam Lee', true, true],
    ]);
    expect(judges[0]!.finishedCount).toBe(1);
    expect(judgeProgress(judges, 'initialled').label).toBe('1 of 2 judges initialled');
  });
});

describe('paginateReviewLines', () => {
  const line = (armband: string, correctionNote = ''): ReviewLine => ({
    entryId: armband,
    armband,
    dogName: '',
    handlerName: '',
    result: '',
    time: '',
    faults: '',
    correctionNote,
  });

  it('always gives a class a page, even with no dogs', () => {
    expect(paginateReviewLines([])).toHaveLength(1);
  });

  it('starts a new page when a page is full, counting a correction note as a line', () => {
    const full = Array.from({ length: REVIEW_PAGE_CAPACITY }, (_, index) => line(String(index)));
    expect(paginateReviewLines(full)).toHaveLength(1);
    expect(paginateReviewLines([...full, line('x')])).toHaveLength(2);

    const withNote = [line('n', 'note'), ...full.slice(0, REVIEW_PAGE_CAPACITY - 1)];
    expect(paginateReviewLines(withNote)).toHaveLength(2);
  });
});
