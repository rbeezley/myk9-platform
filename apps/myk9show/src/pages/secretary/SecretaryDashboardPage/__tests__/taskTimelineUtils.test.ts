import { describe, it, expect } from 'vitest';
import {
  parseDateOnly,
  toDateOnly,
  getUrgency,
  splitDatedUndated,
  calcDateRange,
  groupByShow,
  calcSummary,
} from '../taskTimelineUtils';
import type { SecretaryTask } from '../types';

function makeTask(overrides: Partial<SecretaryTask> = {}): SecretaryTask {
  return {
    id: 'task-1',
    clubId: 'club-1',
    showId: 'show-1',
    title: 'Test task',
    status: 'todo',
    createdBy: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('parseDateOnly', () => {
  it('parses YYYY-MM-DD without timezone shift', () => {
    const date = parseDateOnly('2024-03-15');
    expect(date).not.toBeNull();
    // Should be local midnight, not shifted by UTC offset
    expect(date!.getFullYear()).toBe(2024);
    expect(date!.getMonth()).toBe(2); // 0-indexed
    expect(date!.getDate()).toBe(15);
  });

  it('returns null for invalid strings', () => {
    expect(parseDateOnly('not-a-date')).toBeNull();
    expect(parseDateOnly('')).toBeNull();
    expect(parseDateOnly('2024/03/15')).toBeNull();
  });

  it('returns a valid date when month overflows (JS rolls over)', () => {
    // new Date(2024, 12, 1) === 2025-01-01 — overflow is intentional JS behavior
    const result = parseDateOnly('2024-13-01');
    // Month 13 (zero-indexed: 12) wraps to January of next year
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(0);
  });
});

describe('getUrgency', () => {
  const today = new Date(2024, 2, 15); // March 15, 2024 local

  it('classifies past dates as overdue', () => {
    const yesterday = new Date(2024, 2, 14);
    expect(getUrgency(yesterday, today)).toBe('overdue');
  });

  it('classifies today as today', () => {
    expect(getUrgency(today, today)).toBe('today');
  });

  it('classifies dates within 7 days as this-week', () => {
    const inFiveDays = new Date(2024, 2, 20);
    expect(getUrgency(inFiveDays, today)).toBe('this-week');
  });

  it('classifies dates beyond 7 days as future', () => {
    const inTenDays = new Date(2024, 2, 25);
    expect(getUrgency(inTenDays, today)).toBe('future');
  });

  it('classifies exactly 7 days out as this-week', () => {
    const sevenDays = new Date(2024, 2, 22);
    expect(getUrgency(sevenDays, today)).toBe('this-week');
  });

  it('classifies 8 days out as future', () => {
    const eightDays = new Date(2024, 2, 23);
    expect(getUrgency(eightDays, today)).toBe('future');
  });
});

describe('splitDatedUndated', () => {
  it('puts tasks with valid due dates in dated', () => {
    const t = makeTask({ dueDate: '2024-03-15' });
    const { dated, undated } = splitDatedUndated([t]);
    expect(dated).toHaveLength(1);
    expect(undated).toHaveLength(0);
  });

  it('puts tasks without due date in undated', () => {
    const t = makeTask({ dueDate: undefined });
    const { dated, undated } = splitDatedUndated([t]);
    expect(dated).toHaveLength(0);
    expect(undated).toHaveLength(1);
  });

  it('puts tasks with null due date in undated', () => {
    const t = makeTask({ dueDate: null });
    const { dated: _dated, undated } = splitDatedUndated([t]);
    expect(undated).toHaveLength(1);
  });

  it('puts tasks with invalid due date string in undated', () => {
    const t = makeTask({ dueDate: 'not-a-date' });
    const { dated, undated } = splitDatedUndated([t]);
    expect(dated).toHaveLength(0);
    expect(undated).toHaveLength(1);
  });

  it('splits mixed tasks correctly', () => {
    const tasks = [
      makeTask({ id: 't1', dueDate: '2024-03-15' }),
      makeTask({ id: 't2', dueDate: undefined }),
      makeTask({ id: 't3', dueDate: '2024-04-01' }),
    ];
    const { dated, undated } = splitDatedUndated(tasks);
    expect(dated).toHaveLength(2);
    expect(undated).toHaveLength(1);
  });
});

describe('calcDateRange', () => {
  it('returns a 14-day range when no tasks', () => {
    const range = calcDateRange([]);
    expect(range.days).toHaveLength(15); // today + 14
  });

  it('starts from today when all tasks are in the future', () => {
    const today = toDateOnly(new Date());
    const futureDate = new Date(today.getTime() + 10 * 86400000);
    const { dated } = splitDatedUndated([
      makeTask({
        dueDate: `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`,
      }),
    ]);
    const range = calcDateRange(dated);
    expect(range.start.getTime()).toBe(today.getTime());
  });

  it('caps range at MAX_DAYS (45)', () => {
    const today = toDateOnly(new Date());
    const farFuture = new Date(today.getTime() + 100 * 86400000);
    const farStr = `${farFuture.getFullYear()}-${String(farFuture.getMonth() + 1).padStart(2, '0')}-${String(farFuture.getDate()).padStart(2, '0')}`;
    const { dated } = splitDatedUndated([makeTask({ dueDate: farStr })]);
    const range = calcDateRange(dated);
    expect(range.days.length).toBeLessThanOrEqual(46); // 45 days + today
  });

  it('includes overdue range when all tasks are overdue', () => {
    const yesterday = toDateOnly(new Date());
    yesterday.setDate(yesterday.getDate() - 5);
    const str = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const { dated } = splitDatedUndated([makeTask({ dueDate: str })]);
    const range = calcDateRange(dated);
    expect(range.start.getTime()).toBeLessThanOrEqual(yesterday.getTime());
  });
});

describe('groupByShow', () => {
  const showNameMap = { 'show-1': 'Spring Trial', 'show-2': 'Summer Show' };

  it('returns a single group when filter is a specific show', () => {
    const tasks = [makeTask({ showId: 'show-1' }), makeTask({ id: 't2', showId: 'show-1' })];
    const groups = groupByShow(tasks, showNameMap, 'show-1');
    expect(groups).toHaveLength(1);
    expect(groups[0].showName).toBe('Spring Trial');
  });

  it('groups by showId when filter is all', () => {
    const tasks = [
      makeTask({ id: 't1', showId: 'show-1' }),
      makeTask({ id: 't2', showId: 'show-2' }),
      makeTask({ id: 't3', showId: null }),
    ];
    const groups = groupByShow(tasks, showNameMap, 'all');
    expect(groups).toHaveLength(3);
    const names = groups.map(g => g.showName);
    expect(names).toContain('Spring Trial');
    expect(names).toContain('Summer Show');
    expect(names).toContain('General');
  });

  it('places General group last when filtering all', () => {
    const tasks = [makeTask({ id: 't1', showId: null }), makeTask({ id: 't2', showId: 'show-1' })];
    const groups = groupByShow(tasks, showNameMap, 'all');
    expect(groups[groups.length - 1].showName).toBe('General');
  });

  it('returns General group for general filter', () => {
    const tasks = [makeTask({ showId: null })];
    const groups = groupByShow(tasks, showNameMap, 'general');
    expect(groups).toHaveLength(1);
    expect(groups[0].showName).toBe('General');
  });
});

describe('calcSummary', () => {
  it('counts overdue, this-week, and unscheduled correctly', () => {
    const today = toDateOnly(new Date());
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const yesterday = new Date(today.getTime() - 86400000);
    const inThreeDays = new Date(today.getTime() + 3 * 86400000);

    const tasks = [
      makeTask({ id: 't1', dueDate: fmt(yesterday) }), // overdue
      makeTask({ id: 't2', dueDate: fmt(inThreeDays) }), // this week
      makeTask({ id: 't3', dueDate: undefined }), // unscheduled
    ];

    const summary = calcSummary(tasks);
    expect(summary.overdue).toBe(1);
    expect(summary.dueThisWeek).toBe(1);
    expect(summary.unscheduled).toBe(1);
  });

  it('returns zeros when no tasks', () => {
    const summary = calcSummary([]);
    expect(summary.overdue).toBe(0);
    expect(summary.dueThisWeek).toBe(0);
    expect(summary.unscheduled).toBe(0);
  });
});
