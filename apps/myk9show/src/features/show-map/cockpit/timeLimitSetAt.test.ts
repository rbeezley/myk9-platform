import { describe, expect, it } from 'vitest';

import { formatTimeLimitSetAt } from './timeLimitSetAt';

const NOW = new Date('2026-11-17T22:00:00Z');

describe('formatTimeLimitSetAt (MYK9-2120)', () => {
  it('is the clock time in the show zone for a limit set today', () => {
    expect(formatTimeLimitSetAt('2026-11-17T19:14:00+00:00', 'America/New_York', NOW)).toBe(
      'set 2:14 PM'
    );
    expect(formatTimeLimitSetAt('2026-11-17T19:14:00Z', 'America/Los_Angeles', NOW)).toBe(
      'set 11:14 AM'
    );
  });

  it('adds the date for another day, judged in the show zone not UTC', () => {
    expect(formatTimeLimitSetAt('2026-11-16T19:14:00Z', 'America/New_York', NOW)).toBe(
      'set Nov 16, 2:14 PM'
    );
    // 03:30 UTC on the 17th is still the 16th in New York.
    expect(formatTimeLimitSetAt('2026-11-17T03:30:00Z', 'America/New_York', NOW)).toBe(
      'set Nov 16, 10:30 PM'
    );
  });

  it('is null for a missing or unreadable stamp', () => {
    expect(formatTimeLimitSetAt(null, 'America/New_York', NOW)).toBeNull();
    expect(formatTimeLimitSetAt(undefined, 'America/New_York', NOW)).toBeNull();
    expect(formatTimeLimitSetAt('not a date', 'America/New_York', NOW)).toBeNull();
  });
});
