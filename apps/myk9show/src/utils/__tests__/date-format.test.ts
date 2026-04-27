import { describe, it, expect } from 'vitest';
import { toLocalDateOnly, toLocalDate, formatDateRange } from '../date-format';

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
