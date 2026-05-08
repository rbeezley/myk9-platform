import { describe, it, expect } from 'vitest';
import { toRoman, buildJourneySteps } from '../landing/useHeritageLandingData';
import { formatDateInTimezone, formatJourneyDate } from '../landing/utils/dateFormat';

// ─── toRoman ────────────────────────────────────────────────────────────────

describe('toRoman', () => {
  it('converts 1–12 (the practical trial-number range)', () => {
    expect(toRoman(1)).toBe('I');
    expect(toRoman(2)).toBe('II');
    expect(toRoman(3)).toBe('III');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(6)).toBe('VI');
    expect(toRoman(9)).toBe('IX');
    expect(toRoman(12)).toBe('XII');
  });

  it('accepts string numeric input', () => {
    expect(toRoman('5')).toBe('V');
    expect(toRoman('10')).toBe('X');
  });

  it('returns empty string for null / undefined', () => {
    expect(toRoman(null)).toBe('');
    expect(toRoman(undefined)).toBe('');
  });

  it('falls back to the original value for 0 and negatives', () => {
    expect(toRoman(0)).toBe('0');
    expect(toRoman(-1)).toBe('-1');
  });

  it('falls back to the string for NaN input', () => {
    expect(toRoman('abc')).toBe('abc');
  });
});

// ─── buildJourneySteps ──────────────────────────────────────────────────────

describe('buildJourneySteps', () => {
  const NOW = Date.now();
  const PAST = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
  const NEAR = new Date(NOW + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days out (active)
  const FAR = new Date(NOW + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days out (future)

  it('omits steps whose date is null', () => {
    const steps = buildJourneySteps(null, null, null, null, null);
    expect(steps).toHaveLength(0);
  });

  it('marks past dates as done', () => {
    const steps = buildJourneySteps(PAST, null, null, null, null);
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe('done');
  });

  it('marks dates within 7 days as active', () => {
    const steps = buildJourneySteps(null, NEAR, null, null, null);
    expect(steps[0].status).toBe('active');
  });

  it('marks dates beyond 7 days as future', () => {
    const steps = buildJourneySteps(null, FAR, null, null, null);
    expect(steps[0].status).toBe('future');
  });

  it('returns steps in the correct canonical order', () => {
    const steps = buildJourneySteps(PAST, FAR, null, FAR, null);
    expect(steps.map(s => s.label)).toEqual(['Entries open', 'Entries close', 'Trial begins']);
  });
});

// ─── formatDateInTimezone ────────────────────────────────────────────────────

describe('formatDateInTimezone', () => {
  it('formats a known ISO date in short mode', () => {
    const result = formatDateInTimezone('2026-06-03T00:00:00.000Z', 'UTC', 'short');
    expect(result).toContain('Jun');
    expect(result).toContain('2026');
  });

  it('returns empty string for an invalid ISO', () => {
    expect(formatDateInTimezone('not-a-date', 'UTC', 'short')).toBe('');
  });

  it('includes weekday in long format', () => {
    const result = formatDateInTimezone('2026-06-03T12:00:00.000Z', 'UTC', 'long');
    // June 3 2026 is a Wednesday
    expect(result).toContain('Wednesday');
  });
});

// ─── formatJourneyDate ───────────────────────────────────────────────────────

describe('formatJourneyDate', () => {
  it('formats a date to "D Mon" style', () => {
    const result = formatJourneyDate('2026-06-03T00:00:00.000Z', 'UTC');
    expect(result).toContain('Jun');
    expect(result).toContain('3');
  });

  it('returns empty string for an invalid ISO', () => {
    expect(formatJourneyDate('bad', 'UTC')).toBe('');
  });
});
