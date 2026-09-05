import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatMonthDay, formatMonthYear, formatShortCalendarDate } from '../dates';

/**
 * MYK9-384 sweep — the date-fns family.
 *
 * These cover the fields the sweep converted away from
 * `format(new Date(x), ...)`: `club_officers.term_start` / `term_end`,
 * `club_members.joined_date`, `secretary_tasks.due_date` (all DATE columns)
 * and `shows.start_date` (a timestamptz stored at midnight UTC).
 */
const ORIGINAL_TZ = process.env.TZ;

// America/Chicago is the reported repro; the others bracket it either side of
// UTC, since a calendar bug that only shifts west is invisible in UTC and CI.
const ZONES = ['America/Chicago', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati'] as const;

afterEach(() => {
  // Assigning `undefined` would store the STRING "undefined" and leave this
  // reused worker in an invalid zone for every later date test — the
  // order-dependent leak that only shows up under CI's --sequence.shuffle.
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TZ;
  }
});

describe.each(ZONES)('calendar formatters in %s', zone => {
  beforeEach(() => {
    process.env.TZ = zone;
  });

  it('reads the TZ under test (guards the parameterisation itself)', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
  });

  describe('formatMonthYear', () => {
    it('keeps a first-of-month term start in its own month', () => {
      // The sharp case: read as an instant, 2026-08-01 lands in JULY west of
      // UTC — a whole term mislabelled, not a one-day slip.
      expect(formatMonthYear('2026-08-01')).toBe('Aug 2026');
    });

    it('keeps a January term start in its own year', () => {
      expect(formatMonthYear('2027-01-01')).toBe('Jan 2027');
    });

    it('handles the midnight-UTC round-trip of a DATE column', () => {
      expect(formatMonthYear('2026-08-01T00:00:00+00:00')).toBe('Aug 2026');
    });

    it('renders empty for missing or unparseable input', () => {
      expect(formatMonthYear(null)).toBe('');
      expect(formatMonthYear(undefined)).toBe('');
      expect(formatMonthYear('not a date')).toBe('');
    });
  });

  describe('formatShortCalendarDate on a joined_date', () => {
    it('does not shift a first-of-month DATE backwards', () => {
      expect(formatShortCalendarDate('2026-08-01')).toBe('Aug 1, 2026');
    });

    it('does not shift the midnight-UTC show timestamp backwards', () => {
      // The clone-show picker: Oct 20 was rendering as Oct 19.
      expect(formatShortCalendarDate('2026-10-20T00:00:00+00:00')).toBe('Oct 20, 2026');
    });
  });

  describe('formatMonthDay on a due_date', () => {
    it('does not shift a due date across a month boundary', () => {
      expect(formatMonthDay('2026-09-01')).toBe('Sep 1');
    });

    it('does not shift a due date across a year boundary', () => {
      expect(formatMonthDay('2027-01-01')).toBe('Jan 1');
    });
  });
});
