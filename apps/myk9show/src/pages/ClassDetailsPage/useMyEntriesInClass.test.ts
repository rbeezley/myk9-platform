import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMyEntriesInClass } from './useMyEntriesInClass';

vi.mock('@/store/entryStore', () => ({ useEntryStore: vi.fn() }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: vi.fn() }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: vi.fn() }));

import { useEntryStore } from '@/store/entryStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';

const USER_ID = 'user-1';
const CLASS_ID = 'class-1';
const DOG_ID = 'dog-1';

function makeEntry(overrides = {}) {
  return {
    id: 'entry-1',
    classId: CLASS_ID,
    dogId: DOG_ID,
    showId: 'show-1',
    status: 'confirmed',
    registrationData: { armband: '101', runOrder: 2, handler: 'Sarah', submittedAt: '', entryFee: 0, paymentStatus: 'paid' },
    competitionData: undefined,
    checkInStatus: 'no-status',
    ...overrides,
  };
}

function makeDog(overrides = {}) {
  return { id: DOG_ID, ownerId: USER_ID, callName: 'Maggie', name: 'Magnolia', ...overrides };
}

function setMocks({ entries = [makeEntry()], dogs = [makeDog()], userId = USER_ID } = {}) {
  vi.mocked(useAuthContext).mockReturnValue({
    userWithRoles: { databaseUserId: userId },
  } as ReturnType<typeof useAuthContext>);

  vi.mocked(useEntryStore).mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ entries })
  );

  vi.mocked(useDogStoreCompat).mockReturnValue({ dogs } as ReturnType<typeof useDogStoreCompat>);
}

describe('useMyEntriesInClass', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty when classId is undefined', () => {
    setMocks();
    const { result } = renderHook(() => useMyEntriesInClass(undefined));
    expect(result.current.myEntries).toHaveLength(0);
    expect(result.current.isAfterClass).toBe(false);
  });

  it('returns empty when user has no dogs', () => {
    setMocks({ dogs: [] });
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(result.current.myEntries).toHaveLength(0);
  });

  it('excludes entries for other dogs', () => {
    setMocks({ dogs: [makeDog({ ownerId: 'other-user' })] });
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(result.current.myEntries).toHaveLength(0);
  });

  it('excludes entries from other classes', () => {
    setMocks({ entries: [makeEntry({ classId: 'other-class' })] });
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(result.current.myEntries).toHaveLength(0);
  });

  it("returns one entry for the user's dog", () => {
    setMocks();
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(result.current.myEntries).toHaveLength(1);
    expect(result.current.myEntries[0].dogName).toBe('Maggie');
  });

  it('resolves armband from registrationData', () => {
    setMocks();
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(result.current.myEntries[0].armband).toBe('101');
  });

  it('isAfterClass is false when no competitionData', () => {
    setMocks();
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(result.current.isAfterClass).toBe(false);
    expect(result.current.myEntries[0].hasResult).toBe(false);
  });

  it('isAfterClass is true when competitionData present', () => {
    const compData = { qualified: true, time: '00:38.2', placement: '1', recordedBy: 'j', recordedAt: '' };
    setMocks({ entries: [makeEntry({ competitionData: compData, status: 'completed' })] });
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(result.current.isAfterClass).toBe(true);
    expect(result.current.myEntries[0].hasResult).toBe(true);
    expect(result.current.myEntries[0].result?.qualified).toBe(true);
    expect(result.current.myEntries[0].result?.time).toBe('00:38.2');
    expect(result.current.myEntries[0].result?.placement).toBe(1);
  });

  it('computes dogsAhead from unscored entries with lower runOrder', () => {
    const otherEntry1 = makeEntry({ id: 'oe1', dogId: 'dog-x', registrationData: { armband: '99', runOrder: 1, handler: 'x', submittedAt: '', entryFee: 0, paymentStatus: 'paid' } });
    const otherEntry2 = makeEntry({ id: 'oe2', dogId: 'dog-x', registrationData: { armband: '100', runOrder: 3, handler: 'x', submittedAt: '', entryFee: 0, paymentStatus: 'paid' } });
    // My dog has runOrder 2; entry oe1 (runOrder 1) is ahead; oe2 is behind
    const myEntry = makeEntry({ registrationData: { armband: '101', runOrder: 2, handler: 'Sarah', submittedAt: '', entryFee: 0, paymentStatus: 'paid' } });
    setMocks({ entries: [myEntry, otherEntry1, otherEntry2] });
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(result.current.myEntries[0].dogsAhead).toBe(1);
  });

  it('dogsAhead is 0 when no unscored entries ahead', () => {
    const myEntry = makeEntry({ registrationData: { armband: '101', runOrder: 1, handler: 'Sarah', submittedAt: '', entryFee: 0, paymentStatus: 'paid' } });
    setMocks({ entries: [myEntry] });
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(result.current.myEntries[0].dogsAhead).toBe(0);
  });

  it('position is 1-based index in sorted run order', () => {
    const otherEntry = makeEntry({ id: 'oe1', dogId: 'dog-x', registrationData: { armband: '99', runOrder: 1, handler: 'x', submittedAt: '', entryFee: 0, paymentStatus: 'paid' } });
    const myEntry = makeEntry({ registrationData: { armband: '101', runOrder: 2, handler: 'Sarah', submittedAt: '', entryFee: 0, paymentStatus: 'paid' } });
    setMocks({ entries: [myEntry, otherEntry] });
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    // My dog is at run order 2 → 2nd position (1-based)
    expect(result.current.myEntries[0].position).toBe(2);
  });
});
