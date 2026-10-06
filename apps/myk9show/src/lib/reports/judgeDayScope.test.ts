/**
 * MYK9-1030: the Result Catalog's judge + day scope — one marked catalog per judge per day,
 * spanning trials — and the deep link the Show Map opens it with.
 */
import { describe, expect, it } from 'vitest';

import { getShowMapReportHref } from '@/features/show-map/showMapRoutes';
import { getReportById } from './reportRegistry';
import { getReportScopeSearchParams, resolveReportScope } from './reportScope';
import {
  buildJudgeDayOptions,
  filterReportDataToJudgeDay,
  reportClassJudgeId,
} from './judgeDayScope';

const assignment = (personId: string, first: string, last: string, status = 'confirmed') => [
  { person_id: personId, status, people: { first_name: first, last_name: last } },
];

const trials = [
  { id: 't1', date: '2026-10-10' },
  { id: 't2', date: '2026-10-10' },
  { id: 't3', date: '2026-10-11' },
];
const classes = [
  { id: 'c1', trial_id: 't1', judge_assignments: assignment('jane', 'Jane', 'Smith') },
  { id: 'c2', trial_id: 't2', judge_assignments: assignment('jane', 'Jane', 'Smith') },
  { id: 'c3', trial_id: 't2', judge_assignments: assignment('raj', 'Raj', 'Patel') },
  { id: 'c4', trial_id: 't3', judge_assignments: assignment('jane', 'Jane', 'Smith') },
];
const entries = [
  { id: 'e1', class_id: 'c1' },
  { id: 'e2', class_id: 'c2' },
  { id: 'e3', class_id: 'c3' },
  { id: 'e4', class_id: 'c4' },
];

describe('Result Catalog judge + day scope (MYK9-1030)', () => {
  it('is a Result Catalog scope', () => {
    expect(getReportById('result-catalog')?.scopes).toContain('judge-day');
  });

  it("narrows the show's rows to one judge's classes on one date, across trials", () => {
    const narrowed = filterReportDataToJudgeDay(
      { trials, classes, entries },
      { kind: 'judge-day', showId: 'show-1', judgeId: 'jane', date: '2026-10-10' }
    );

    expect(narrowed.classes.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(narrowed.trials.map(t => t.id)).toEqual(['t1', 't2']);
    expect(narrowed.entries.map(e => e.id)).toEqual(['e1', 'e2']);
  });

  it('names the judge from the confirmed assignment', () => {
    expect(
      reportClassJudgeId({
        id: 'c',
        judge_assignments: [
          { person_id: 'declined', status: 'declined' },
          { person_id: 'confirmed', status: 'confirmed' },
        ],
      })
    ).toBe('confirmed');
  });

  it("lists every judge's day, by date then name", () => {
    expect(buildJudgeDayOptions(trials, classes)).toEqual([
      {
        value: 'jane|2026-10-10',
        judgeId: 'jane',
        date: '2026-10-10',
        label: 'Jane Smith · Sat, Oct 10',
      },
      {
        value: 'raj|2026-10-10',
        judgeId: 'raj',
        date: '2026-10-10',
        label: 'Raj Patel · Sat, Oct 10',
      },
      {
        value: 'jane|2026-10-11',
        judgeId: 'jane',
        date: '2026-10-11',
        label: 'Jane Smith · Sun, Oct 11',
      },
    ]);
  });

  it('round-trips through the report URL the Show Map links to', () => {
    const scope = {
      kind: 'judge-day' as const,
      showId: 'show-1',
      judgeId: 'jane',
      date: '2026-10-10',
    };
    expect(getShowMapReportHref({ reportId: 'result-catalog', scope })).toBe(
      '/shows/show-1/reports?report=result-catalog&judgeId=jane&date=2026-10-10'
    );
    const params = getReportScopeSearchParams(scope);
    expect(
      resolveReportScope({
        showId: 'show-1',
        judgeId: params.get('judgeId'),
        date: params.get('date'),
      })
    ).toEqual(scope);
  });

  it('lets a picked trial win over a judge-day', () => {
    expect(
      resolveReportScope({ showId: 'show-1', trialId: 't1', judgeId: 'jane', date: '2026-10-10' })
    ).toEqual({ kind: 'trial', showId: 'show-1', trialId: 't1' });
  });
});
