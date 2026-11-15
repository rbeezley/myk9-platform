import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { CONFLICT_SETTLED_EVENT } from './conflictEvents';
import { useHeldConflictCount } from './heldConflictStore';
import { listHeldConflicts, reopenHeldConflicts } from './heldConflicts';

const { tables, queued, trials, auth } = vi.hoisted(() => ({
  auth: { user: { id: 'user-a' } as { id: string } | null },
  tables: {
    classes: { getConflictedRows: vi.fn() },
    entries: { getConflictedRows: vi.fn() },
  },
  queued: { getPendingMutationsForTable: vi.fn() },
  trials: { get: vi.fn() },
}));

vi.mock('@/providers/ReplicationSyncProvider', () => ({
  REPLICATED_TABLES: [
    { name: 'classes', table: tables.classes },
    { name: 'entries', table: tables.entries },
  ],
}));
vi.mock('@/services/replication/sharedMutationManager', () => ({ mutationManager: queued }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: auth.user }) }));
vi.mock('@/services/replication', () => ({ replicatedTrialsTable: trials }));

const classSnapshot = { tableName: 'classes', rowId: 'class-1', localData: { trialId: 'trial-1' } };
const entrySnapshot = { tableName: 'entries', rowId: 'entry-1', localData: { showId: 'show-2' } };

describe('held conflicts', () => {
  beforeEach(() => {
    tables.classes.getConflictedRows.mockResolvedValue([classSnapshot]);
    tables.entries.getConflictedRows.mockResolvedValue([entrySnapshot]);
    queued.getPendingMutationsForTable.mockImplementation(async (name: string) => [
      { rowId: name === 'classes' ? 'class-1' : 'entry-1' },
    ]);
    trials.get.mockResolvedValue({ showId: 'show-1' });
    auth.user = { id: 'user-a' };
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves each conflict to its show, a class through its trial', async () => {
    expect(await listHeldConflicts()).toEqual([
      { snapshot: classSnapshot, showId: 'show-1' },
      { snapshot: entrySnapshot, showId: 'show-2' },
    ]);
  });

  it("leaves out a conflict the signed-in user has no queued change for (another account's)", async () => {
    queued.getPendingMutationsForTable.mockResolvedValue([]);
    expect(await listHeldConflicts()).toEqual([]);
  });

  it('skips a table that cannot be read without dropping the others', async () => {
    tables.entries.getConflictedRows.mockRejectedValue(new Error('idb'));
    expect(await listHeldConflicts()).toEqual([{ snapshot: classSnapshot, showId: 'show-1' }]);
  });

  it("re-dispatches only this show's snapshots as replication:conflict", async () => {
    const raised: unknown[] = [];
    const listen = (event: Event) => raised.push((event as CustomEvent).detail);
    window.addEventListener('replication:conflict', listen);
    try {
      expect(await reopenHeldConflicts('show-1')).toBe(1);
    } finally {
      window.removeEventListener('replication:conflict', listen);
    }
    expect(raised).toEqual([classSnapshot]);
  });

  it('counts held conflicts for one show and drops to zero once a choice is saved', async () => {
    const { result } = renderHook(() => useHeldConflictCount('show-1'));
    await waitFor(() => expect(result.current).toBe(1));
    expect(renderHook(() => useHeldConflictCount('show-3')).result.current).toBe(0);

    tables.classes.getConflictedRows.mockResolvedValue([]);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(CONFLICT_SETTLED_EVENT));
    });
    await waitFor(() => expect(result.current).toBe(0));
  });

  it("never shows user A's count to user B, and clears it when a read fails", async () => {
    const { result, rerender } = renderHook(() => useHeldConflictCount('show-1'));
    await waitFor(() => expect(result.current).toBe(1));

    // Signed out: the list is dropped at once, before any new read could answer.
    queued.getPendingMutationsForTable.mockRejectedValue(new Error('no signed-in user'));
    auth.user = null;
    rerender();
    await waitFor(() => expect(result.current).toBe(0));

    // User B has no queued change for A's row.
    queued.getPendingMutationsForTable.mockResolvedValue([]);
    auth.user = { id: 'user-b' };
    rerender();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('replication:conflict'));
    });
    expect(result.current).toBe(0);
  });

  it('drops the last list when a later read fails outright', async () => {
    const { result } = renderHook(() => useHeldConflictCount('show-1'));
    await waitFor(() => expect(result.current).toBe(1));
    const provider = await import('@/providers/ReplicationSyncProvider');
    const original = provider.REPLICATED_TABLES;
    Object.defineProperty(provider, 'REPLICATED_TABLES', {
      get() {
        throw new Error('module unreadable');
      },
      configurable: true,
    });
    try {
      await act(async () => {
        window.dispatchEvent(new CustomEvent(CONFLICT_SETTLED_EVENT));
      });
      await waitFor(() => expect(result.current).toBe(0));
    } finally {
      Object.defineProperty(provider, 'REPLICATED_TABLES', { value: original, configurable: true });
    }
  });
});
