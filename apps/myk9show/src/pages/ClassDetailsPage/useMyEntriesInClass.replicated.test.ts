import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fromPartial } from '@total-typescript/shoehorn';
import type { ReplicatedEntry } from '@/services/replication';
import { useEntryStore } from '@/store/entryStore';
import { mergeEntryData } from '@/store/entry-store-helpers';
import { useMyEntriesInClass } from './useMyEntriesInClass';

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [{ id: 'dog-1', ownerId: 'user-1', callName: 'Maggie' }] }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => fromPartial({ userWithRoles: { databaseUserId: 'user-1' } }),
}));

// The last hop (MYK9-992): replicated row -> mergeEntryData -> the real store ->
// the hook. Mocked store rows cannot see a field the adapter drops.
function replicated(overrides: Partial<ReplicatedEntry>): ReplicatedEntry {
  return {
    id: 'e1',
    showId: 's1',
    classId: 'c1',
    dogId: 'dog-1',
    armband: '101',
    runOrder: 31,
    entryStatus: 'confirmed',
    ...overrides,
  } as ReplicatedEntry;
}

function queueFor(row: ReplicatedEntry) {
  useEntryStore.setState({ entries: [mergeEntryData(row, undefined)] });
  return renderHook(() => useMyEntriesInClass('c1')).result.current.myEntries[0]?.queue;
}

describe('useMyEntriesInClass through the replication adapter', () => {
  beforeEach(() => useEntryStore.setState({ entries: [] }));

  it('reads check-in in-ring, pulled and completed from the replicated row', () => {
    expect(queueFor(replicated({ checkInStatus: 'in-ring' }))).toEqual({ kind: 'in-ring' });
    expect(queueFor(replicated({ check_in_status: 'pulled' } as Partial<ReplicatedEntry>))).toEqual(
      { kind: 'pulled' }
    );
    expect(queueFor(replicated({ checkInStatus: 'completed' }))).toEqual({ kind: 'done' });
  });

  it('keeps withdrawn distinct and still says Waiting for an ordinary confirmed dog', () => {
    expect(queueFor(replicated({ entryStatus: 'withdrawn' }))).toEqual({ kind: 'withdrawn' });
    expect(queueFor(replicated({ checkInStatus: 'checked-in' }))).toEqual({
      kind: 'waiting-unknown',
    });
  });
});
