import { act, renderHook } from '@testing-library/react';
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is pending, then arrived when the hydration succeeded', async () => {
    const sync = deferred<{ success: boolean }>();
    mocks.syncAtShowData.mockReturnValue(sync.promise);
    const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, settledRefresh()));
    expect(result.current).toBe('pending');

    await act(async () => {
      sync.resolve({ success: true });
      await sync.promise;
    });
    expect(result.current).toBe('arrived');
    expect(mocks.hasShowEntriesSynced).not.toHaveBeenCalled();
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

  describe('cold offline (MYK9-1509)', () => {
    // A sync and a refresh that wait on the network instead of rejecting: the
    // hydration must still settle, or the page reads "Loading" forever.
    const hang = () => new Promise<never>(() => {});

    function goOffline() {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    }

    it('settles arrived from the cached rows when the show was saved earlier', async () => {
      goOffline();
      mocks.syncAtShowData.mockReturnValue(hang());
      mocks.hasShowEntriesSynced.mockResolvedValue(true);
      const refresh = vi.fn<(forceSync: boolean) => Promise<void>>().mockReturnValue(hang());
      const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, refresh));

      await act(async () => {});
      expect(result.current).toBe('arrived');
    });

    it('settles not-arrived when the show was never saved on this device', async () => {
      goOffline();
      mocks.syncAtShowData.mockReturnValue(hang());
      mocks.hasShowEntriesSynced.mockResolvedValue(false);
      const refresh = vi.fn<(forceSync: boolean) => Promise<void>>().mockReturnValue(hang());
      const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, refresh));

      await act(async () => {});
      expect(result.current).toBe('not-arrived');
    });

    it('settles when the connection drops while the hydration is in flight', async () => {
      mocks.syncAtShowData.mockReturnValue(hang());
      mocks.hasShowEntriesSynced.mockResolvedValue(true);
      const refresh = vi.fn<(forceSync: boolean) => Promise<void>>().mockReturnValue(hang());
      const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, refresh));
      await act(async () => {});
      expect(result.current).toBe('pending');

      await act(async () => {
        window.dispatchEvent(new Event('offline'));
      });
      expect(result.current).toBe('arrived');
    });

    it('keeps a sync completion that lands while the offline marker is being read', async () => {
      goOffline();
      let settled: () => void = () => {};
      mocks.subscribeAtShowSyncSettled.mockImplementation((_id: string, cb: () => void) => {
        settled = cb;
        return vi.fn();
      });
      mocks.syncAtShowData.mockReturnValue(hang());
      const firstRead = deferred<boolean>();
      mocks.hasShowEntriesSynced.mockReturnValueOnce(firstRead.promise).mockResolvedValue(true);
      const refresh = vi.fn<(forceSync: boolean) => Promise<void>>().mockReturnValue(hang());
      const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, refresh));
      await act(async () => {});

      await act(async () => {
        settled();
        firstRead.resolve(false);
      });
      expect(result.current).toBe('arrived');
    });

    it('removes the offline listener when the hydration is abandoned', async () => {
      const removed = vi.spyOn(window, 'removeEventListener');
      mocks.syncAtShowData.mockReturnValue(hang());
      const refresh = vi.fn<(forceSync: boolean) => Promise<void>>().mockReturnValue(hang());
      const { unmount } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, refresh));
      await act(async () => {});
      expect(removed).not.toHaveBeenCalledWith('offline', expect.anything());

      unmount();
      expect(removed).toHaveBeenCalledWith('offline', expect.anything());
    });

    it('stays pending while online and the hydration is still running', async () => {
      mocks.syncAtShowData.mockReturnValue(hang());
      const refresh = vi.fn<(forceSync: boolean) => Promise<void>>().mockReturnValue(hang());
      const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, refresh));

      await act(async () => {});
      expect(result.current).toBe('pending');
    });
  });
});
