import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAtShowEntryListRefresh } from './useAtShowEntryListRefresh';

const mocks = vi.hoisted(() => ({ syncAtShowData: vi.fn(), isOnline: true }));

vi.mock('./atShowDataAdapter', () => ({ syncAtShowData: mocks.syncAtShowData }));
vi.mock('@/lib/networkUtils', () => ({ useOnlineStatus: () => mocks.isOnline }));

describe('useAtShowEntryListRefresh (MYK9-1746)', () => {
  beforeEach(() => {
    mocks.syncAtShowData.mockReset();
    mocks.isOnline = true;
  });

  it('answers offline without syncing or re-reading', async () => {
    mocks.isOnline = false;
    const refresh = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useAtShowEntryListRefresh('show-1', refresh));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.phase).toBe('offline');
    expect(mocks.syncAtShowData).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('answers failed when the sync does not succeed', async () => {
    mocks.syncAtShowData.mockResolvedValue({ success: false });
    const refresh = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useAtShowEntryListRefresh('show-1', refresh));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.phase).toBe('failed');
  });

  it('answers done and re-reads the list after a successful sync', async () => {
    mocks.syncAtShowData.mockResolvedValue({ success: true });
    const refresh = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useAtShowEntryListRefresh('show-1', refresh));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.phase).toBe('done');
    expect(mocks.syncAtShowData).toHaveBeenCalledWith('show-1', { forceFullSync: true });
    expect(refresh).toHaveBeenCalledWith(false);
  });
});
