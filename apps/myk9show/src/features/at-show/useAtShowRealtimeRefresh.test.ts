/**
 * Tests for useAtShowRealtimeRefresh — realtime nudge → debounced forceSync.
 *
 * The debounce contract matters most: a judge scoring a class fires a burst of
 * entry UPDATEs; the list must coalesce that into ONE sync, not N.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

type ChangeHandler = (payload: unknown) => void;

const handlers: { entries: ChangeHandler[]; classes: ChangeHandler[] } = {
  entries: [],
  classes: [],
};
// Mirrors the real client: removing the channel detaches its handlers.
const removeChannel = vi.fn(() => {
  handlers.entries = [];
  handlers.classes = [];
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const channel = {
        on: (
          _event: string,
          config: { table: string },
          handler: ChangeHandler
        ): typeof channel => {
          if (config.table === 'entries') handlers.entries.push(handler);
          if (config.table === 'classes') handlers.classes.push(handler);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    }),
    removeChannel: (...args: unknown[]) => removeChannel(...args),
  },
}));

import { useAtShowRealtimeRefresh } from './useAtShowRealtimeRefresh';

const SHOW = 'show-1';

describe('useAtShowRealtimeRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    handlers.entries = [];
    handlers.classes = [];
    removeChannel.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('coalesces a burst of entry updates into one debounced forceSync refresh', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    renderHook(() => useAtShowRealtimeRefresh(SHOW, refresh));

    act(() => {
      for (let i = 0; i < 5; i++) handlers.entries.forEach(h => h({}));
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

    act(() => handlers.classes.forEach(h => h({})));
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
    act(() => handlers.entries.forEach(h => h({})));
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    // Three more nudges while in flight → exactly ONE queued follow-up.
    for (let i = 0; i < 3; i++) {
      act(() => handlers.entries.forEach(h => h({})));
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
    expect(removeChannel).toHaveBeenCalledTimes(1);

    // Channel handlers were detached and the document listener removed, so
    // neither a realtime event nor a foreground return can refresh anymore.
    act(() => handlers.entries.forEach(h => h({})));
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
    expect(handlers.entries.length).toBe(0);
    expect(handlers.classes.length).toBe(0);
  });
});
