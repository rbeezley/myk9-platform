import { describe, it, expect } from 'vitest';
import {
  buildAvailabilityMap,
  getClassEntryWindow,
  isAvailabilityUnreadable,
} from './ClassSelectionStep.availability';

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

describe('getClassEntryWindow (MYK9-516)', () => {
  it('blocks a class the judge has already started', () => {
    expect(getClassEntryWindow({ status: 'in_progress', isStaff: false })).toEqual({
      enterable: false,
      reason: 'This class has started',
    });
  });

  it('blocks a class that has finished', () => {
    expect(getClassEntryWindow({ status: 'completed', isStaff: false })).toEqual({
      enterable: false,
      reason: 'This class has finished',
    });
  });

  it('accepts the canonical spellings too, not only the database ones', () => {
    // Three sources feed this step and they disagree on spelling: the
    // replicated class carries 'In Progress', the availability read carries
    // 'in_progress'. Reading only one is how the guard would quietly stop
    // applying on the path the step actually prefers.
    expect(getClassEntryWindow({ status: 'In Progress', isStaff: false }).enterable).toBe(false);
    expect(getClassEntryWindow({ status: 'Completed', isStaff: false }).enterable).toBe(false);
  });

  it('leaves an upcoming or setup class enterable', () => {
    expect(getClassEntryWindow({ status: 'upcoming', isStaff: false })).toEqual({
      enterable: true,
      reason: null,
    });
    expect(getClassEntryWindow({ status: 'setup', isStaff: false }).enterable).toBe(true);
    expect(getClassEntryWindow({ status: 'Scheduled', isStaff: false }).enterable).toBe(true);
  });

  it('does not block staff, who take late entries at the gate by design', () => {
    expect(getClassEntryWindow({ status: 'in_progress', isStaff: true })).toEqual({
      enterable: true,
      reason: null,
    });
    expect(getClassEntryWindow({ status: 'completed', isStaff: true }).enterable).toBe(true);
  });

  it('falls back to enterable for an unreadable status rather than indexing undefined', () => {
    // Offline the availability query pauses and the row never arrives; a source
    // that predates the column carries nothing. The server guard is the one
    // that must not be skippable, so the client stays quiet rather than
    // blocking a class it cannot describe.
    expect(getClassEntryWindow({ status: undefined, isStaff: false }).enterable).toBe(true);
    expect(getClassEntryWindow({ status: null, isStaff: false }).enterable).toBe(true);
    expect(getClassEntryWindow({ status: '', isStaff: false }).enterable).toBe(true);
    expect(getClassEntryWindow({ status: 'something_new', isStaff: false }).enterable).toBe(true);
  });
});
