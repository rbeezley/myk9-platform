/**
 * Tests for the at-show ownership snapshot: pure derivation/persistence helpers
 * plus the useMyAtShowEntries hook that feeds "highlight MY dogs" surfaces.
 *
 * The persistence contract matters here: overwrite-if-changed (NOT merge) so a
 * scratched entry drops out, and storage keyed by user so a shared device never
 * replays the previous account's dogs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { HydratedAccountTodayEntry } from '@/features/show-today/showTodayBanner.helpers';
import {
  buildMyEntriesStorageKey,
  deriveMyAtShowEntrySets,
  persistMyAtShowEntries,
  readMyAtShowEntries,
} from './myAtShowEntries.helpers';

let mockUser: { id: string } | null = null;
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: mockUser }),
}));

let mockAccountEntries: {
  data: HydratedAccountTodayEntry[] | undefined;
  isLoading: boolean;
} = { data: undefined, isLoading: false };
vi.mock('@/features/show-today/accountTodayEntries', () => ({
  useAccountTodayEntries: () => mockAccountEntries,
}));

import { useMyAtShowEntries } from './useMyAtShowEntries';

const SHOW = 'show-1';
const USER = 'user-1';

function hydrated(overrides: Partial<HydratedAccountTodayEntry>): HydratedAccountTodayEntry {
  return {
    entryId: 'entry-1',
    showId: SHOW,
    showName: 'Spring Classic',
    classId: 'class-1',
    trialId: 'trial-1',
    className: 'Container Novice',
    classStartTime: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  mockUser = { id: USER };
  mockAccountEntries = { data: undefined, isLoading: false };
});
afterEach(() => vi.clearAllMocks());

describe('deriveMyAtShowEntrySets', () => {
  it('filters to the requested show and dedupes class ids', () => {
    const sets = deriveMyAtShowEntrySets(
      [
        hydrated({ entryId: 'e1', classId: 'c1' }),
        hydrated({ entryId: 'e2', classId: 'c1' }),
        hydrated({ entryId: 'e3', classId: 'c2', showId: 'other-show' }),
      ],
      SHOW
    );
    expect(sets.entryIds).toEqual(['e1', 'e2']);
    expect(sets.classIds).toEqual(['c1']);
  });

  it('skips null classId without dropping the entry', () => {
    const sets = deriveMyAtShowEntrySets([hydrated({ entryId: 'e1', classId: null })], SHOW);
    expect(sets.entryIds).toEqual(['e1']);
    expect(sets.classIds).toEqual([]);
  });
});

describe('persist/read round-trip', () => {
  it('round-trips through localStorage keyed by show AND user', () => {
    const sets = { entryIds: ['e1'], classIds: ['c1'] };
    expect(persistMyAtShowEntries(SHOW, USER, sets)).toBe(true);
    expect(readMyAtShowEntries(SHOW, USER)).toEqual(sets);
    expect(readMyAtShowEntries(SHOW, 'other-user')).toEqual({ entryIds: [], classIds: [] });
  });

  it('returns false (no write) when membership is unchanged regardless of order', () => {
    persistMyAtShowEntries(SHOW, USER, { entryIds: ['e1', 'e2'], classIds: ['c1'] });
    expect(persistMyAtShowEntries(SHOW, USER, { entryIds: ['e2', 'e1'], classIds: ['c1'] })).toBe(
      false
    );
  });

  it('overwrites (not merges) so removed entries drop out', () => {
    persistMyAtShowEntries(SHOW, USER, { entryIds: ['e1', 'e2'], classIds: ['c1', 'c2'] });
    persistMyAtShowEntries(SHOW, USER, { entryIds: ['e1'], classIds: ['c1'] });
    expect(readMyAtShowEntries(SHOW, USER)).toEqual({ entryIds: ['e1'], classIds: ['c1'] });
  });

  it('survives corrupted storage', () => {
    localStorage.setItem(buildMyEntriesStorageKey(SHOW, USER), '{not json');
    expect(readMyAtShowEntries(SHOW, USER)).toEqual({ entryIds: [], classIds: [] });
    localStorage.setItem(buildMyEntriesStorageKey(SHOW, USER), JSON.stringify({ entryIds: [1] }));
    expect(readMyAtShowEntries(SHOW, USER)).toEqual({ entryIds: [], classIds: [] });
  });
});

describe('useMyAtShowEntries', () => {
  it('derives sets from fresh query data and persists the snapshot', () => {
    mockAccountEntries = {
      data: [hydrated({ entryId: 'e1', classId: 'c1' })],
      isLoading: false,
    };
    const { result } = renderHook(() => useMyAtShowEntries(SHOW));

    expect(result.current.ownEntryIds.has('e1')).toBe(true);
    expect(result.current.ownClassIds.has('c1')).toBe(true);
    expect(readMyAtShowEntries(SHOW, USER)).toEqual({ entryIds: ['e1'], classIds: ['c1'] });
  });

  it('hydrates from the persisted snapshot when the query is cold (offline start)', () => {
    persistMyAtShowEntries(SHOW, USER, { entryIds: ['e9'], classIds: ['c9'] });
    mockAccountEntries = { data: undefined, isLoading: true };

    const { result } = renderHook(() => useMyAtShowEntries(SHOW));
    expect(result.current.ownEntryIds.has('e9')).toBe(true);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns empty sets when signed out, even with another user persisted', () => {
    persistMyAtShowEntries(SHOW, USER, { entryIds: ['e9'], classIds: ['c9'] });
    mockUser = null;

    const { result } = renderHook(() => useMyAtShowEntries(SHOW));
    expect(result.current.ownEntryIds.size).toBe(0);
    expect(result.current.ownClassIds.size).toBe(0);
  });

  it('returns empty sets without showId', () => {
    const { result } = renderHook(() => useMyAtShowEntries(undefined));
    expect(result.current.ownEntryIds.size).toBe(0);
  });

  it('staff with zero entries gets empty sets and an empty persisted snapshot', () => {
    persistMyAtShowEntries(SHOW, USER, { entryIds: ['stale'], classIds: ['stale-c'] });
    mockAccountEntries = { data: [], isLoading: false };

    const { result } = renderHook(() => useMyAtShowEntries(SHOW));
    expect(result.current.ownEntryIds.size).toBe(0);
    expect(readMyAtShowEntries(SHOW, USER)).toEqual({ entryIds: [], classIds: [] });
  });
});
