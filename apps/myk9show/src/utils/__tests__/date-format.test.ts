import { afterEach, describe, it, expect } from 'vitest';
import { toLocalDateOnly, toLocalDate, formatDateRange, showDateRangeStatus } from '../date-format';

const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone) {
    process.env.TZ = originalTimezone;
  } else {
    delete process.env.TZ;
  }
});

describe('toLocalDateOnly', () => {
  it('returns YYYY-MM-DD in the local timezone for an ISO datetime', () => {
    // Late-evening local time whose UTC representation falls on the next day.
    // e.g. America/Chicago user picking "May 14 11:59 PM" =>
    // toISOString() == "2026-05-15T04:59:00.000Z" but the user's intent was May 14.
    const localDate = new Date(2026, 4, 14, 23, 59, 0); // local May 14 11:59 PM
    expect(toLocalDateOnly(localDate.toISOString())).toBe('2026-05-14');
  });

  it('keeps the day for an early-morning local time', () => {
    const localDate = new Date(2026, 4, 15, 8, 0, 0); // local May 15 8:00 AM
    expect(toLocalDateOnly(localDate.toISOString())).toBe('2026-05-15');
  });

  it('returns the input unchanged when given a date-only string', () => {
    expect(toLocalDateOnly('2026-05-15')).toBe('2026-05-15');
  });

  it('returns the input unchanged when given an empty string', () => {
    expect(toLocalDateOnly('')).toBe('');
  });

  it('returns the input unchanged for an unparseable value', () => {
    expect(toLocalDateOnly('not-a-date')).toBe('not-a-date');
  });
});

describe('toLocalDate', () => {
  it('parses date-only as local midnight', () => {
    const d = toLocalDate('2026-05-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });

  it('strips time from ISO datetime and parses as local midnight', () => {
    const d = toLocalDate('2026-05-15T13:00:00.000Z');
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });
});

describe('formatDateRange', () => {
  it.each(['America/Chicago', 'America/New_York'])(
    'formats date-only Heartland range as local calendar dates in %s',
    timezone => {
      process.env.TZ = timezone;

      expect(formatDateRange('2026-08-01', '2026-08-03')).toBe('Aug 1–3, 2026');
    }
  );

  it('formats same-month range without repeating month', () => {
    expect(formatDateRange('2026-05-15', '2026-05-16', 'short', false)).toBe('May 15–16');
  });

  it('formats single-day range', () => {
    expect(formatDateRange('2026-05-15', '2026-05-15', 'short', false)).toBe('May 15');
  });

  it('formats cross-month range', () => {
    expect(formatDateRange('2026-04-30', '2026-05-02', 'short', false)).toBe('Apr 30 – May 2');
  });
});

describe('showDateRangeStatus', () => {
  // Boundary cases from docs/improve-audit-2026-07-11/001-show-date-utc-classification.md.
  // `now` is built with the local Date constructor so these assertions hold in any
  // timezone — the same way toLocalDate() interprets the "YYYY-MM-DD" columns.

  it('treats the final day as active through end-of-day local time (the case red under raw parsing)', () => {
    // Evening of the end date: a west-of-UTC user must still see the show as active.
    const now = new Date(2026, 4, 15, 20, 0); // 2026-05-15 20:00 local
    expect(showDateRangeStatus('2026-05-15', '2026-05-15', now)).toBe('active');
  });

  it('classifies past only after the end date has fully elapsed locally', () => {
    const now = new Date(2026, 4, 16, 0, 1); // 2026-05-16 00:01 local
    expect(showDateRangeStatus('2026-05-15', '2026-05-15', now)).toBe('past');
  });

  it('classifies a future start date as upcoming', () => {
    const now = new Date(2026, 4, 15, 12, 0); // 2026-05-15 12:00 local
    expect(showDateRangeStatus('2026-05-16', '2026-05-16', now)).toBe('upcoming');
  });

  it('treats a timestamptz-shaped UTC-midnight value identically to a date-only value', () => {
    const now = new Date(2026, 4, 15, 20, 0);
    expect(showDateRangeStatus('2026-05-15T00:00:00+00:00', '2026-05-15T00:00:00+00:00', now)).toBe(
      'active'
    );
  });

  it('is active on the first day of a multi-day show and past after the last', () => {
    const midShow = new Date(2026, 4, 16, 9, 0);
    expect(showDateRangeStatus('2026-05-15', '2026-05-17', midShow)).toBe('active');

    const afterShow = new Date(2026, 4, 18, 0, 1);
    expect(showDateRangeStatus('2026-05-15', '2026-05-17', afterShow)).toBe('past');

    const beforeShow = new Date(2026, 4, 14, 23, 0);
    expect(showDateRangeStatus('2026-05-15', '2026-05-17', beforeShow)).toBe('upcoming');
  });
});
