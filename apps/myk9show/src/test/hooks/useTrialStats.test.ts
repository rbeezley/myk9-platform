import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTrialStats } from '@/hooks/useTrialStats';

// Minimal class shape matching TrialClass
const makeClass = (overrides: Record<string, unknown> = {}) => ({
  id: `class-${Math.random()}`,
  element: 'Containers',
  level: 'Novice',
  section: 'A',
  status: 'Upcoming' as const,
  judgeId: 'judge-1',
  judgeName: 'Judge One',
  startTime: '2026-01-01T09:00:00',
  entries: 5,
  ...overrides,
});

const makeEntry = (classId: string, status?: string) => ({
  classId,
  status,
});

describe('useTrialStats', () => {
  it('returns empty stats when trial is undefined', () => {
    const { result } = renderHook(() => useTrialStats(undefined, []));

    expect(result.current.judges.total).toBe(0);
    expect(result.current.classes.total).toBe(0);
    expect(result.current.entries.total).toBe(0);
    expect(result.current.qualifiedRate.percent).toBe(0);
  });

  it('returns empty stats when trial has no classes', () => {
    const { result } = renderHook(() => useTrialStats({ status: 'Upcoming' }, []));

    expect(result.current.classes.total).toBe(0);
  });

  it('counts total and completed classes', () => {
    const classes = [
      makeClass({ status: 'Completed', entries: 10 }),
      makeClass({ status: 'Upcoming', entries: 5 }),
      makeClass({ status: 'Completed', entries: 8 }),
    ];
    const { result } = renderHook(() => useTrialStats({ status: 'In Progress', classes }, []));

    expect(result.current.classes.total).toBe(3);
    expect(result.current.classes.completed).toBe(2);
    expect(result.current.classes.upcoming).toBe(1);
    expect(result.current.classes.percentChange).toBe(67); // 2/3 = 67%
  });

  it('sums entries from classes', () => {
    const classes = [makeClass({ entries: 10 }), makeClass({ entries: 5, status: 'Completed' })];
    const { result } = renderHook(() => useTrialStats({ status: 'Upcoming', classes }, []));

    expect(result.current.entries.total).toBe(15);
    expect(result.current.entries.completed).toBe(5);
    expect(result.current.entries.upcoming).toBe(10);
  });

  it('counts unique judges, excluding TBD', () => {
    const classes = [
      makeClass({ judgeId: 'judge-1' }),
      makeClass({ judgeId: 'judge-2' }),
      makeClass({ judgeId: 'judge-1' }), // duplicate
      makeClass({ judgeId: 'TBD' }), // excluded
    ];
    const { result } = renderHook(() => useTrialStats({ status: 'Upcoming', classes }, []));

    expect(result.current.judges.total).toBe(2);
  });

  it('counts active judges only when trial is In Progress', () => {
    const classes = [
      makeClass({ judgeId: 'judge-1', status: 'In Progress' }),
      makeClass({ judgeId: 'judge-2', status: 'Completed' }),
      makeClass({ judgeId: 'judge-3', status: 'In Progress' }),
    ];
    const { result } = renderHook(() => useTrialStats({ status: 'In Progress', classes }, []));

    expect(result.current.judges.active).toBe(2);
  });

  it('returns zero active judges when trial is not In Progress', () => {
    const classes = [makeClass({ judgeId: 'judge-1', status: 'In Progress' })];
    const { result } = renderHook(() => useTrialStats({ status: 'Upcoming', classes }, []));

    expect(result.current.judges.active).toBe(0);
  });

  it('computes qualified rate from matching entries', () => {
    const c1 = makeClass({ id: 'c1' });
    const c2 = makeClass({ id: 'c2' });
    const entries = [
      makeEntry('c1', 'Qualified'),
      makeEntry('c1', 'Not Qualified'),
      makeEntry('c2', 'Qualified'),
      makeEntry('c2', 'Qualified'),
      makeEntry('other-class', 'Qualified'), // different trial — excluded
    ];
    const { result } = renderHook(() =>
      useTrialStats({ status: 'Upcoming', classes: [c1, c2] }, entries)
    );

    // 3 qualified out of 4 scored = 75%
    expect(result.current.qualifiedRate.qualified).toBe(3);
    expect(result.current.qualifiedRate.total).toBe(4);
    expect(result.current.qualifiedRate.percent).toBe(75);
  });

  it('returns zero qualified rate when no scored entries', () => {
    const c1 = makeClass({ id: 'c1' });
    const entries = [makeEntry('c1', 'Pending'), makeEntry('c1', undefined)];
    const { result } = renderHook(() =>
      useTrialStats({ status: 'Upcoming', classes: [c1] }, entries)
    );

    expect(result.current.qualifiedRate.percent).toBe(0);
    expect(result.current.qualifiedRate.total).toBe(0);
  });

  it('ignores entries from classes not in this trial', () => {
    const c1 = makeClass({ id: 'my-class' });
    const entries = [
      makeEntry('my-class', 'Qualified'),
      makeEntry('other-class', 'Not Qualified'), // not in trial
    ];
    const { result } = renderHook(() =>
      useTrialStats({ status: 'Upcoming', classes: [c1] }, entries)
    );

    expect(result.current.qualifiedRate.qualified).toBe(1);
    expect(result.current.qualifiedRate.total).toBe(1);
  });
});
