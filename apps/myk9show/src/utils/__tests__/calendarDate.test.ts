/**
 * The contract `entryWindowDate` and `isDayOfShowEntry` both rely on, made a
 * tested contract rather than a docblock (MYK9-642 round 2, L-F4).
 *
 * The load-bearing clause is the THROW: `entryWindowDate` propagates it (an
 * invalid zone there is a bug worth surfacing) while `isDayOfShowEntry` catches
 * it and falls back to the browser date. Neither behaviour is safe if this
 * module quietly starts returning a string for an unrecognized zone.
 */

import { describe, expect, it } from 'vitest';
import { calendarDateInTimeZone, calendarDateLocal } from '../calendarDate';

// 03:00 UTC on the 18th: still the 17th in both US zones, already the 18th in UTC.
const INSTANT = new Date('2026-09-18T03:00:00Z');

describe('calendarDateInTimeZone', () => {
  it('reads the calendar date in the named zone, not the process zone', () => {
    expect(calendarDateInTimeZone(INSTANT, 'America/New_York')).toBe('2026-09-17');
    expect(calendarDateInTimeZone(INSTANT, 'America/Chicago')).toBe('2026-09-17');
    expect(calendarDateInTimeZone(INSTANT, 'UTC')).toBe('2026-09-18');
  });

  it('crosses the date line correctly', () => {
    expect(calendarDateInTimeZone(INSTANT, 'Pacific/Kiritimati')).toBe('2026-09-18');
    expect(calendarDateInTimeZone(INSTANT, 'Pacific/Niue')).toBe('2026-09-17');
  });

  it('zero-pads to a sortable YYYY-MM-DD, which is how callers compare dates', () => {
    const early = calendarDateInTimeZone(new Date('2026-01-05T12:00:00Z'), 'UTC');
    expect(early).toBe('2026-01-05');
    expect(early < '2026-01-06').toBe(true);
    expect(early > '2025-12-31').toBe(true);
  });

  it('THROWS on an unrecognized zone rather than guessing', () => {
    expect(() => calendarDateInTimeZone(INSTANT, 'Not/AZone')).toThrow(RangeError);
    expect(() => calendarDateInTimeZone(INSTANT, '')).toThrow(RangeError);
  });
});

describe('calendarDateLocal', () => {
  it("reads the date components of the runtime's own zone", () => {
    // Constructed from local components, so this holds in any CI timezone.
    expect(calendarDateLocal(new Date(2026, 8, 17, 23, 59, 59))).toBe('2026-09-17');
    expect(calendarDateLocal(new Date(2026, 0, 5, 0, 0, 0))).toBe('2026-01-05');
  });
});
