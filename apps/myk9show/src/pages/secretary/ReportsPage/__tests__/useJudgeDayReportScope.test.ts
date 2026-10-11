import { act, renderHook } from '@/test/utils/testUtils';
import { describe, expect, it } from 'vitest';

import type { ReportDataState } from '@/hooks/queries/useReportData';
import { useJudgeDayReportScope } from '../useJudgeDayReportScope';

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

function setup(
  search: string,
  reportType = 'result-catalog',
  dataState: ReportDataState = 'ready'
) {
  return renderHook(() =>
    useJudgeDayReportScope({
      reportType,
      searchParams: new URLSearchParams(search),
      classes,
      entries,
      trials,
      dataState,
    })
  );
}

describe('useJudgeDayReportScope', () => {
  it('lists All judges then the confirmed judges of each day, and prints everything by default', () => {
    const { result } = setup('');
    expect(result.current.control?.options.map(o => o.label)).toEqual([
      'All judges',
      'Pat Judge · Sat, Oct 10',
      'Sam Judge · Sat, Oct 10',
    ]);
    expect(result.current.control?.selectedLabel).toBe('All judges');
    expect(result.current.scoped).toBeNull();
  });

  it('a deep link by judge id prints that judge’s whole day across both trials', () => {
    const { result } = setup('?judgeId=j-pat&day=2026-10-10');
    expect(result.current.scoped?.classes.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(result.current.scoped?.entries.map(e => e.id)).toEqual(['e1', 'e2']);
    expect(result.current.control?.selectedLabel).toBe('Pat Judge · Sat, Oct 10');
  });

  it('a declined judge’s day is not found, prints nothing, and says so once loaded', () => {
    const { result } = setup('?judgeId=j-lee&day=2026-10-10');
    expect(result.current.control?.selectedLabel).toBe('Judge and day not found');
    expect(result.current.control?.notice).toMatch(/isn't in this show/);
    expect(result.current.notFoundMessage).toMatch(/isn't in this show/);
    expect(result.current.scoped).toEqual({ classes: [], entries: [] });
  });

  it('does not claim "not found" before the classes have loaded', () => {
    const { result } = setup('?judgeId=j-lee&day=2026-10-10', 'result-catalog', 'loading');
    expect(result.current.control?.selectedLabel).toBe('Loading judges…');
    expect(result.current.control?.notice).toBeUndefined();
    expect(result.current.notFoundMessage).toBeNull();
  });

  it('switches day from the picker, and clears back to everything', () => {
    const { result } = setup('');
    const sam = result.current.control!.options.find(o => o.label.startsWith('Sam'))!;
    act(() => result.current.control!.onChange(sam.key));
    expect(result.current.scoped?.classes.map(c => c.id)).toEqual(['c3']);
    act(() => result.current.control!.onChange('all'));
    expect(result.current.scoped).toBeNull();
  });

  it('clear() drops the picked day (a trial or class pick does this)', () => {
    const { result } = setup('?judgeId=j-pat&day=2026-10-10');
    act(() => result.current.clear());
    expect(result.current.isFiltering).toBe(false);
    expect(result.current.scoped).toBeNull();
  });

  it('only applies to the Result Catalog', () => {
    const { result } = setup('?judgeId=j-pat&day=2026-10-10', 'check-in-sheet');
    expect(result.current.isFiltering).toBe(false);
    expect(result.current.scoped).toBeNull();
    expect(result.current.control).toBeUndefined();
  });
});
