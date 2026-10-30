import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';

const mocks = vi.hoisted(() => ({
  trialsSync: vi.fn(),
  hasShowEntriesSynced: vi.fn(),
}));
vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: { sync: mocks.trialsSync, getTrialsByShow: async () => [] },
  replicatedClassesTable: { sync: async () => ({ success: true }) },
  replicatedEntriesTable: { sync: async () => ({ success: true }) },
  replicatedArmbandsTable: { sync: async () => ({ success: true }) },
}));
vi.mock('@/services/replication/entriesShowSyncState', () => ({
  hasShowEntriesSynced: mocks.hasShowEntriesSynced,
}));

import { syncAtShowData } from './atShowDataAdapter';
import { useAtShowShowHydration } from './useAtShowShowHydration';

const IDLE_STATUS = {
  isSyncing: false,
  lastSyncAt: null,
} as unknown as ReplicationSyncContextValue['status'];

// Both callers of the hook (dog list, entry lists) hand it a refresh that forces the show sync.
const refresh = async () => {
  await syncAtShowData('A');
};

describe('useAtShowShowHydration on a dead connection (MYK9-1509)', () => {
  afterEach(() => {
    mocks.trialsSync.mockReset();
    mocks.hasShowEntriesSynced.mockReset();
    vi.restoreAllMocks();
  });

  it('settles arrived from the cached rows when a hung sync is ended by going offline', async () => {
    mocks.trialsSync.mockReturnValue(new Promise(() => {}));
    mocks.hasShowEntriesSynced.mockResolvedValue(true);
    const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, refresh));
    await act(async () => {});
    expect(result.current).toBe('pending');

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe('arrived');
  });

  it('settles not-arrived for a never-saved show, and a retry starts a new sync', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mocks.trialsSync.mockReturnValueOnce(new Promise(() => {}));
    mocks.hasShowEntriesSynced.mockResolvedValue(false);
    const { result } = renderHook(() => useAtShowShowHydration('A', IDLE_STATUS, refresh));
    await act(async () => {});
    expect(result.current).toBe('not-arrived');

    vi.restoreAllMocks();
    mocks.trialsSync.mockResolvedValueOnce({ success: true });
    await expect(syncAtShowData('A')).resolves.toEqual({ success: true });
    expect(mocks.trialsSync).toHaveBeenCalledTimes(2);
  });
});
