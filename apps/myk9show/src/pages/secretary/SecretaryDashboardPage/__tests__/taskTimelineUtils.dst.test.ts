import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { calcDateRange, getUrgency, splitDatedUndated, toDateOnly } from '../taskTimelineUtils';
import type { SecretaryTask } from '../types';

// MYK9-1260: day arithmetic must be calendar-based. The process TZ is switched
// in-process (Node re-reads TZ on assignment) so CI in UTC still exercises the
// America/Chicago DST transitions (fall 2026-11-01, spring 2027-03-14).

function makeTask(dueDate: string): SecretaryTask {
  return {
    id: 'task-1',
    clubId: 'club-1',
    showId: 'show-1',
    title: 'Test task',
    status: 'todo',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    dueDate,
  };
}

/** Local calendar date key, ignoring any time-of-day. */
function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function freezeLocal(y: number, m: number, d: number): Date {
  const now = new Date(y, m - 1, d, 9, 30);
  vi.useFakeTimers();
  vi.setSystemTime(now);
  return now;
}

describe.each(['UTC', 'America/Chicago'])('task timeline day arithmetic in %s', zone => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = zone;
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs in the intended timezone (known-answer)', () => {
    expect(new Date(2026, 9, 19).getTimezoneOffset()).toBe(zone === 'UTC' ? 0 : 300);
    expect(new Date(2026, 10, 2).getTimezoneOffset()).toBe(zone === 'UTC' ? 0 : 360);
  });

  it('empty list spans today + 14 calendar days across the fall DST change', () => {
    freezeLocal(2026, 10, 19);
    const range = calcDateRange([]);
    expect(range.days).toHaveLength(15);
    expect(key(range.days[0])).toBe('2026-10-19');
    expect(key(range.days[14])).toBe('2026-11-02');
    expect(key(range.end)).toBe('2026-11-02');
    for (const day of range.days) expect(toDateOnly(day).getTime()).toBe(day.getTime());
  });

  it('empty list spans 15 dates across the spring DST change', () => {
    freezeLocal(2027, 3, 8);
    const range = calcDateRange([]);
    expect(range.days).toHaveLength(15);
    expect(key(range.days[14])).toBe('2027-03-22');
    for (const day of range.days) expect(toDateOnly(day).getTime()).toBe(day.getTime());
  });

  it('caps a far-future range at 45 days past today across fall DST', () => {
    freezeLocal(2026, 10, 19);
    const { dated } = splitDatedUndated([makeTask('2027-06-01')]);
    const range = calcDateRange(dated);
    expect(range.days).toHaveLength(46);
    expect(key(range.days[45])).toBe('2026-12-03');
  });

  it('caps a far-future range at 45 days past today across spring DST', () => {
    freezeLocal(2027, 2, 20);
    const { dated } = splitDatedUndated([makeTask('2027-09-01')]);
    const range = calcDateRange(dated);
    expect(range.days).toHaveLength(46);
    expect(key(range.days[45])).toBe('2027-04-06');
  });

  it('keeps a due date on the cap day inside the range across fall DST', () => {
    freezeLocal(2026, 10, 19);
    const { dated } = splitDatedUndated([makeTask('2026-12-03')]);
    const range = calcDateRange(dated);
    expect(key(range.days[range.days.length - 1])).toBe('2026-12-03');
  });

  it('treats a due date 7 calendar days out as this-week across fall DST, 8 as future', () => {
    const t = toDateOnly(freezeLocal(2026, 10, 28));
    expect(getUrgency(new Date(2026, 10, 4), t)).toBe('this-week');
    expect(getUrgency(new Date(2026, 10, 5), t)).toBe('future');
  });

  it('treats a due date 7 calendar days out as this-week across spring DST, 8 as future', () => {
    const t = toDateOnly(freezeLocal(2027, 3, 10));
    expect(getUrgency(new Date(2027, 2, 17), t)).toBe('this-week');
    expect(getUrgency(new Date(2027, 2, 18), t)).toBe('future');
  });

  it('keeps today and overdue buckets on the transition day', () => {
    const t = toDateOnly(freezeLocal(2026, 11, 1));
    expect(getUrgency(new Date(2026, 10, 1), t)).toBe('today');
    expect(getUrgency(new Date(2026, 9, 31), t)).toBe('overdue');
  });
});
