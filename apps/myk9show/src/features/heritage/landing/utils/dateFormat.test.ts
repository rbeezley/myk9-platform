import { describe, it, expect } from 'vitest';
import { formatDateInTimezone, formatJourneyDate } from './dateFormat';

/**
 * exhibitor-ux-remediation (date-formatting delta): a DATE-only column value
 * ("2026-08-01") must render as that literal calendar date regardless of the
 * trial's timezone — `new Date('2026-08-01')` is UTC midnight, and converting
 * that instant into a timezone behind UTC (e.g. Central for a Tulsa, OK show)
 * previously rolled the displayed date back to Jul 31.
 */
describe('formatDateInTimezone — date-only values', () => {
  it('does not roll a date-only show start date back a day in a timezone behind UTC', () => {
    expect(formatDateInTimezone('2026-08-01', 'America/Chicago', 'short')).toBe('Aug 1, 2026');
  });

  it('does not roll a date-only entries-close date back a day', () => {
    expect(formatDateInTimezone('2026-06-30', 'America/Chicago', 'long')).toBe(
      'Tuesday, June 30, 2026'
    );
  });

  it('still applies the trial timezone to a genuine timestamp', () => {
    // A real instant near UTC midnight — this SHOULD shift by timezone,
    // unlike a bare date-only string.
    const result = formatDateInTimezone('2026-08-01T02:00:00Z', 'America/Chicago', 'short');
    expect(result).toBe('Jul 31, 2026');
  });

  it('returns no time-of-day for a date-only value in "time" format', () => {
    expect(formatDateInTimezone('2026-08-01', 'America/Chicago', 'time')).toBe('');
  });
});

describe('formatJourneyDate — date-only values', () => {
  it('does not roll a date-only trial start date back a day', () => {
    expect(formatJourneyDate('2026-08-01', 'America/Chicago')).toBe('Aug 1');
  });
});
