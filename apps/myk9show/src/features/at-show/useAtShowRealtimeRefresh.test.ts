/**
 * Tests for useAtShowRealtimeRefresh — realtime nudge → targeted sync + local refresh.
 *
 * The debounce contract matters most: a judge scoring a class fires a burst of
 * entry UPDATEs; the list must coalesce that into ONE sync, not N.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import {
  subscribeToShowChanges,
  type ShowChangeListener,
} from '@/features/show-live-sync/showChangeSignal';

vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(),
}));

import { useAtShowRealtimeRefresh } from './useAtShowRealtimeRefresh';

const SHOW = 'show-1';
const CLASS = 'class-1';
let changeHandler: ShowChangeListener | undefined;
let unsubscribe: ReturnType<typeof subscribeToShowChanges>;

const emitChange = () => changeHandler?.({ table: 'entries', classIds: [CLASS] });

describe('useAtShowRealtimeRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    changeHandler = undefined;
    unsubscribe = vi.fn(() => {
      changeHandler = undefined;
    });
    vi.mocked(subscribeToShowChanges).mockImplementation((_showId, handler) => {
      changeHandler = handler;
      return unsubscribe;
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('coalesces a burst of entry updates into one debounced targeted sync', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    const synchronize = vi.fn(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(SHOW, [CLASS], refresh, synchronize));
    expect(subscribeToShowChanges).toHaveBeenCalledWith(SHOW, expect.any(Function));

    act(() => {
      for (let i = 0; i < 5; i++) emitChange();
    });
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(synchronize).toHaveBeenCalledOnce();
    expect(synchronize).toHaveBeenCalledWith(SHOW, [
      { table: 'entries', classIds: [CLASS] },
      { table: 'entries', classIds: [CLASS] },
      { table: 'entries', classIds: [CLASS] },
      { table: 'entries', classIds: [CLASS] },
      { table: 'entries', classIds: [CLASS] },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(false);
  });

  it('also refreshes on class updates', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    const synchronize = vi.fn(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(SHOW, [CLASS], refresh, synchronize));

    act(() => changeHandler?.({ table: 'classes', classIds: [CLASS] }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(synchronize).toHaveBeenCalledWith(SHOW, [{ table: 'classes', classIds: [CLASS] }]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ignores scoped signals for a different class', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    const synchronize = vi.fn(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(SHOW, [CLASS], refresh, synchronize));

    act(() => changeHandler?.({ table: 'entries', classIds: ['class-2'] }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(synchronize).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('accepts legacy unscoped signals as a full-sync fallback', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    const synchronize = vi.fn(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(SHOW, [CLASS], refresh, synchronize));

    act(() => changeHandler?.({ table: 'entries' }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(synchronize).toHaveBeenCalledWith(SHOW, [{ table: 'entries' }]);
    expect(refresh).toHaveBeenCalledWith(false);
  });

  it('refreshes immediately when the app returns to the foreground', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    const synchronize = vi.fn(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(SHOW, [CLASS], refresh, synchronize));

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    // jsdom's visibilityState is 'visible' by default → counts as foregrounding.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(true);
    expect(synchronize).not.toHaveBeenCalled();
  });

  it('serializes a foreground full refresh behind an in-flight Broadcast refresh', async () => {
    let resolveRealtimeRefresh: () => void = () => {};
    const refresh = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<void>(resolve => (resolveRealtimeRefresh = resolve))
      )
      .mockResolvedValue(undefined);
    const synchronize = vi.fn(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(SHOW, [CLASS], refresh, synchronize));

    act(emitChange);
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledWith(false);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRealtimeRefresh();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenNthCalledWith(2, true);
  });

  it('queues at most one follow-up while a refresh is in flight', async () => {
    let resolveFirst: () => void = () => {};
    const refresh = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>(resolve => (resolveFirst = resolve)))
      .mockImplementation(() => Promise.resolve());
    const synchronize = vi.fn(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(SHOW, [CLASS], refresh, synchronize));

    // First nudge starts a refresh that hangs.
    act(emitChange);
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    // Three more nudges while in flight → exactly ONE queued follow-up.
    for (let i = 0; i < 3; i++) {
      act(emitChange);
      await act(async () => {
        vi.advanceTimersByTime(1500);
        await Promise.resolve();
      });
    }
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('tears down the channel and stops refreshing after unmount', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    const synchronize = vi.fn(() => Promise.resolve());
    const { unmount } = renderHook(() =>
      useAtShowRealtimeRefresh(SHOW, [CLASS], refresh, synchronize)
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    // Channel handlers were detached and the document listener removed, so
    // neither a realtime event nor a foreground return can refresh anymore.
    act(emitChange);
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does nothing without a showId', () => {
    const refresh = vi.fn(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(undefined, [CLASS], refresh, vi.fn()));
    expect(subscribeToShowChanges).not.toHaveBeenCalled();
  });
});
