/**
 * MYK9-1036: the Result Catalog's judge + day scope. The options, their labels and the printed
 * classes all come from `listReportJudgeDays`, keyed on the Show Map's judge identity (the
 * confirmed assignment's person id, via resolveClassJudgeFields). No name matching.
 */
import { describe, expect, it } from 'vitest';

import {
  filterToJudgeDay,
  listReportJudgeDays,
  type ReportJudgeDayClassRow,
} from '../judgeDayScope';

const trials = [
  { id: 't1', date: '2026-10-10' },
  { id: 't2', date: '2026-10-10' },
  { id: 't3', date: '2026-10-11' },
];

type Assignment = {
  id?: string;
  person_id: string;
  status?: string;
  people?: { first_name: string; last_name: string } | null;
};
const pat: Assignment = {
  id: 'a1',
  person_id: 'judge-pat',
  status: 'confirmed',
  people: { first_name: 'Pat', last_name: 'Lee' },
};
const sam: Assignment = {
  id: 'a2',
  person_id: 'judge-sam',
  status: 'confirmed',
  people: { first_name: 'Sam', last_name: 'Roe' },
};

const cls = (
  id: string,
  trial_id: string,
  judge_assignments: Assignment[]
): ReportJudgeDayClassRow => ({ id, trial_id, judge_assignments });

describe('listReportJudgeDays', () => {
  it('lists one option per judge per day, naming that judge in the label', () => {
    const days = listReportJudgeDays(
      [cls('c1', 't1', [pat]), cls('c2', 't1', [sam]), cls('c3', 't3', [pat])],
      trials
    );
    expect(days.map(d => [d.judgeId, d.date, d.classIds])).toEqual([
      ['judge-pat', '2026-10-10', ['c1']],
      ['judge-sam', '2026-10-10', ['c2']],
      ['judge-pat', '2026-10-11', ['c3']],
    ]);
    expect(days[0]!.label).toBe('Pat Lee · Sat, Oct 10');
  });

  it('keeps one judge day across two trials on the same date', () => {
    const days = listReportJudgeDays([cls('c1', 't1', [pat]), cls('c2', 't2', [pat])], trials);
    expect(days).toHaveLength(1);
    expect(days[0]!.classIds).toEqual(['c1', 'c2']);
  });

  it('never lists a declined or invited assignment, and the class is not mis-assigned', () => {
    const declined = { ...sam, status: 'declined' };
    const days = listReportJudgeDays(
      [cls('c1', 't1', [declined, pat]), cls('c2', 't1', [{ ...sam, status: 'invited' }])],
      trials
    );
    expect(days.map(d => [d.judgeId, d.classIds])).toEqual([['judge-pat', ['c1']]]);
  });

  it('a row with no status (an unresolved cold embed) is not a confirmed judge', () => {
    const { status: _status, ...noStatus } = pat;
    void _status;
    expect(listReportJudgeDays([cls('c1', 't1', [noStatus])], trials)).toEqual([]);
  });

  it('keeps the class when the judge name is unavailable, labelled without a name', () => {
    const days = listReportJudgeDays(
      [cls('c1', 't1', [{ ...pat, people: null }]), cls('c2', 't1', [pat])],
      trials
    );
    // Same judge id: one day, and the name comes from the class that has it.
    expect(days).toHaveLength(1);
    expect(days[0]!.classIds).toEqual(['c1', 'c2']);
    expect(days[0]!.label).toBe('Pat Lee · Sat, Oct 10');

    const nameless = listReportJudgeDays([cls('c1', 't1', [{ ...pat, people: null }])], trials);
    expect(nameless).toHaveLength(1);
    expect(nameless[0]!.classIds).toEqual(['c1']);
    expect(nameless[0]!.label).toBe('Judge name unavailable · Sat, Oct 10');
  });

  it('does not match judges by name: two ids with one name stay two days', () => {
    const twin = { ...pat, id: 'a9', person_id: 'judge-other-pat' };
    const days = listReportJudgeDays([cls('c1', 't1', [pat]), cls('c2', 't1', [twin])], trials);
    expect(days.map(d => d.judgeId)).toEqual(['judge-pat', 'judge-other-pat']);
  });

  it('skips classes with no judge or no trial date', () => {
    const days = listReportJudgeDays(
      [cls('c1', 't1', []), cls('c2', 'missing-trial', [pat])],
      trials
    );
    expect(days).toEqual([]);
  });
});

describe('filterToJudgeDay', () => {
  it('keeps exactly the day’s classes and their entries', () => {
    const days = listReportJudgeDays(
      [cls('c1', 't1', [pat]), cls('c2', 't1', [sam]), cls('c3', 't3', [pat])],
      trials
    );
    const day = days.find(d => d.judgeId === 'judge-pat' && d.date === '2026-10-10')!;
    const classes = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    const entries = [
      { id: 'e1', class_id: 'c1' },
      { id: 'e2', class_id: 'c2' },
      { id: 'e3', class_id: 'c3' },
    ];
    const scoped = filterToJudgeDay(day, classes, entries);
    expect(scoped.classes.map(c => c.id)).toEqual(['c1']);
    expect(scoped.entries.map(e => e.id)).toEqual(['e1']);
  });
});
