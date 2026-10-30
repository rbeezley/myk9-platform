import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { useAtShowShowHydration } from './useAtShowShowHydration';

const mocks = vi.hoisted(() => ({
  syncAtShowData: vi.fn(),
  hasShowEntriesSynced: vi.fn(),
}));

vi.mock('./atShowDataAdapter', () => ({
  syncAtShowData: mocks.syncAtShowData,
  subscribeAtShowSyncSettled: vi.fn(() => vi.fn()),
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
});
