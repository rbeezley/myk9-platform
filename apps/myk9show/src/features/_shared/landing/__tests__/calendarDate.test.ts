/**
 * These test the shape the DATABASE actually produces.
 *
 * That distinction is the whole reason this module exists. `shows.start_date`,
 * `end_date`, `entry_open_date` and `entry_close_date` are `timestamptz`
 * (migration 035 converted them from DATE), so PostgREST serializes them as
 * `2026-09-01T00:00:00+00:00`. Every landing variant guarded on a bare
 * `YYYY-MM-DD` instead — a form these columns have not emitted since that
 * migration — so the corrected branch was dead code and all eight rendered the
 * day before, west of UTC.
 *
 * The existing per-variant tests passed throughout, because each one fed the
 * formatter a fixture in a format the column never produces. A fixture is only
 * evidence if it matches what the source actually emits.
 */
import { describe, it, expect } from 'vitest';
import { getCalendarDayParts, resolveDisplayDate, toLocalCalendarDate } from '../calendarDate';

describe('getCalendarDayParts', () => {
  it('reads a midnight-UTC timestamptz as the calendar day it names', () => {
    // The real format. This is the case every variant got wrong.
    expect(getCalendarDayParts('2026-09-01T00:00:00+00:00')).toEqual({
      year: 2026,
      month: 9,
      day: 1,
    });
  });

  it.each([
    '2026-09-01',
    '2026-09-01T00:00:00Z',
    '2026-09-01T00:00:00+00:00',
    '2026-09-01T00:00:00+0000',
    '2026-09-01T00:00:00.000Z',
  ])('accepts %s as a calendar day', value => {
    expect(getCalendarDayParts(value)).toEqual({ year: 2026, month: 9, day: 1 });
  });

  it('treats a genuine mid-day instant as an instant, not a day', () => {
    // Widening this to a whole day would silently move a real cutoff.
    expect(getCalendarDayParts('2026-09-01T17:00:00+00:00')).toBeNull();
  });

  it('treats a non-UTC midnight as an instant', () => {
    expect(getCalendarDayParts('2026-09-01T00:00:00-05:00')).toBeNull();
  });

  it('rejects impossible dates rather than rolling them over', () => {
    expect(getCalendarDayParts('2026-02-31')).toBeNull();
    expect(getCalendarDayParts('2026-13-01')).toBeNull();
  });

  it('returns null for empty and nullish input', () => {
    expect(getCalendarDayParts('')).toBeNull();
    expect(getCalendarDayParts(null)).toBeNull();
    expect(getCalendarDayParts(undefined)).toBeNull();
  });
});

describe('toLocalCalendarDate', () => {
  it('carries the named day with no timezone shift', () => {
    const date = toLocalCalendarDate({ year: 2026, month: 9, day: 1 });
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(1);
  });
});

describe('resolveDisplayDate', () => {
  it('formats a stored show date as its own day, and never through a zone', () => {
    // The regression this module exists to prevent: a September 1 show date
    // rendering as "Aug 31" for a Chicago or New York viewer.
    const { date, isCalendarDay } = resolveDisplayDate('2026-09-01T00:00:00+00:00');
    expect(isCalendarDay).toBe(true);
    expect(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).toBe('Sep 1');

    // Proof the OLD path was wrong: the same value, run through a zone as an
    // instant, lands on the previous day for every US timezone.
    const asInstant = new Date('2026-09-01T00:00:00+00:00');
    for (const timeZone of ['America/Chicago', 'America/New_York', 'America/Los_Angeles']) {
      expect(asInstant.toLocaleDateString('en-US', { timeZone, day: 'numeric' })).toBe('31');
    }
  });

  it('keeps a real instant zone-sensitive', () => {
    const { date, isCalendarDay } = resolveDisplayDate('2026-09-01T02:00:00+00:00');
    expect(isCalendarDay).toBe(false);
    expect(date.toLocaleDateString('en-US', { timeZone: 'America/Chicago', day: 'numeric' })).toBe(
      '31'
    );
  });
});
