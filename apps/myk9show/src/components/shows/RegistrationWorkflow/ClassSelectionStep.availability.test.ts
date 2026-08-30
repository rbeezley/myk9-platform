import { describe, it, expect } from 'vitest';
import { buildAvailabilityMap, isAvailabilityUnreadable } from './ClassSelectionStep.availability';

describe('isAvailabilityUnreadable', () => {
  // The offline case is the one that matters: the query PAUSES rather than
  // failing, so it reports isLoading false with a null error and no rows. Every
  // signal says "settled", and a bare `cls.isFull &&` check downstream then
  // renders a full class exactly like one with room.
  it('is true when the query settled with no rows (paused offline, or failed)', () => {
    expect(isAvailabilityUnreadable({ isLoading: false, rowCount: 0 })).toBe(true);
  });

  // A failed refetch that retained earlier rows still renders real Full and
  // Wait list badges, so the notice's "none are marked" would be false.
  it('is false when rows are present, even if the latest fetch failed', () => {
    expect(isAvailabilityUnreadable({ isLoading: false, rowCount: 4 })).toBe(false);
  });

  it('is false while the query is still loading', () => {
    expect(isAvailabilityUnreadable({ isLoading: true, rowCount: 0 })).toBe(false);
  });

  it('is false once rows have resolved', () => {
    expect(isAvailabilityUnreadable({ isLoading: false, rowCount: 3 })).toBe(false);
  });
});

describe('buildAvailabilityMap', () => {
  it('indexes rows by class id', () => {
    const map = buildAvailabilityMap([
      { classId: 'a', isFull: true, waitlistCount: 2, allowsWaitlist: true },
      { classId: 'b', isFull: false, waitlistCount: 0, allowsWaitlist: false },
    ]);

    expect(map.get('a')).toEqual({ isFull: true, waitlistCount: 2, allowsWaitlist: true });
    expect(map.get('b')).toEqual({ isFull: false, waitlistCount: 0, allowsWaitlist: false });
  });

  it('returns an empty map for no rows, so lookups miss rather than reporting "open"', () => {
    expect(buildAvailabilityMap([]).size).toBe(0);
    expect(buildAvailabilityMap([]).get('anything')).toBeUndefined();
  });
});

