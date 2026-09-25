import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { table, store } = vi.hoisted(() => ({
  table: {
    meta: null as { expectedRemoteRows?: number } | null,
    rows: [] as Array<{ id: string }>,
    syncResult: null as null | { expectedRemoteRows: number; rows: Array<{ id: string }> },
    getSyncMetadata: vi.fn(),
    getTrialsByShow: vi.fn(),
    sync: vi.fn(),
  },
  store: {
    trialsReadStatus: 'ready' as 'idle' | 'loading' | 'ready' | 'error',
    trialsReadError: null as string | null,
    trialsHasConfirmedSnapshot: true,
    loadTrials: vi.fn(async () => {}),
  },
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    getSyncMetadata: table.getSyncMetadata,
    getTrialsByShow: table.getTrialsByShow,
    sync: table.sync,
  },
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => store,
}));

import { useAddTrialsExistingTrials } from './useAddTrialsExistingTrials';

describe('useAddTrialsExistingTrials (MYK9-758)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    table.meta = null;
    table.rows = [];
    table.syncResult = null;
    table.getSyncMetadata.mockImplementation(async () => table.meta);
    table.getTrialsByShow.mockImplementation(async () => table.rows);
    table.sync.mockImplementation(async () => {
      if (table.syncResult) {
        table.meta = { expectedRemoteRows: table.syncResult.expectedRemoteRows };
        table.rows = table.syncResult.rows;
      }
      return { success: table.syncResult !== null };
    });
    store.trialsReadStatus = 'ready';
    store.trialsReadError = null;
    store.trialsHasConfirmedSnapshot = true;
    store.loadTrials.mockImplementation(async () => {});
  });

  it('is ready at once outside Add Trials mode', () => {
    const { result } = renderHook(() => useAddTrialsExistingTrials(undefined));
    expect(result.current.ready).toBe(true);
    expect(table.sync).not.toHaveBeenCalled();
  });

  it('does not treat an empty confirmed local snapshot as the show having no trials', async () => {
    // The cold-device case: the store confirmed a snapshot, but this show's
    // trials scope was never synced and the sync cannot reach the server.
    const { result } = renderHook(() => useAddTrialsExistingTrials('show-1'));

    expect(result.current.ready).toBe(false);
    expect(result.current.readStatus).toBe('loading');
    await waitFor(() => expect(result.current.readStatus).toBe('error'));
    expect(result.current.ready).toBe(false);
    expect(result.current.readError).toMatch(/couldn't load this show's current trials/i);
    expect(table.sync).toHaveBeenCalledWith('show-1');
  });

  it('syncs an uncovered scope, re-reads the store, then reports ready', async () => {
    table.syncResult = { expectedRemoteRows: 4, rows: [1, 2, 3, 4].map(n => ({ id: `t${n}` })) };
    const order: string[] = [];
    table.sync.mockImplementationOnce(async () => {
      order.push('sync');
      table.meta = { expectedRemoteRows: 4 };
      table.rows = table.syncResult!.rows;
      return { success: true };
    });
    store.loadTrials.mockImplementation(async () => {
      order.push('reload');
    });

    const { result } = renderHook(() => useAddTrialsExistingTrials('show-1'));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(order).toEqual(['sync', 'reload']);
    expect(result.current.readStatus).toBe('ready');
  });

  it('falls back to a scope synced on an earlier visit when the sync stalls', async () => {
    table.meta = { expectedRemoteRows: 2 };
    table.rows = [{ id: 't1' }, { id: 't2' }];
    table.sync.mockImplementation(() => new Promise(() => {})); // captive wifi: never settles

    const { result } = renderHook(() => useAddTrialsExistingTrials('show-1', 20));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(store.loadTrials).toHaveBeenCalled();
  });

  it('online, syncs before trusting a count cached on an earlier visit', async () => {
    // Cached when the show had no trials; it has since gained two.
    table.meta = { expectedRemoteRows: 0 };
    table.rows = [];
    table.syncResult = { expectedRemoteRows: 2, rows: [{ id: 't1' }, { id: 't2' }] };
    const coveredAtReload: number[] = [];
    store.loadTrials.mockImplementation(async () => {
      coveredAtReload.push(table.rows.length);
    });

    const { result } = renderHook(() => useAddTrialsExistingTrials('show-1'));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(table.sync).toHaveBeenCalledWith('show-1');
    expect(coveredAtReload).toEqual([2]);
  });

  it('offline, uses the cached scope without trying the network', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    table.meta = { expectedRemoteRows: 1 };
    table.rows = [{ id: 't1' }];
    try {
      const { result } = renderHook(() => useAddTrialsExistingTrials('show-1'));
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(table.sync).not.toHaveBeenCalled();
    } finally {
      onLine.mockRestore();
    }
  });

  it('ends a stalled first sync in an error with Retry, not an endless spinner', async () => {
    table.sync.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useAddTrialsExistingTrials('show-1', 20));

    expect(result.current.readStatus).toBe('loading');
    await waitFor(() => expect(result.current.readStatus).toBe('error'));
    expect(result.current.retry).toBeTypeOf('function');
  });

  it("never reports another show's result for the current one", async () => {
    table.sync.mockImplementation(async (showId: string) => {
      if (showId === 'show-b') return new Promise(() => {}); // B's sync stalls
      table.meta = { expectedRemoteRows: 0 };
      return { success: true };
    });
    const { result, rerender } = renderHook(({ id }) => useAddTrialsExistingTrials(id), {
      initialProps: { id: 'show-a' },
    });
    await waitFor(() => expect(result.current.ready).toBe(true));

    // Switching shows: A's "ready" is still in state, but it says nothing about B.
    table.meta = null;
    rerender({ id: 'show-b' });
    expect(result.current.ready).toBe(false);
    expect(result.current.readStatus).toBe('loading');
  });

  it('stays unready until the store snapshot itself is confirmed', async () => {
    table.meta = { expectedRemoteRows: 1 };
    table.rows = [{ id: 't1' }];
    store.trialsHasConfirmedSnapshot = false;
    store.trialsReadStatus = 'loading';

    const { result } = renderHook(() => useAddTrialsExistingTrials('show-1'));

    await waitFor(() => expect(store.loadTrials).toHaveBeenCalled());
    expect(result.current.ready).toBe(false);
    expect(result.current.readStatus).toBe('loading');
  });

  it('surfaces a store read error with a retry that tries again', async () => {
    store.trialsReadStatus = 'error';
    store.trialsReadError = 'Replicated trial read failed';
    table.meta = { expectedRemoteRows: 1 };
    table.rows = [{ id: 't1' }];

    const { result } = renderHook(() => useAddTrialsExistingTrials('show-1'));

    // Loading while the first attempt runs; the store error once it lands.
    expect(result.current.readStatus).toBe('loading');
    await waitFor(() => expect(result.current.readStatus).toBe('error'));
    expect(result.current.readError).toBe('Replicated trial read failed');
    expect(store.loadTrials).toHaveBeenCalledTimes(1);

    act(() => {
      void result.current.retry?.();
    });
    // A retry reads as loading over the store error it may clear.
    expect(result.current.readStatus).toBe('loading');
    await waitFor(() => expect(store.loadTrials).toHaveBeenCalledTimes(2));
  });

  it('shows loading again while a retry after a failed sync runs, then recovers', async () => {
    const { result } = renderHook(() => useAddTrialsExistingTrials('show-1'));
    await waitFor(() => expect(result.current.readStatus).toBe('error'));

    table.syncResult = { expectedRemoteRows: 1, rows: [{ id: 't1' }] };
    act(() => {
      void result.current.retry?.();
    });
    expect(result.current.readStatus).toBe('loading');
    await waitFor(() => expect(result.current.ready).toBe(true));
  });
});
