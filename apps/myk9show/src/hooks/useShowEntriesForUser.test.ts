import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useShowEntriesForUser } from './useShowEntriesForUser';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/store/entryStore', () => ({
  useEntryStore: vi.fn(),
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: vi.fn(),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: vi.fn(),
}));

vi.mock('@/hooks/useShowStoreCompat', () => ({
  useShowStoreCompat: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

import { useEntryStore } from '@/store/entryStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStoreCompat } from '@/hooks/useShowStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import { ScopeType, UserRole } from '@/types/auth-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-1';
const SHOW_ID = 'show-1';
const DOG_ID = 'dog-1';
const CLASS_ID = 'class-1';
const TRIAL_ID = 'trial-1';

function makeDog(overrides = {}) {
  return { id: DOG_ID, ownerId: USER_ID, callName: 'Maggie', name: 'Magnolia', ...overrides };
}

function makeClass(overrides = {}) {
  return {
    id: CLASS_ID,
    trialId: TRIAL_ID,
    trial: 'Trial 1',
    trialDate: '2026-05-10',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    className: 'Container Novice A',
    judge: 'Smith',
    startTime: '9:00 AM',
    ...overrides,
  };
}

function makeEntry(overrides = {}) {
  return {
    id: 'entry-1',
    showId: SHOW_ID,
    classId: CLASS_ID,
    dogId: DOG_ID,
    status: 'accepted',
    registrationData: { armband: '101', runOrder: 3, handler: 'Sarah', submittedAt: '', entryFee: 0, paymentStatus: 'paid' },
    competitionData: undefined,
    checkInStatus: 'no-status',
    ...overrides,
  };
}

function setMocks({
  entries = [makeEntry()],
  classes = [makeClass()],
  dogs = [makeDog()],
  shows = [{ id: SHOW_ID, clubId: 'club-1' }],
  userId = USER_ID,
  isAdmin = false,
  isSecretary = false,
  scopes = [],
  hasRole = vi.fn(() => false),
  isLoading = false,
  error = null,
} = {}) {
  vi.mocked(useAuthContext).mockReturnValue({
    userWithRoles: { databaseUserId: userId, scopes },
    isAdmin,
    isSecretary,
    hasRole,
  } as ReturnType<typeof useAuthContext>);

  vi.mocked(useEntryStore).mockImplementation((selector: (s: unknown) => unknown) => {
    const state = { entries, isLoading, error };
    return selector(state);
  });

  vi.mocked(useClassStoreCompat).mockReturnValue({ classes } as ReturnType<typeof useClassStoreCompat>);
  vi.mocked(useDogStoreCompat).mockReturnValue({ dogs } as ReturnType<typeof useDogStoreCompat>);
  vi.mocked(useShowStoreCompat).mockReturnValue({ shows } as ReturnType<typeof useShowStoreCompat>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useShowEntriesForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result when showId is undefined', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(undefined));
    expect(result.current.allEntries).toHaveLength(0);
    expect(result.current.dogGroups).toHaveLength(0);
  });

  it('returns empty result when user has no dogs', () => {
    setMocks({ dogs: [] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(0);
  });

  it('excludes entries from other shows', () => {
    setMocks({ entries: [makeEntry({ showId: 'other-show' })] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(0);
  });

  it('excludes entries for dogs owned by other users', () => {
    setMocks({ dogs: [makeDog({ ownerId: 'other-user' })] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(0);
  });

  it('includes all show entries for secretary users scoped to the show club', () => {
    setMocks({
      dogs: [makeDog({ ownerId: 'other-user' })],
      isSecretary: true,
      scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'club-1', roleId: UserRole.SECRETARY }],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(1);
    expect(result.current.allEntries[0].dogName).toBe('Maggie');
  });

  it('does not expose all show entries for secretary users scoped to a different club', () => {
    setMocks({
      dogs: [makeDog({ ownerId: 'other-user' })],
      isSecretary: true,
      scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'other-club', roleId: UserRole.SECRETARY }],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(0);
  });

  it('includes all show entries for secretary users scoped directly to the show', () => {
    setMocks({
      dogs: [makeDog({ ownerId: 'other-user' })],
      isSecretary: true,
      scopes: [{ scopeType: ScopeType.SHOW, scopeId: SHOW_ID, roleId: UserRole.SECRETARY }],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(1);
  });

  it('includes all show entries for club admins scoped to the show club', () => {
    setMocks({
      dogs: [makeDog({ ownerId: 'other-user' })],
      hasRole: vi.fn(role => role === UserRole.CLUB_ADMIN),
      scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'club-1', roleId: UserRole.CLUB_ADMIN }],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(1);
  });

  it('does not expose all show entries for club admins scoped to a different club', () => {
    setMocks({
      dogs: [makeDog({ ownerId: 'other-user' })],
      hasRole: vi.fn(role => role === UserRole.CLUB_ADMIN),
      scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'other-club', roleId: UserRole.CLUB_ADMIN }],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(0);
  });

  it('enriches entry with element, level, classTitle from class store', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    const entry = result.current.allEntries[0];
    expect(entry.element).toBe('Container');
    expect(entry.level).toBe('Novice');
    expect(entry.classTitle).toContain('Container');
  });

  it('enriches entry with trialDate and dayLabel', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    const entry = result.current.allEntries[0];
    expect(entry.trialDate).toBe('2026-05-10');
    expect(entry.dayLabel).toContain('Sunday');
  });

  it('enriches entry with startTime and judgeName', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    const entry = result.current.allEntries[0];
    expect(entry.startTime).toBe('9:00 AM');
    expect(entry.judgeName).toBe('Smith');
  });

  it('hasResult is false when competitionData is absent', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries[0].hasResult).toBe(false);
  });

  it('hasResult is true and result is populated when competitionData present', () => {
    const compData = {
      qualified: true,
      time: '00:38.2',
      placement: '1',
      faults: 0,
      recordedBy: 'judge',
      recordedAt: '2026-05-10T10:00:00Z',
    };
    setMocks({ entries: [makeEntry({ competitionData: compData })] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    const entry = result.current.allEntries[0];
    expect(entry.hasResult).toBe(true);
    expect(entry.result?.qualified).toBe(true);
    expect(entry.result?.time).toBe('00:38.2');
    expect(entry.result?.placement).toBe(1);
    expect(entry.result?.faults).toBe(0);
  });

  it('groups entries by dog', () => {
    const dog2 = makeDog({ id: 'dog-2', callName: 'Daisy' });
    const class2 = makeClass({ id: 'class-2' });
    const entry2 = makeEntry({ id: 'entry-2', dogId: 'dog-2', classId: 'class-2' });
    setMocks({ dogs: [makeDog(), dog2], classes: [makeClass(), class2], entries: [makeEntry(), entry2] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.dogGroups).toHaveLength(2);
    expect(result.current.totalClasses).toBe(2);
  });

  it('sorts allEntries by date then startTime', () => {
    const class2 = makeClass({ id: 'class-2', trialDate: '2026-05-11', startTime: '10:00 AM' });
    const class3 = makeClass({ id: 'class-3', trialDate: '2026-05-10', startTime: '14:00 PM' });
    const entry2 = makeEntry({ id: 'e2', classId: 'class-2' });
    const entry3 = makeEntry({ id: 'e3', classId: 'class-3' });
    setMocks({
      classes: [makeClass(), class2, class3],
      entries: [makeEntry(), entry2, entry3],
    });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    const dates = result.current.allEntries.map(e => e.trialDate);
    expect(dates[0]).toBe('2026-05-10');
    expect(dates[1]).toBe('2026-05-10');
    expect(dates[2]).toBe('2026-05-11');
  });

  it('computes dogsAhead correctly', () => {
    // entry has runOrder 3; two other unscored entries in same class with orders 1 and 2
    const otherEntry1 = makeEntry({
      id: 'oe1', dogId: 'dog-x',
      registrationData: { armband: '100', runOrder: 1, handler: 'x', submittedAt: '', entryFee: 0, paymentStatus: 'paid' },
    });
    const otherEntry2 = makeEntry({
      id: 'oe2', dogId: 'dog-x',
      registrationData: { armband: '102', runOrder: 2, handler: 'x', submittedAt: '', entryFee: 0, paymentStatus: 'paid' },
    });
    setMocks({ entries: [makeEntry(), otherEntry1, otherEntry2] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries[0].dogsAhead).toBe(2);
  });

  it('uses dogName from callName', () => {
    setMocks();
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries[0].dogName).toBe('Maggie');
  });

  it('skips entries whose classId has no matching class', () => {
    setMocks({ entries: [makeEntry({ classId: 'no-such-class' })] });
    const { result } = renderHook(() => useShowEntriesForUser(SHOW_ID));
    expect(result.current.allEntries).toHaveLength(0);
  });
});
