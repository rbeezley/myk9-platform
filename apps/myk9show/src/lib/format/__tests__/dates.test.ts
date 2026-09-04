import { afterEach, describe, it, expect } from 'vitest';
import {
  formatShowDateRange,
  formatEntryDate,
  formatDateOnly,
  formatLongDate,
  formatMonthDay,
  formatWeekdayMonthDay,
  formatShortDate,
  formatEntryDateTime,
  formatRecordDateTime,
  formatTime,
} from '../dates';

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

describe('date-only supporting styles', () => {
  it.each(['America/Chicago', 'America/New_York'])(
    'renders DATE-only values as their true local calendar day in %s',
    timezone => {
      process.env.TZ = timezone;

      expect(formatLongDate('2026-08-01')).toBe('August 1, 2026');
      expect(formatMonthDay('2026-08-01')).toBe('Aug 1');
      expect(formatWeekdayMonthDay('2026-08-01')).toBe('Sat, Aug 1');
    }
  );

  it('accepts Date instances', () => {
    const value = new Date(2026, 7, 1);

    expect(formatLongDate(value)).toBe('August 1, 2026');
    expect(formatMonthDay(value)).toBe('Aug 1');
    expect(formatWeekdayMonthDay(value)).toBe('Sat, Aug 1');
  });

  it('returns an empty string for missing or unparseable input', () => {
    expect(formatLongDate(undefined)).toBe('');
    expect(formatLongDate(null)).toBe('');
    expect(formatLongDate('')).toBe('');
    expect(formatLongDate('not-a-date')).toBe('');
    expect(formatMonthDay('not-a-date')).toBe('');
    expect(formatWeekdayMonthDay('not-a-date')).toBe('');
  });
});

describe('formatDateOnly', () => {
  it.each(['America/Chicago', 'America/New_York'])(
    'renders a DATE-only value as its stored calendar day in %s',
    timezone => {
      process.env.TZ = timezone;

      expect(formatDateOnly('2026-08-01')).toBe('8/1/2026');
    }
  );

  it('returns an empty string for missing or unparseable input', () => {
    expect(formatDateOnly(undefined)).toBe('');
    expect(formatDateOnly(null)).toBe('');
    expect(formatDateOnly('not-a-date')).toBe('');
  });
});

describe('formatShortDate', () => {
  it('renders a compact record date with no weekday', () => {
    expect(formatShortDate('2026-07-03T18:00:00Z')).toBe('Jul 3, 2026');
  });

  it.each(['America/Chicago', 'America/New_York'])(
    'renders a DATE-only value (e.g. a show start_date) as its true local calendar day in %s, not a day early',
    timezone => {
      process.env.TZ = timezone;
      // Regression: new Date('2026-08-01') parses as UTC midnight, which is
      // still Jul 31 in every timezone west of UTC.
      expect(formatShortDate('2026-08-01')).toBe('Aug 1, 2026');
    }
  );

  it('accepts a Date instance', () => {
    expect(formatShortDate(new Date('2026-07-03T18:00:00Z'))).toBe('Jul 3, 2026');
  });

  it('returns an empty string for missing or unparseable input', () => {
    expect(formatShortDate(undefined)).toBe('');
    expect(formatShortDate(null)).toBe('');
    expect(formatShortDate('')).toBe('');
    expect(formatShortDate('not-a-date')).toBe('');
  });
});

describe('formatEntryDateTime', () => {
  it('renders a record date and time together', () => {
    expect(formatEntryDateTime('2026-07-03T14:00:00')).toBe('Jul 3, 2:00 PM');
  });

  it('accepts a Date instance', () => {
    expect(formatEntryDateTime(new Date('2026-07-03T14:00:00'))).toBe('Jul 3, 2:00 PM');
  });

  it('returns an empty string for missing or unparseable input', () => {
    expect(formatEntryDateTime(undefined)).toBe('');
    expect(formatEntryDateTime(null)).toBe('');
    expect(formatEntryDateTime('')).toBe('');
    expect(formatEntryDateTime('not-a-date')).toBe('');
  });
});

describe('formatRecordDateTime', () => {
  it('renders a record date and time with year for printable or audit-like output', () => {
    expect(formatRecordDateTime('2026-07-03T14:00:00')).toBe('Jul 3, 2026, 2:00 PM');
  });

  it('accepts a Date instance', () => {
    expect(formatRecordDateTime(new Date('2026-07-03T14:00:00'))).toBe('Jul 3, 2026, 2:00 PM');
  });

  it('returns an empty string for missing or unparseable input', () => {
    expect(formatRecordDateTime(undefined)).toBe('');
    expect(formatRecordDateTime(null)).toBe('');
    expect(formatRecordDateTime('')).toBe('');
    expect(formatRecordDateTime('not-a-time')).toBe('');
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
