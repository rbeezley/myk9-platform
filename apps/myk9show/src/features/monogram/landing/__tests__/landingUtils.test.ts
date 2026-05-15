import { describe, expect, it } from 'vitest';
import { formatDateInTimezone, formatDateRange } from '../utils/dateFormat';

const TZ = 'America/Chicago';

describe('formatDateInTimezone', () => {
  it('formats short dates with month-short, day, year', () => {
    // 2026-06-12 noon UTC → "Jun 12, 2026" in CT
    expect(formatDateInTimezone('2026-06-12T12:00:00Z', TZ, 'short')).toBe('Jun 12, 2026');
  });

  it('formats long dates with weekday + month + day + year', () => {
    const out = formatDateInTimezone('2026-06-12T12:00:00Z', TZ, 'long');
    expect(out).toMatch(/Friday/);
    expect(out).toMatch(/June 12/);
    expect(out).toMatch(/2026/);
  });

  it('formats monthDay (no year) for compact hero meta cells', () => {
    expect(formatDateInTimezone('2026-06-12T12:00:00Z', TZ, 'monthDay')).toBe('Jun 12');
  });

  it('returns empty string for unparseable ISO input', () => {
    expect(formatDateInTimezone('not-a-date', TZ, 'short')).toBe('');
  });
});

describe('formatDateRange', () => {
  it('renders just the start date when end is null', () => {
    expect(formatDateRange('2026-06-12T12:00:00Z', null, TZ)).toBe('Jun 12');
  });

  it('collapses to a same-month en-dash range', () => {
    expect(formatDateRange('2026-06-12T12:00:00Z', '2026-06-14T12:00:00Z', TZ)).toBe('Jun 12–14');
  });

  it('uses an em-dash with both months when the range spans months', () => {
    expect(formatDateRange('2026-06-30T12:00:00Z', '2026-07-02T12:00:00Z', TZ)).toBe(
      'Jun 30 – Jul 2'
    );
  });

  it('treats equal start/end as a single date', () => {
    expect(formatDateRange('2026-06-12T12:00:00Z', '2026-06-12T12:00:00Z', TZ)).toBe('Jun 12');
  });

  it('returns empty string when start is null', () => {
    expect(formatDateRange(null, '2026-06-14T12:00:00Z', TZ)).toBe('');
  });
});
