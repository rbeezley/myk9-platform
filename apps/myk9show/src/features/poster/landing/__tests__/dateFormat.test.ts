import { describe, expect, it } from 'vitest';
import {
  formatDateInTimezone,
  formatDateRange,
  padTrialNumber,
} from '../utils/dateFormat';

describe('formatDateInTimezone', () => {
  it('formats short dates with year', () => {
    expect(formatDateInTimezone('2026-06-12T00:00:00Z', 'America/Chicago', 'short')).toBe(
      'Jun 12, 2026'
    );
  });

  it('formats long dates with weekday', () => {
    const out = formatDateInTimezone('2026-06-12T00:00:00Z', 'America/Chicago', 'long');
    expect(out).toContain('2026');
    // Was /(Friday|Thursday)/ -- loose enough to pass either way. June 12 2026
    // is a Friday, and a stored show date must render as the day it names.
    expect(out).toContain('Friday');
    expect(out).not.toContain('Thursday');
  });

  it('formats time with timeZoneName', () => {
    const out = formatDateInTimezone('2026-06-03T20:00:00-05:00', 'America/Chicago', 'time');
    expect(out).toMatch(/8:00\s?PM/);
  });

  it('formats monthDay (short)', () => {
    const out = formatDateInTimezone('2026-06-03T00:00:00Z', 'America/Chicago', 'monthDay');
    expect(out).toBe('Jun 3');
  });

  it('formats monthDayUpper as uppercase', () => {
    const out = formatDateInTimezone('2026-06-03T00:00:00Z', 'America/Chicago', 'monthDayUpper');
    expect(out).toBe('JUN 3');
    expect(out).not.toMatch(/Jun/);
  });

  /**
   * A calendar date has no time-of-day. The shared resolver returns a
   * LOCAL-midnight Date for one, so an unguarded 'time' branch renders
   * "12:00 AM" labelled with the VIEWER's timezone -- a fabricated deadline
   * that also contradicts the countdown rendered beside it.
   *
   * The existing 'time' case below feeds a real instant, which is why this gap
   * survived: a fixture in a shape the column never emits proves nothing about
   * the shape it does.
   */
  it('renders no time-of-day for a stored calendar date', () => {
    expect(formatDateInTimezone('2026-06-12T00:00:00Z', 'America/Chicago', 'time')).toBe('');
  });

  it('returns the input on parse failure', () => {
    expect(formatDateInTimezone('not-a-date', 'America/Chicago', 'short')).toBe('');
  });
});

describe('formatDateRange', () => {
  it('returns empty string when start is null', () => {
    expect(formatDateRange(null, null, 'America/Chicago')).toBe('');
  });

  it('formats same-month range with em dash', () => {
    const out = formatDateRange('2026-06-12T00:00:00Z', '2026-06-14T00:00:00Z', 'America/Chicago');
    // Was an either/or alternation, which passed with the date rolled back.
    expect(out).toBe('Jun 12—14');
  });

  it('formats cross-month range with en dash and second month', () => {
    const out = formatDateRange('2026-06-29T00:00:00Z', '2026-07-02T00:00:00Z', 'America/Chicago');
    expect(out).toContain('Jun');
    expect(out).toContain('Jul');
  });

  it('uppercases when uppercase=true', () => {
    const out = formatDateRange(
      '2026-06-12T00:00:00Z',
      '2026-06-14T00:00:00Z',
      'America/Chicago',
      true
    );
    expect(out).toMatch(/JUN/);
    expect(out).not.toMatch(/Jun /);
  });

  it('uses the start date alone when start === end', () => {
    const out = formatDateRange('2026-06-12T00:00:00Z', '2026-06-12T00:00:00Z', 'America/Chicago');
    expect(out).toBe('Jun 12');
    expect(out).not.toContain('—');
  });
});

describe('padTrialNumber', () => {
  it('zero-pads single-digit numbers', () => {
    expect(padTrialNumber(1)).toBe('01');
    expect(padTrialNumber(9)).toBe('09');
  });

  it('passes through two-digit numbers', () => {
    expect(padTrialNumber(12)).toBe('12');
  });

  it('parses string numbers', () => {
    expect(padTrialNumber('3')).toBe('03');
  });

  it('returns the original string when not numeric', () => {
    expect(padTrialNumber('foo')).toBe('foo');
  });
});
