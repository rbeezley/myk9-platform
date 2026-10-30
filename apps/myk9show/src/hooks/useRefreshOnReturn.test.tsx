import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { REFRESH_ON_RETURN_MIN_INTERVAL_MS, useRefreshOnReturn } from './useRefreshOnReturn';

const client = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const setVisibility = (state: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
const focusWindow = () => act(() => void window.dispatchEvent(new Event('focus')));
const showTab = () => {
  setVisibility('visible');
  act(() => void document.dispatchEvent(new Event('visibilitychange')));
};

describe('useRefreshOnReturn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  it('refreshes on window focus and on the tab becoming visible, once per throttle window', async () => {
    const refresh = vi.fn();
    renderHook(() => useRefreshOnReturn(refresh), { wrapper });

    focusWindow();
    expect(refresh).not.toHaveBeenCalled(); // just loaded: inside the window

    await vi.advanceTimersByTimeAsync(REFRESH_ON_RETURN_MIN_INTERVAL_MS);
    focusWindow();
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(REFRESH_ON_RETURN_MIN_INTERVAL_MS - 1);
    showTab();
    focusWindow();
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    showTab();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('ignores a visibilitychange to hidden', () => {
    const refresh = vi.fn();
    renderHook(() => useRefreshOnReturn(refresh), { wrapper });
    vi.advanceTimersByTime(REFRESH_ON_RETURN_MIN_INTERVAL_MS);
    setVisibility('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('holds a return during a write and refreshes when the write settles, without a second focus', async () => {
    const refresh = vi.fn();
    let finishWrite!: () => void;
    const { result } = renderHook(
      () => {
        useRefreshOnReturn(refresh);
        return useMutation({
          mutationFn: () =>
            new Promise<void>(resolve => {
              finishWrite = resolve;
            }),
        });
      },
      { wrapper }
    );
    vi.advanceTimersByTime(REFRESH_ON_RETURN_MIN_INTERVAL_MS);

    act(() => void result.current.mutate());
    await vi.advanceTimersByTimeAsync(0);
    focusWindow();
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      finishWrite();
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('re-reads once after a write that overlapped a read, and never runs two reads at once', async () => {
    let finishRead!: () => void;
    let concurrent = 0;
    let maxConcurrent = 0;
    const refresh = vi.fn(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>(resolve => {
        finishRead = resolve;
      });
      concurrent -= 1;
    });
    let finishWrite!: () => void;
    const { result } = renderHook(
      () => {
        useRefreshOnReturn(refresh);
        return useMutation({
          mutationFn: () =>
            new Promise<void>(resolve => {
              finishWrite = resolve;
            }),
        });
      },
      { wrapper }
    );
    vi.advanceTimersByTime(REFRESH_ON_RETURN_MIN_INTERVAL_MS);

    focusWindow(); // read starts, then a check-in begins while it is in flight
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => void result.current.mutate());
    await vi.advanceTimersByTimeAsync(0);
    await act(async () => {
      finishWrite();
    });
    expect(refresh).toHaveBeenCalledTimes(1); // the read is still running

    await act(async () => {
      finishRead();
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(2); // the corrective re-read
    await act(async () => {
      finishRead();
    });
    expect(maxConcurrent).toBe(1);
  });

  it('does not re-read after a read with no overlapping write', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useRefreshOnReturn(refresh), { wrapper });
    vi.advanceTimersByTime(REFRESH_ON_RETURN_MIN_INTERVAL_MS);
    focusWindow();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled and removes its listeners on unmount', () => {
    const refresh = vi.fn();
    const add = vi.spyOn(window, 'addEventListener');
    const { rerender, unmount } = renderHook(({ on }) => useRefreshOnReturn(refresh, on), {
      wrapper,
      initialProps: { on: false },
    });
    vi.advanceTimersByTime(REFRESH_ON_RETURN_MIN_INTERVAL_MS);
    focusWindow();
    expect(refresh).not.toHaveBeenCalled();

    rerender({ on: true });
    unmount();
    focusWindow();
    expect(refresh).not.toHaveBeenCalled();
    add.mockRestore();
  });
});
