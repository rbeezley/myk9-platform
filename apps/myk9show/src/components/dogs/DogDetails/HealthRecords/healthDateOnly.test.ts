import { describe, it, expect } from 'vitest';
import { parseHealthDate, formatHealthDate, healthDateYear } from './healthDateOnly';

describe('parseHealthDate', () => {
  it('preserves the entered calendar day (assert via component getters, not host TZ)', () => {
    const date = parseHealthDate('2026-07-23');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6); // 0-based: July
    expect(date.getDate()).toBe(23);
  });

  it('does not shift the day when parsed as if it were UTC midnight', () => {
    // The classic bug: new Date('2026-07-23') is UTC midnight, which renders
    // as July 22 in any negative UTC offset (e.g. America/Chicago, UTC-5/-6).
    const buggy = new Date('2026-07-23');
    const fixed = parseHealthDate('2026-07-23');
    // Regardless of host TZ, the fixed parse must read as day 23.
    expect(fixed.getDate()).toBe(23);
    // Document the divergence this helper avoids: the naive parser's local
    // day depends on host offset and does not reliably equal 23.
    void buggy;
  });

  it('handles a month boundary (last day of month)', () => {
    const date = parseHealthDate('2026-01-31');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(31);
  });

  it('handles a month boundary (first day of next month)', () => {
    const date = parseHealthDate('2026-02-01');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(1);
    expect(date.getDate()).toBe(1);
  });

  it('handles a year boundary (Dec 31)', () => {
    const date = parseHealthDate('2025-12-31');
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(11);
    expect(date.getDate()).toBe(31);
  });

  it('handles a year boundary (Jan 1)', () => {
    const date = parseHealthDate('2026-01-01');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
  });

  it('returns an Invalid Date for malformed input rather than throwing', () => {
    const date = parseHealthDate('not-a-date');
    expect(isNaN(date.getTime())).toBe(true);
  });
});

describe('formatHealthDate', () => {
  it('formats without shifting the day', () => {
    expect(formatHealthDate('2026-07-23')).toBe(new Date(2026, 6, 23).toLocaleDateString('en-US'));
  });

  it('round-trips an edited date string back to the same displayed day', () => {
    // Simulates the Edit dialog flow: an <input type="date"> holds the raw
    // 'YYYY-MM-DD' string; saving and re-displaying it must show the same day.
    const savedValue = '2026-12-31';
    expect(formatHealthDate(savedValue)).toBe(new Date(2026, 11, 31).toLocaleDateString('en-US'));
  });

  it('returns empty string for malformed input', () => {
    expect(formatHealthDate('')).toBe('');
  });
});

describe('healthDateYear', () => {
  it('reads the calendar year without a UTC day shift', () => {
    expect(healthDateYear('2026-01-01')).toBe(2026);
    expect(healthDateYear('2025-12-31')).toBe(2025);
  });

  it('returns null for malformed input', () => {
    expect(healthDateYear('nope')).toBeNull();
  });
});

describe('America/Chicago TZ semantics', () => {
  const originalTz = process.env.TZ;

  it('still reads July 23 under a negative UTC offset host timezone', () => {
    process.env.TZ = 'America/Chicago';
    try {
      const date = parseHealthDate('2026-07-23');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(6);
      expect(date.getDate()).toBe(23);
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });
});
