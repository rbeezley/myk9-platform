import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAtShowEntryListRefresh } from './useAtShowEntryListRefresh';

const mocks = vi.hoisted(() => ({
  syncAtShowData: vi.fn(),
  isOnline: true,
  toast: Object.assign(vi.fn(), { warning: vi.fn(), dismiss: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));

vi.mock('./atShowDataAdapter', () => ({ syncAtShowData: mocks.syncAtShowData }));
vi.mock('@/lib/networkUtils', () => ({ useOnlineStatus: () => mocks.isOnline }));

describe('useAtShowEntryListRefresh (MYK9-1746)', () => {
  beforeEach(() => {
    mocks.syncAtShowData.mockReset();
    mocks.toast.mockReset();
    mocks.toast.warning.mockReset();
    mocks.toast.dismiss.mockReset();
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
    expect(mocks.toast.warning).toHaveBeenCalledTimes(1);
    expect(mocks.toast.warning).toHaveBeenCalledWith(
      "You're offline. Showing what is on this device.",
      {
        id: 'entry-list-refresh',
        duration: 4000,
      }
    );
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
    expect(mocks.toast.warning).toHaveBeenCalledTimes(1);
    expect(mocks.toast.warning).toHaveBeenCalledWith(
      "Couldn't refresh. Showing what is on this device.",
      { id: 'entry-list-refresh', duration: 4000 }
    );
  });

  it('stays silent for a short-only download: reloads, no toast, back to idle (MYK9-2254)', async () => {
    mocks.syncAtShowData.mockResolvedValue({ success: false, shortOnly: true });
    const refresh = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useAtShowEntryListRefresh('show-1', refresh));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.phase).toBe('idle');
    expect(refresh).toHaveBeenCalledWith(false);
    expect(mocks.toast.warning).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('answers done and re-reads the list after a successful sync', async () => {
    mocks.syncAtShowData.mockResolvedValue({ success: true });
    const refresh = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useAtShowEntryListRefresh('show-1', refresh));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.phase).toBe('done');
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith('Up to date', {
      id: 'entry-list-refresh',
      duration: 4000,
    });
    expect(mocks.toast.warning).not.toHaveBeenCalled();
    expect(mocks.syncAtShowData).toHaveBeenCalledWith('show-1', { forceFullSync: true });
    expect(refresh).toHaveBeenCalledWith(false);
  });

  it('dismisses the previous "Up to date" toast when a short-only retry starts (MYK9-2304)', async () => {
    mocks.syncAtShowData.mockResolvedValueOnce({ success: true });
    mocks.syncAtShowData.mockResolvedValueOnce({ success: false, shortOnly: true });
    const { result } = renderHook(() =>
      useAtShowEntryListRefresh(
        'show-1',
        vi.fn(() => Promise.resolve())
      )
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(mocks.toast).toHaveBeenCalledWith('Up to date', expect.anything());
    mocks.toast.dismiss.mockClear();

    await act(async () => {
      await result.current.refresh();
    });

    expect(mocks.toast.dismiss).toHaveBeenCalledWith('entry-list-refresh');
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
  });

  it('keeps the offline answer on a second offline tap (MYK9-2304)', async () => {
    mocks.isOnline = false;
    const { result } = renderHook(() =>
      useAtShowEntryListRefresh(
        'show-1',
        vi.fn(() => Promise.resolve())
      )
    );
    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      await result.current.refresh();
    });

    expect(mocks.toast.dismiss).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('offline');
  });

  it('does not toast while idle', () => {
    renderHook(() =>
      useAtShowEntryListRefresh(
        'show-1',
        vi.fn(() => Promise.resolve())
      )
    );
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.toast.warning).not.toHaveBeenCalled();
  });

  it('does not toast while the sync is still running', async () => {
    let finish: (v: { success: boolean }) => void = () => {};
    mocks.syncAtShowData.mockReturnValue(new Promise(r => (finish = r)));
    const { result } = renderHook(() =>
      useAtShowEntryListRefresh(
        'show-1',
        vi.fn(() => Promise.resolve())
      )
    );
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.refresh();
    });
    expect(result.current.phase).toBe('refreshing');
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.toast.warning).not.toHaveBeenCalled();
    await act(async () => {
      finish({ success: true });
      await pending;
    });
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });
});
