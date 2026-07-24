import { describe, expect, it } from 'vitest';
import { endOfLocalDay, toDateInputValue } from '../complimentaryPremiumDates';

describe('endOfLocalDay', () => {
  it('pins a YYYY-MM-DD date-input value to the last LOCAL instant of that day', () => {
    // `new Date('2026-08-15')` is midnight UTC, which is 2026-08-14 in any
    // negative-offset zone (e.g. America/Chicago) — a day early.
    expect(endOfLocalDay('2026-08-15')).toEqual(new Date(2026, 7, 15, 23, 59, 59, 999));
  });

  it('keeps the selected calendar day when converted back to a local date string', () => {
    const end = endOfLocalDay('2026-01-01');
    expect(end).not.toBeNull();
    expect(toDateInputValue(end as Date)).toBe('2026-01-01');
  });

  it('returns null for an empty or malformed value', () => {
    expect(endOfLocalDay('')).toBeNull();
    expect(endOfLocalDay('08/15/2026')).toBeNull();
    expect(endOfLocalDay('2026-13-40')).toBeNull();
  });
});

describe('toDateInputValue', () => {
  it('formats using local components, not the UTC instant', () => {
    // 23:30 local on the 15th must still read as the 15th.
    expect(toDateInputValue(new Date(2026, 7, 15, 23, 30))).toBe('2026-08-15');
  });
});
