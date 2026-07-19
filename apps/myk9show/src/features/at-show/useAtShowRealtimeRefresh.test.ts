/**
 * Tests for useAtShowRealtimeRefresh — realtime nudge → debounced forceSync.
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
let changeHandler: ShowChangeListener | undefined;
let unsubscribe: ReturnType<typeof subscribeToShowChanges>;

const emitChange = () => changeHandler?.({ table: 'entries' });

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

  it('coalesces a burst of entry updates into one debounced forceSync refresh', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(SHOW, refresh));
    expect(subscribeToShowChanges).toHaveBeenCalledWith(SHOW, expect.any(Function));

    act(() => {
      for (let i = 0; i < 5; i++) emitChange();
    });
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(true);
  });

  it('also refreshes on class updates', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(SHOW, refresh));

    act(emitChange);
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes immediately when the app returns to the foreground', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(SHOW, refresh));

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    // jsdom's visibilityState is 'visible' by default → counts as foregrounding.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('queues at most one follow-up while a refresh is in flight', async () => {
    let resolveFirst: () => void = () => {};
    const refresh = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>(resolve => (resolveFirst = resolve)))
      .mockImplementation(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(SHOW, refresh));

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
    const { unmount } = renderHook(() => useAtShowRealtimeRefresh(SHOW, refresh));
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
    renderHook(() => useAtShowRealtimeRefresh(undefined, refresh));
    expect(subscribeToShowChanges).not.toHaveBeenCalled();
  });
});
