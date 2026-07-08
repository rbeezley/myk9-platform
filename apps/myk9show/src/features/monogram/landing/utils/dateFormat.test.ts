import { describe, it, expect } from 'vitest';
import { formatDateInTimezone, formatDateRange } from './dateFormat';

/**
 * exhibitor-ux-remediation (date-formatting delta): the audit walk exercised
 * the monogram theme (not heritage — confirmed via its "Trial particulars" /
 * "The roster" eyebrow text). A DATE-only column value ("2026-08-01") must
 * render as that literal calendar date regardless of the trial's timezone —
 * `new Date('2026-08-01')` is UTC midnight, and converting that instant into
 * a timezone behind UTC (e.g. Central for a Tulsa, OK show) previously rolled
 * the displayed range back a day ("Jul 31 – Aug 2" instead of "Aug 1–3").
 */
describe('formatDateInTimezone — date-only values', () => {
  it('does not roll a date-only date back a day in a timezone behind UTC', () => {
    expect(formatDateInTimezone('2026-08-01', 'America/Chicago', 'short')).toBe('Aug 1, 2026');
  });

  it('still applies the trial timezone to a genuine timestamp', () => {
    const result = formatDateInTimezone('2026-08-01T02:00:00Z', 'America/Chicago', 'short');
    expect(result).toBe('Jul 31, 2026');
  });

  it('returns no time-of-day for a date-only value in "time" format', () => {
    expect(formatDateInTimezone('2026-08-01', 'America/Chicago', 'time')).toBe('');
  });
});

describe('formatDateRange — date-only values', () => {
  it('renders a same-month date-only range without an off-by-one', () => {
    expect(formatDateRange('2026-08-01', '2026-08-03', 'America/Chicago')).toBe('Aug 1–3');
  });

  it('renders a cross-month date-only range without an off-by-one', () => {
    // The audit's exact reported case: a show spanning Jul 31 – Aug 2 must not
    // be misreported when the true dates are Aug 1–3.
    expect(formatDateRange('2026-07-31', '2026-08-02', 'America/Chicago')).toBe(
      'Jul 31 – Aug 2'
    );
  });

  it('renders a single date-only day with no range dash', () => {
    expect(formatDateRange('2026-08-01', '2026-08-01', 'America/Chicago')).toBe('Aug 1');
  });
});
