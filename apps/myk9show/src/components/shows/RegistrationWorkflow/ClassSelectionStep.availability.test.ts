import { describe, it, expect } from 'vitest';
import {
  buildAvailabilityMap,
  isAvailabilityUnreadable,
  resolveConfiguredRegistryId,
} from './ClassSelectionStep.availability';

describe('isAvailabilityUnreadable', () => {
  // The offline case is the one that matters: the query PAUSES rather than
  // failing, so it reports isLoading false with a null error and no rows. Every
  // signal says "settled", and a bare `cls.isFull &&` check downstream then
  // renders a full class exactly like one with room.
  it('is true when the query settled with no rows and no error (paused offline)', () => {
    expect(isAvailabilityUnreadable({ isLoading: false, error: null, rowCount: 0 })).toBe(true);
  });

  it('is true when the query errored', () => {
    expect(
      isAvailabilityUnreadable({ isLoading: false, error: new Error('network'), rowCount: 0 })
    ).toBe(true);
  });

  it('is true when the query errored even though stale rows are present', () => {
    expect(
      isAvailabilityUnreadable({ isLoading: false, error: new Error('network'), rowCount: 4 })
    ).toBe(true);
  });

  it('is false while the query is still loading', () => {
    expect(isAvailabilityUnreadable({ isLoading: true, error: null, rowCount: 0 })).toBe(false);
  });

  it('is false once rows have resolved', () => {
    expect(isAvailabilityUnreadable({ isLoading: false, error: null, rowCount: 3 })).toBe(false);
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

describe('resolveConfiguredRegistryId', () => {
  const configured = ['akc', 'ukc', 'asca'];

  it('accepts a configured id', () => {
    expect(resolveConfiguredRegistryId('ukc', configured)).toBe('ukc');
  });

  it('trims before matching', () => {
    expect(resolveConfiguredRegistryId('  akc  ', configured)).toBe('akc');
  });

  it('rejects an unrecognised id rather than passing it through', () => {
    expect(resolveConfiguredRegistryId('made-up', configured)).toBeNull();
  });

  it('treats blank and missing values as absent', () => {
    expect(resolveConfiguredRegistryId('   ', configured)).toBeNull();
    expect(resolveConfiguredRegistryId(null, configured)).toBeNull();
    expect(resolveConfiguredRegistryId(undefined, configured)).toBeNull();
  });
});
