import { describe, it, expect } from 'vitest';
import { easternDateKey, easternDayStartIso, easternDayStartMs } from './easternDay';

describe('easternDay', () => {
  it('starts the day at 04:00Z during daylight time (UTC-4)', () => {
    // 2026-08-01 12:00Z is 08:00 EDT; the Eastern day began at 04:00Z.
    expect(easternDayStartIso(Date.parse('2026-08-01T12:00:00Z'))).toBe('2026-08-01T04:00:00.000Z');
  });

  it('starts the day at 05:00Z during standard time (UTC-5)', () => {
    // The bug a hardcoded offset would cause: winter is an hour later in UTC.
    expect(easternDayStartIso(Date.parse('2026-01-15T12:00:00Z'))).toBe('2026-01-15T05:00:00.000Z');
  });

  it('an evening entry still counts as today, which a UTC boundary would lose', () => {
    // 2026-08-01 23:30 EDT is 2026-08-02 03:30Z — a UTC day boundary would file
    // this under tomorrow, during the hours a secretary is still taking entries.
    const lateEvening = Date.parse('2026-08-02T03:30:00Z');
    expect(easternDateKey(lateEvening)).toBe('2026-08-01');
    expect(easternDayStartMs(lateEvening)).toBe(Date.parse('2026-08-01T04:00:00Z'));
  });

  it('rolls over at Eastern midnight, not UTC midnight', () => {
    const justBefore = Date.parse('2026-08-01T03:59:00Z'); // 23:59 EDT Jul 31
    const justAfter = Date.parse('2026-08-01T04:01:00Z'); // 00:01 EDT Aug 1
    expect(easternDateKey(justBefore)).toBe('2026-07-31');
    expect(easternDateKey(justAfter)).toBe('2026-08-01');
    expect(easternDayStartMs(justBefore)).toBeLessThan(easternDayStartMs(justAfter));
  });

  it('the day start is always at or before now', () => {
    for (const iso of [
      '2026-01-01T00:00:00Z',
      '2026-03-08T07:30:00Z', // spring forward
      '2026-07-04T16:00:00Z',
      '2026-11-01T06:30:00Z', // fall back
    ]) {
      const now = Date.parse(iso);
      expect(easternDayStartMs(now)).toBeLessThanOrEqual(now);
    }
  });
});
