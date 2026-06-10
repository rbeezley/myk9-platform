import { describe, it, expect } from 'vitest';
import {
  deriveJudgeDashboardStats,
  splitJudgeAssignments,
  localIsoDate,
  type JudgeClass,
} from '../judgeStatsUtils';

const NOW = new Date('2026-05-03T14:00:00Z').getTime();

const makeClass = (overrides: Partial<JudgeClass> = {}): JudgeClass => ({
  id: '1',
  showId: 'show-1',
  trialId: 'trial-1',
  classId: 'class-1',
  name: 'Interior Novice A',
  element: 'Interior',
  level: 'Novice',
  trialDate: '2026-05-03',
  scheduledTime: new Date(NOW + 30 * 60000),
  ringNumber: 1,
  totalEntries: 10,
  completedEntries: 0,
  status: 'pending',
  ...overrides,
});

describe('deriveJudgeDashboardStats', () => {
  it('returns all zeros/nulls for empty assignments', () => {
    const stats = deriveJudgeDashboardStats([], NOW);
    expect(stats.completedCount).toBe(0);
    expect(stats.totalEntries).toBe(0);
    expect(stats.judgedEntries).toBe(0);
    expect(stats.completionRate).toBeNull();
    expect(stats.nextClass).toBeUndefined();
    expect(stats.minutesUntilNext).toBeNull();
  });

  it('counts completed classes correctly', () => {
    const classes = [
      makeClass({ id: '1', status: 'completed' }),
      makeClass({ id: '2', status: 'pending' }),
      makeClass({ id: '3', status: 'completed' }),
    ];
    const { completedCount } = deriveJudgeDashboardStats(classes, NOW);
    expect(completedCount).toBe(2);
  });

  it('sums totalEntries and judgedEntries across all classes', () => {
    const classes = [
      makeClass({ id: '1', totalEntries: 10, completedEntries: 4 }),
      makeClass({ id: '2', totalEntries: 20, completedEntries: 10 }),
    ];
    const { totalEntries, judgedEntries } = deriveJudgeDashboardStats(classes, NOW);
    expect(totalEntries).toBe(30);
    expect(judgedEntries).toBe(14);
  });

  it('computes completionRate as percentage rounded to nearest integer', () => {
    const classes = [makeClass({ totalEntries: 3, completedEntries: 1 })];
    const { completionRate } = deriveJudgeDashboardStats(classes, NOW);
    expect(completionRate).toBe(33);
  });

  it('returns null completionRate when totalEntries is zero', () => {
    const classes = [makeClass({ totalEntries: 0, completedEntries: 0 })];
    const { completionRate } = deriveJudgeDashboardStats(classes, NOW);
    expect(completionRate).toBeNull();
  });

  it('picks the earliest non-completed class as nextClass', () => {
    const classes = [
      makeClass({
        id: '1',
        name: 'Later',
        scheduledTime: new Date(NOW + 90 * 60000),
        status: 'pending',
      }),
      makeClass({
        id: '2',
        name: 'Sooner',
        scheduledTime: new Date(NOW + 30 * 60000),
        status: 'pending',
      }),
      makeClass({
        id: '3',
        name: 'Completed',
        scheduledTime: new Date(NOW + 10 * 60000),
        status: 'completed',
      }),
    ];
    const { nextClass } = deriveJudgeDashboardStats(classes, NOW);
    expect(nextClass?.name).toBe('Sooner');
  });

  it('returns null nextClass when all classes are completed', () => {
    const classes = [makeClass({ status: 'completed' })];
    const { nextClass, minutesUntilNext } = deriveJudgeDashboardStats(classes, NOW);
    expect(nextClass).toBeUndefined();
    expect(minutesUntilNext).toBeNull();
  });

  it('computes minutesUntilNext correctly', () => {
    const classes = [makeClass({ scheduledTime: new Date(NOW + 45 * 60000), status: 'pending' })];
    const { minutesUntilNext } = deriveJudgeDashboardStats(classes, NOW);
    expect(minutesUntilNext).toBe(45);
  });

  it('clamps minutesUntilNext to 0 for past classes', () => {
    const classes = [
      makeClass({ scheduledTime: new Date(NOW - 10 * 60000), status: 'in-progress' }),
    ];
    const { minutesUntilNext } = deriveJudgeDashboardStats(classes, NOW);
    expect(minutesUntilNext).toBe(0);
  });
});

describe('localIsoDate', () => {
  it('formats the local calendar date as yyyy-mm-dd with zero padding', () => {
    // Construct from local-time parts so the expectation holds in any timezone.
    const epoch = new Date(2026, 0, 5, 9, 30).getTime(); // Jan 5, 2026 local
    expect(localIsoDate(epoch)).toBe('2026-01-05');
  });
});

describe('splitJudgeAssignments', () => {
  const TODAY = '2026-05-03';

  it('buckets assignments into today, upcoming, and completed', () => {
    const todayPending = makeClass({ id: 't1', trialDate: TODAY, status: 'pending' });
    const todayDone = makeClass({ id: 't2', trialDate: TODAY, status: 'completed' });
    const future = makeClass({ id: 'f1', trialDate: '2026-05-10', status: 'pending' });
    const pastDone = makeClass({ id: 'p1', trialDate: '2026-04-20', status: 'completed' });

    const buckets = splitJudgeAssignments([todayPending, todayDone, future, pastDone], TODAY);

    expect(buckets.today.map(c => c.id)).toEqual(['t1', 't2']);
    expect(buckets.upcoming.map(c => c.id)).toEqual(['f1']);
    expect(buckets.completed.map(c => c.id)).toEqual(['t2', 'p1']);
  });

  it('returns empty buckets for no assignments', () => {
    const buckets = splitJudgeAssignments([], TODAY);
    expect(buckets.today).toEqual([]);
    expect(buckets.upcoming).toEqual([]);
    expect(buckets.completed).toEqual([]);
  });

  it('excludes past non-completed assignments from every bucket except completed', () => {
    const pastPending = makeClass({ id: 'p1', trialDate: '2026-04-20', status: 'pending' });
    const buckets = splitJudgeAssignments([pastPending], TODAY);
    expect(buckets.today).toEqual([]);
    expect(buckets.upcoming).toEqual([]);
    expect(buckets.completed).toEqual([]);
  });
});
