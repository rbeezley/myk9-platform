import { describe, expect, it } from 'vitest';
import {
  expectedEntries,
  isAccountedFor,
  isExpectedEntry,
  outstandingEntries,
} from '../entryAccounting';

describe('isExpectedEntry', () => {
  it('counts an ordinary confirmed entry', () => {
    expect(isExpectedEntry({ entry_status: 'confirmed', check_in_status: 'checked-in' })).toBe(true);
  });

  it.each(['scratched', 'withdrawn'])('excludes %s', status => {
    expect(isExpectedEntry({ entry_status: status })).toBe(false);
  });

  // MYK9-330. A move-up leaves the SOURCE row live in its original class at
  // entry_status='moved' (showMapActionMutations creates the destination entry,
  // then marks the original — deliberately not soft-deleted). Counting it as
  // expected meant the class could never reach accounted === expected, so it
  // never completed and its dogs were never given placements.
  it('excludes the source row of a move-up', () => {
    expect(isExpectedEntry({ entry_status: 'moved' })).toBe(false);
  });

  it('excludes an entry the secretary did not accept', () => {
    expect(isExpectedEntry({ entry_status: 'not_accepted' })).toBe(false);
  });

  it('excludes a pulled entry regardless of lifecycle status', () => {
    expect(isExpectedEntry({ entry_status: 'confirmed', check_in_status: 'pulled' })).toBe(false);
  });

  it('excludes a soft-deleted entry', () => {
    expect(isExpectedEntry({ entry_status: 'confirmed', deleted_at: '2026-09-01T00:00:00Z' })).toBe(
      false
    );
  });

  it('reads camelCase, snake_case and the bare `status` alias', () => {
    expect(isExpectedEntry({ entryStatus: 'moved' })).toBe(false);
    expect(isExpectedEntry({ entry_status: 'moved' })).toBe(false);
    expect(isExpectedEntry({ status: 'moved' })).toBe(false);
  });

  it('normalizes casing and surrounding whitespace', () => {
    expect(isExpectedEntry({ entry_status: '  MOVED ' })).toBe(false);
  });

  it('treats a missing status as expected — an untouched entry still has to run', () => {
    expect(isExpectedEntry({})).toBe(true);
  });
});

describe('isAccountedFor', () => {
  it('counts a scored entry', () => {
    expect(isAccountedFor({ is_scored: true })).toBe(true);
  });

  it.each(['absent', 'excused'])('counts a %s result, which settles without a score', status => {
    expect(isAccountedFor({ is_scored: false, result_status: status })).toBe(true);
  });

  it('does not count a pending result', () => {
    expect(isAccountedFor({ is_scored: false, result_status: 'pending' })).toBe(false);
  });
});

describe('completion over a class holding a move-up', () => {
  // The exact shape MYK9-330 reported: every dog that ran is scored, one row is
  // the retired source of a move-up. The class must read finished.
  const entries = [
    { entry_status: 'checked-in', is_scored: true, result_status: 'qualified' },
    { entry_status: 'checked-in', is_scored: true, result_status: 'qualified' },
    { entry_status: 'moved', is_scored: false, result_status: 'pending' },
  ];

  it('leaves no outstanding work', () => {
    expect(outstandingEntries(entries)).toEqual([]);
  });

  it('keeps the two real runs in the expected set', () => {
    expect(expectedEntries(entries)).toHaveLength(2);
  });
});

describe('a class of nothing but excluded rows', () => {
  // Boundary the server shares: expected === 0 is NOT completion. Callers must
  // still be able to tell "everything ran" from "nothing was ever expected".
  const entries = [{ entry_status: 'moved' }, { entry_status: 'not_accepted' }];

  it('has an empty expected set', () => {
    expect(expectedEntries(entries)).toEqual([]);
  });
});
