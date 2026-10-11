import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  JUDGE_DAY_ALL,
  JUDGE_DAY_UNRESOLVED,
  resolveInitialJudgeDay,
  useJudgeDayReportScope,
} from '../useJudgeDayReportScope';

const assignment = (person: string, first: string, status = 'confirmed') => ({
  id: `a-${person}`,
  person_id: person,
  status,
  people: { first_name: first, last_name: 'Judge' },
});
const classes = [
  { id: 'c1', trial_id: 't1', judge_assignments: [assignment('j-pat', 'Pat')] },
  { id: 'c2', trial_id: 't2', judge_assignments: [assignment('j-pat', 'Pat')] },
  { id: 'c3', trial_id: 't1', judge_assignments: [assignment('j-sam', 'Sam')] },
  { id: 'c4', trial_id: 't1', judge_assignments: [assignment('j-lee', 'Lee', 'declined')] },
];
const entries = [
  { id: 'e1', class_id: 'c1' },
  { id: 'e2', class_id: 'c2' },
  { id: 'e3', class_id: 'c3' },
  { id: 'e4', class_id: 'c4' },
];
const trials = [
  { id: 't1', date: '2026-10-10' },
  { id: 't2', date: '2026-10-10' },
];

function setup(search: string, reportType = 'result-catalog') {
  return renderHook(() =>
    useJudgeDayReportScope({
      reportType,
      initial: resolveInitialJudgeDay(new URLSearchParams(search)),
      classes,
      entries,
      trials,
    })
  );
}

describe('useJudgeDayReportScope', () => {
  it('lists the confirmed judges of each day and prints everything with no day picked', () => {
    const { result } = setup('');
    expect(result.current.options.map(o => o.label)).toEqual([
      'Pat Judge · Sat, Oct 10',
      'Sam Judge · Sat, Oct 10',
    ]);
    expect(result.current.value).toBe(JUDGE_DAY_ALL);
    expect(result.current.scoped).toBeNull();
  });

  it('a deep link by judge id prints that judge’s whole day across both trials', () => {
    const { result } = setup('?judgeId=j-pat&day=2026-10-10');
    expect(result.current.scoped?.classes.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(result.current.scoped?.entries.map(e => e.id)).toEqual(['e1', 'e2']);
    // The picker shows the very day that prints.
    const selected = result.current.options.find(o => o.key === result.current.value);
    expect(selected?.label).toBe('Pat Judge · Sat, Oct 10');
  });

  it('a declined judge’s day is not found, and prints nothing rather than the whole show', () => {
    const { result } = setup('?judgeId=j-lee&day=2026-10-10');
    expect(result.current.value).toBe(JUDGE_DAY_UNRESOLVED);
    expect(result.current.scoped).toEqual({ classes: [], entries: [] });
  });

  it('switches day from the picker, and clears back to everything', () => {
    const { result } = setup('');
    const sam = result.current.options.find(o => o.label.startsWith('Sam'))!;
    act(() => result.current.select(sam.key));
    expect(result.current.scoped?.classes.map(c => c.id)).toEqual(['c3']);
    act(() => result.current.select(JUDGE_DAY_ALL));
    expect(result.current.scoped).toBeNull();
  });

  it('only applies to the Result Catalog', () => {
    const { result } = setup('?judgeId=j-pat&day=2026-10-10', 'check-in-sheet');
    expect(result.current.isFiltering).toBe(false);
    expect(result.current.scoped).toBeNull();
    expect(result.current.options).toEqual([]);
  });
});
