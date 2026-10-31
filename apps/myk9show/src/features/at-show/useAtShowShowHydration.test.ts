import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { useAtShowShowHydration } from './useAtShowShowHydration';

const mocks = vi.hoisted(() => ({
  syncAtShowData: vi.fn(),
  hasShowEntriesSynced: vi.fn(),
  subscribeAtShowSyncSettled: vi.fn(),
}));

vi.mock('./atShowDataAdapter', () => ({
  syncAtShowData: mocks.syncAtShowData,
  subscribeAtShowSyncSettled: mocks.subscribeAtShowSyncSettled,
}));
const structureState = vi.hoisted(() => ({ onDevice: true }));
vi.mock('./atShowClassListAdapter', async importOriginal => ({
  ...(await importOriginal<typeof import('./atShowClassListAdapter')>()),
  isAtShowStructureOnDevice: async () => structureState.onDevice,
}));
vi.mock('@/services/replication/entriesShowSyncState', () => ({
  hasShowEntriesSynced: mocks.hasShowEntriesSynced,
}));

const IDLE_STATUS = {
  isSyncing: false,
  lastSyncAt: null,
} as unknown as ReplicationSyncContextValue['status'];

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

const settledRefresh = () => vi.fn<(forceSync: boolean) => Promise<void>>().mockResolvedValue();

describe('useAtShowShowHydration', () => {
  beforeEach(() => {
    mocks.syncAtShowData.mockReset();
    mocks.hasShowEntriesSynced.mockReset();
    mocks.subscribeAtShowSyncSettled.mockReset().mockReturnValue(vi.fn());
  });

  it('is pending, then arrived when the hydration succeeded and the show is on the device', async () => {
    mocks.hasShowEntriesSynced.mockResolvedValue(true);
    const sync = deferred<{ success: boolean }>();
    mocks.syncAtShowData.mockReturnValue(sync.promise);
    const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, settledRefresh()));
    expect(result.current).toBe('pending');

    await act(async () => {
      sync.resolve({ success: true });
      await sync.promise;
    });
    expect(result.current).toBe('arrived');
  });

  it('is not-arrived when the sync reported success but a scope is still short (MYK9-1538)', async () => {
    mocks.syncAtShowData.mockResolvedValue({ success: true });
    mocks.hasShowEntriesSynced.mockResolvedValue(true);
    structureState.onDevice = false;
    const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, settledRefresh()));
    await waitFor(() => expect(result.current).toBe('not-arrived'));
    structureState.onDevice = true;
  });

  it('is not-arrived when the hydration failed and no entries marker exists', async () => {
    mocks.syncAtShowData.mockResolvedValue({ success: false });
    mocks.hasShowEntriesSynced.mockResolvedValue(false);
    const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, settledRefresh()));
    await act(async () => {});
    expect(result.current).toBe('not-arrived');
  });

  it('stays arrived when the hydration failed but this device saved the show earlier', async () => {
    mocks.syncAtShowData.mockRejectedValue(new Error('offline'));
    mocks.hasShowEntriesSynced.mockResolvedValue(true);
    const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, settledRefresh()));
    await act(async () => {});
    expect(result.current).toBe('arrived');
  });

  it('reports the current show when an earlier show settles last', async () => {
    const a = deferred<{ success: boolean }>();
    const b = deferred<{ success: boolean }>();
    mocks.syncAtShowData.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const { result, rerender } = renderHook(
      ({ showId }: { showId: string }) =>
        useAtShowShowHydration(showId, IDLE_STATUS, settledRefresh()),
      { initialProps: { showId: 'A' } }
    );
    rerender({ showId: 'B' });
    expect(mocks.syncAtShowData).toHaveBeenCalledTimes(2);
    expect(result.current).toBe('pending');

    mocks.hasShowEntriesSynced.mockResolvedValue(true);
    await act(async () => {
      b.resolve({ success: true });
      await b.promise;
    });
    expect(result.current).toBe('arrived');

    await act(async () => {
      a.resolve({ success: false });
      mocks.hasShowEntriesSynced.mockResolvedValue(false);
      await a.promise;
    });
    expect(result.current).toBe('arrived');
  });

  // MYK9-1509: a cold reload with no connection must not wait on a sync that
  // only a connection can finish (a mid-sync drop is MYK9-1550).
  describe('cold offline start', () => {
    const goOffline = () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const neverRefresh = () =>
      vi.fn<(forceSync: boolean) => Promise<void>>().mockReturnValue(new Promise(() => {}));

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('is arrived at once, without awaiting the sync, when the show was saved earlier', async () => {
      goOffline();
      mocks.syncAtShowData.mockReturnValue(new Promise(() => {}));
      mocks.hasShowEntriesSynced.mockResolvedValue(true);
      const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, neverRefresh()));
      await act(async () => {});
      expect(result.current).toBe('arrived');
    });

    it('is not-arrived at once, without awaiting the sync, for a never-saved show', async () => {
      goOffline();
      mocks.syncAtShowData.mockReturnValue(new Promise(() => {}));
      mocks.hasShowEntriesSynced.mockResolvedValue(false);
      const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, neverRefresh()));
      await act(async () => {});
      expect(result.current).toBe('not-arrived');
    });

    it('still upgrades not-arrived to arrived when a later sync settles', async () => {
      goOffline();
      let settled: () => void = () => {};
      mocks.subscribeAtShowSyncSettled.mockImplementation((_id: string, cb: () => void) => {
        settled = cb;
        return vi.fn();
      });
      mocks.hasShowEntriesSynced.mockResolvedValueOnce(false).mockResolvedValue(true);
      const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, neverRefresh()));
      await act(async () => {});
      expect(result.current).toBe('not-arrived');

      await act(async () => {
        settled();
      });
      expect(result.current).toBe('arrived');
    });

    it('downgrades arrived to not-arrived when a later settled sync leaves a scope short (MYK9-1560)', async () => {
      goOffline();
      let settled: () => void = () => {};
      mocks.subscribeAtShowSyncSettled.mockImplementation((_id: string, cb: () => void) => {
        settled = cb;
        return vi.fn();
      });
      mocks.hasShowEntriesSynced.mockResolvedValue(true);
      const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, neverRefresh()));
      await act(async () => {});
      expect(result.current).toBe('arrived');

      structureState.onDevice = false;
      await act(async () => {
        settled();
      });
      expect(result.current).toBe('not-arrived');

      structureState.onDevice = true;
      await act(async () => {
        settled();
      });
      expect(result.current).toBe('arrived');
    });

    it('still waits on the sync when the start is online', async () => {
      mocks.syncAtShowData.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, neverRefresh()));
      await act(async () => {});
      expect(result.current).toBe('pending');
    });
  });
});
