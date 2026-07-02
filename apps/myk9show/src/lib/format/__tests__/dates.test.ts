import { afterEach, describe, it, expect } from 'vitest';
import { formatShowDateRange, formatEntryDate, formatTime } from '../dates';

const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone) {
    process.env.TZ = originalTimezone;
  } else {
    delete process.env.TZ;
  }
});

describe('formatShowDateRange', () => {
  it.each(['America/Chicago', 'America/New_York'])(
    'renders the Heartland Aug 1–3 weekend as local calendar dates in %s',
    timezone => {
      process.env.TZ = timezone;

      expect(formatShowDateRange('2026-08-01', '2026-08-03')).toBe('Aug 1–3, 2026');
    }
  );

  it('renders a single-day show without a range', () => {
    expect(formatShowDateRange('2026-08-01', '2026-08-01')).toBe('Aug 1, 2026');
  });

  it('treats a missing end date as a single-day show', () => {
    expect(formatShowDateRange('2026-08-01', null)).toBe('Aug 1, 2026');
    expect(formatShowDateRange('2026-08-01')).toBe('Aug 1, 2026');
  });

  it('renders a cross-month range with both months', () => {
    expect(formatShowDateRange('2026-08-30', '2026-09-01')).toBe('Aug 30, 2026 – Sep 1, 2026');
  });

  it('renders a cross-year range with both years', () => {
    expect(formatShowDateRange('2026-12-31', '2027-01-02')).toBe('Dec 31, 2026 – Jan 2, 2027');
  });

  it('accepts ISO timestamps by using only their date component', () => {
    expect(formatShowDateRange('2026-08-01T00:00:00+00:00', '2026-08-03T00:00:00+00:00')).toBe(
      'Aug 1–3, 2026'
    );
  });

  it('returns an empty string for missing or unparseable input', () => {
    expect(formatShowDateRange(undefined, undefined)).toBe('');
    expect(formatShowDateRange(null, '2026-08-03')).toBe('');
    expect(formatShowDateRange('', '2026-08-03')).toBe('');
    expect(formatShowDateRange('not-a-date', '2026-08-03')).toBe('');
    expect(formatShowDateRange('2026-08-01', 'not-a-date')).toBe('');
  });
});

describe('formatEntryDate', () => {
  it.each(['America/Chicago', 'America/New_York'])(
    'renders the entry day with its true local weekday in %s',
    timezone => {
      process.env.TZ = timezone;

      // The C2 off-by-one bug rendered 2026-08-01 as "Fri Jul 31"; Aug 1 is a Saturday.
      expect(formatEntryDate('2026-08-01')).toBe('Sat, Aug 1, 2026');
    }
  );

  it('renders the long style for detail and confirmation headers', () => {
    expect(formatEntryDate('2026-08-01', { style: 'long' })).toBe('Saturday, August 1, 2026');
  });

  it('accepts ISO timestamps by using only their date component', () => {
    expect(formatEntryDate('2026-08-01T00:00:00+00:00')).toBe('Sat, Aug 1, 2026');
  });

  it('returns an empty string for missing or unparseable input', () => {
    expect(formatEntryDate(undefined)).toBe('');
    expect(formatEntryDate(null)).toBe('');
    expect(formatEntryDate('')).toBe('');
    expect(formatEntryDate('not-a-date')).toBe('');
  });
});

describe('formatTime', () => {
  it('renders an instant in the trial timezone', () => {
    expect(formatTime('2026-08-01T13:30:00Z', 'America/Chicago')).toBe('8:30 AM');
    expect(formatTime('2026-08-01T13:30:00Z', 'America/New_York')).toBe('9:30 AM');
  });

  it('renders afternoon times with PM', () => {
    expect(formatTime('2026-08-01T21:05:00Z', 'America/Chicago')).toBe('4:05 PM');
  });

  it('accepts a Date instance', () => {
    expect(formatTime(new Date('2026-08-01T13:30:00Z'), 'America/Chicago')).toBe('8:30 AM');
  });

  it('falls back to the viewer timezone when none is given', () => {
    expect(formatTime('2026-08-01T13:30:00Z')).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });

  it('returns an empty string for missing or unparseable input', () => {
    expect(formatTime(undefined)).toBe('');
    expect(formatTime(null)).toBe('');
    expect(formatTime('')).toBe('');
    expect(formatTime('not-a-time', 'America/Chicago')).toBe('');
  });
});
