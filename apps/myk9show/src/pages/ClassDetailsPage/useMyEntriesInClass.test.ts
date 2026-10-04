import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMyEntriesInClass } from './useMyEntriesInClass';
import { fromAny, fromPartial } from '@total-typescript/shoehorn';

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
    registrationData: {
      armband: '101',
      runOrder: 2,
      handler: 'Sarah',
      submittedAt: '',
      entryFee: 0,
      paymentStatus: 'paid',
    },
    competitionData: undefined,
    checkInStatus: 'no-status',
    ...overrides,
  };
}

function makeDog(overrides = {}) {
  return { id: DOG_ID, ownerId: USER_ID, callName: 'Maggie', name: 'Magnolia', ...overrides };
}

function setMocks({ entries = [makeEntry()], dogs = [makeDog()], userId = USER_ID } = {}) {
  vi.mocked(useAuthContext).mockReturnValue(
    fromPartial({
      userWithRoles: { databaseUserId: userId },
    })
  );

  vi.mocked(useEntryStore).mockImplementation(
    fromAny((selector: (s: unknown) => unknown) => selector({ entries }))
  );

  vi.mocked(useDogStoreCompat).mockReturnValue({ dogs } as ReturnType<typeof useDogStoreCompat>);
}

describe('useMyEntriesInClass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    const compData = {
      qualified: true,
      time: '00:38.2',
      placement: '1',
      recordedBy: 'j',
      recordedAt: '',
    };
    setMocks({ entries: [makeEntry({ competitionData: compData, status: 'completed' })] });
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(result.current.isAfterClass).toBe(true);
    expect(result.current.myEntries[0].hasResult).toBe(true);
    expect(result.current.myEntries[0].result?.qualified).toBe(true);
    expect(result.current.myEntries[0].result?.time).toBe('00:38.2');
    expect(result.current.myEntries[0].result?.placement).toBe(1);
  });

  // MYK9-992: stored run numbers start above 1 and have gaps once dogs finish
  // or a class is re-placed. The exhibitor sees place in line, never the number.
  function classWithGaps() {
    const reg = (armband: string, runOrder: number) => ({
      armband,
      runOrder,
      handler: 'x',
      submittedAt: '',
      entryFee: 0,
      paymentStatus: 'paid',
    });
    return [
      makeEntry({
        id: 'finished',
        dogId: 'dog-x',
        registrationData: reg('90', 2),
        competitionData: { qualified: true, recordedBy: 'j', recordedAt: '' },
        status: 'completed',
      }),
      makeEntry({
        id: 'ring',
        dogId: 'dog-x',
        registrationData: reg('91', 7),
        checkInStatus: 'in-ring',
      }),
      makeEntry({
        id: 'pulled',
        dogId: 'dog-x',
        registrationData: reg('92', 8),
        checkInStatus: 'pulled',
      }),
      makeEntry({ id: 'first', dogId: 'dog-x', registrationData: reg('93', 9) }),
      makeEntry({ id: 'mine', registrationData: reg('101', 31) }),
    ];
  }

  it('never counts a place from the rows it holds, whatever the stored numbers say', () => {
    setMocks({ entries: classWithGaps() });
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(result.current.myEntries[0].queue).toEqual({ kind: 'waiting-unknown' });
    setMocks({ entries: classWithGaps().filter(e => e.id !== 'first') });
    const lone = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(lone.result.current.myEntries[0].queue).toEqual({ kind: 'waiting-unknown' });
  });

  it('reports no order state when the run order is unset, but keeps in-ring', () => {
    const unset = makeEntry({
      registrationData: {
        armband: '101',
        runOrder: 0,
        handler: 'x',
        submittedAt: '',
        entryFee: 0,
        paymentStatus: 'paid',
      },
    });
    setMocks({ entries: [unset] });
    const first = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(first.result.current.myEntries[0].queue).toBeNull();
    setMocks({ entries: [{ ...unset, checkInStatus: 'in-ring' }] });
    const ring = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(ring.result.current.myEntries[0].queue).toEqual({ kind: 'in-ring' });
  });

  it('reads a staff-completed dog as Done even with no score and a confirmed lifecycle', () => {
    setMocks({ entries: [makeEntry({ status: 'confirmed', checkInStatus: 'completed' })] });
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
    expect(result.current.myEntries[0].queue).toEqual({ kind: 'done' });
  });

  it('reports the state, not a place, for my dog when it is in the ring, done or pulled', () => {
    const rows = classWithGaps();
    const states = (id: string) => {
      setMocks({
        entries: rows.map(e => (e.id === id ? { ...e, dogId: DOG_ID } : e)),
      });
      const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID));
      return result.current.myEntries.find(e => e.entryId === id)?.queue;
    };
    expect(states('ring')).toEqual({ kind: 'in-ring' });
    expect(states('finished')).toEqual({ kind: 'done' });
    expect(states('pulled')).toEqual({ kind: 'pulled' });
  });

  it('sources released results over a stale replication store', () => {
    // Replication store says "no result" (cold/stale post-show exhibitor),
    // but the directly-read released row is scored + qualified + placed.
    setMocks({ entries: [makeEntry({ competitionData: undefined })] });
    const releasedRows = [
      {
        id: 'entry-1',
        is_scored: true,
        result_status: 'qualified',
        search_time_seconds: 38.2,
        total_faults: 0,
        final_placement: 1,
        armband: '101',
      } as unknown as import('@/hooks/queries/useClassEntriesRaw').RawEntryRow,
    ];
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID, releasedRows));
    expect(result.current.isAfterClass).toBe(true);
    expect(result.current.myEntries[0].hasResult).toBe(true);
    expect(result.current.myEntries[0].result?.qualified).toBe(true);
    expect(result.current.myEntries[0].result?.placement).toBe(1);
    expect(result.current.myEntries[0].result?.faults).toBe(0);
    expect(result.current.myEntries[0].result?.time).toBe('0:38.20');
  });

  it('synthesizes my entries from released rows when the store is cold', () => {
    // Replication store has NO entries for this class (post-show exhibitor /
    // guest who never synced this show) — but dogs sync globally so ownership
    // is known. The released row must still surface in the callout.
    setMocks({ entries: [] });
    const releasedRows = [
      {
        id: 'released-entry-1',
        dog_id: DOG_ID,
        is_scored: true,
        result_status: 'qualified',
        search_time_seconds: 38.2,
        total_faults: 0,
        final_placement: 1,
        armband: '101',
        dog: {
          id: DOG_ID,
          name: 'Magnolia',
          call_name: 'Maggie',
          breed: null,
          registrations: null,
          owner: null,
        },
      } as unknown as import('@/hooks/queries/useClassEntriesRaw').RawEntryRow,
    ];
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID, releasedRows));
    expect(result.current.myEntries).toHaveLength(1);
    expect(result.current.isAfterClass).toBe(true);
    expect(result.current.myEntries[0].entryId).toBe('released-entry-1');
    expect(result.current.myEntries[0].dogName).toBe('Maggie');
    expect(result.current.myEntries[0].result?.qualified).toBe(true);
    expect(result.current.myEntries[0].result?.placement).toBe(1);
  });

  it('does not synthesize released rows for dogs the user does not own', () => {
    setMocks({ entries: [] });
    const releasedRows = [
      {
        id: 'released-entry-2',
        dog_id: 'someone-elses-dog',
        is_scored: true,
        result_status: 'qualified',
        search_time_seconds: 40,
        total_faults: 0,
        final_placement: 2,
        armband: '102',
        dog: {
          id: 'someone-elses-dog',
          name: 'Rex',
          call_name: 'Rex',
          breed: null,
          registrations: null,
          owner: null,
        },
      } as unknown as import('@/hooks/queries/useClassEntriesRaw').RawEntryRow,
    ];
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID, releasedRows));
    expect(result.current.myEntries).toHaveLength(0);
  });

  it('does not double-count a released row already present in the store', () => {
    // Warm store entry + a released row for the SAME entry id → one row, overlaid.
    setMocks({ entries: [makeEntry({ competitionData: undefined })] });
    const releasedRows = [
      {
        id: 'entry-1',
        dog_id: DOG_ID,
        is_scored: true,
        result_status: 'qualified',
        search_time_seconds: 38.2,
        total_faults: 0,
        final_placement: 1,
        armband: '101',
        dog: {
          id: DOG_ID,
          name: 'Magnolia',
          call_name: 'Maggie',
          breed: null,
          registrations: null,
          owner: null,
        },
      } as unknown as import('@/hooks/queries/useClassEntriesRaw').RawEntryRow,
    ];
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID, releasedRows));
    expect(result.current.myEntries).toHaveLength(1);
    expect(result.current.myEntries[0].result?.placement).toBe(1);
  });

  it('marks a released NQ row as not qualified', () => {
    setMocks({ entries: [makeEntry({ competitionData: undefined })] });
    const releasedRows = [
      {
        id: 'entry-1',
        is_scored: true,
        result_status: 'nq',
        search_time_seconds: null,
        total_faults: null,
        final_placement: null,
        armband: '101',
      } as unknown as import('@/hooks/queries/useClassEntriesRaw').RawEntryRow,
    ];
    const { result } = renderHook(() => useMyEntriesInClass(CLASS_ID, releasedRows));
    expect(result.current.myEntries[0].hasResult).toBe(true);
    expect(result.current.myEntries[0].result?.qualified).toBe(false);
  });
});
