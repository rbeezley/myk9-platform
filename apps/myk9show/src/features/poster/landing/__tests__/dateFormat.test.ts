import { describe, expect, it } from 'vitest';
import {
  formatDateInTimezone,
  formatDateRange,
  padTrialNumber,
} from '../utils/dateFormat';

describe('formatDateInTimezone', () => {
  it('formats short dates with year', () => {
    expect(formatDateInTimezone('2026-06-12T00:00:00Z', 'America/Chicago', 'short')).toMatch(
      /Jun \d+, 2026/
    );
  });

  it('formats long dates with weekday', () => {
    const out = formatDateInTimezone('2026-06-12T00:00:00Z', 'America/Chicago', 'long');
    expect(out).toContain('2026');
    expect(out).toMatch(/(Friday|Thursday)/);
  });

  it('formats time with timeZoneName', () => {
    const out = formatDateInTimezone('2026-06-03T20:00:00-05:00', 'America/Chicago', 'time');
    expect(out).toMatch(/8:00\s?PM/);
  });

  it('formats monthDay (short)', () => {
    const out = formatDateInTimezone('2026-06-03T00:00:00Z', 'America/Chicago', 'monthDay');
    expect(out).toMatch(/Jun \d+/);
  });

  it('formats monthDayUpper as uppercase', () => {
    const out = formatDateInTimezone('2026-06-03T00:00:00Z', 'America/Chicago', 'monthDayUpper');
    expect(out).toMatch(/JUN \d+/);
    expect(out).not.toMatch(/Jun/);
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
    expect(out).toMatch(/Jun 12—14|Jun 11—13/);
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
    expect(out).toMatch(/Jun \d+$/);
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
