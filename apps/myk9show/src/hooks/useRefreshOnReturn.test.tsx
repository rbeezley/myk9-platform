import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRefreshOnReturn } from './useRefreshOnReturn';

const setVisibility = (state: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
const focusWindow = () => act(() => void window.dispatchEvent(new Event('focus')));
const showTab = () => {
  setVisibility('visible');
  act(() => void document.dispatchEvent(new Event('visibilitychange')));
};

describe('useRefreshOnReturn', () => {
  beforeEach(() => {
    setVisibility('visible');
  });

  it('refreshes on every focus and visible return, with no throttle', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useRefreshOnReturn(refresh));

    focusWindow();
    await act(async () => {});
    expect(refresh).toHaveBeenCalledTimes(1);
    showTab();
    await act(async () => {});
    expect(refresh).toHaveBeenCalledTimes(2);
    focusWindow();
    await act(async () => {});
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('ignores a visibilitychange to hidden', () => {
    const refresh = vi.fn();
    renderHook(() => useRefreshOnReturn(refresh));
    setVisibility('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('coalesces overlapping returns into exactly one follow-up and never runs two reads at once', async () => {
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
    renderHook(() => useRefreshOnReturn(refresh));

    focusWindow();
    focusWindow();
    showTab();
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishRead();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    await act(async () => {
      finishRead();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(1);
  });

  it('holds a return during the page write and refreshes once when the write ends', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ writing }) => useRefreshOnReturn(refresh, true, writing), {
      initialProps: { writing: true },
    });

    focusWindow();
    focusWindow();
    expect(refresh).not.toHaveBeenCalled();

    rerender({ writing: false });
    await act(async () => {});
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('re-reads once after a write that overlapped a read', async () => {
    let finishRead!: () => void;
    const refresh = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finishRead = resolve;
        })
    );
    const { rerender } = renderHook(({ writing }) => useRefreshOnReturn(refresh, true, writing), {
      initialProps: { writing: false },
    });

    focusWindow();
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender({ writing: true });
    rerender({ writing: false });
    expect(refresh).toHaveBeenCalledTimes(1); // the read is still running

    await act(async () => {
      finishRead();
    });
    expect(refresh).toHaveBeenCalledTimes(2); // the corrective re-read
    await act(async () => {
      finishRead();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not re-read after a read with no overlapping write', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useRefreshOnReturn(refresh));
    focusWindow();
    await act(async () => {});
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled and removes its listeners on unmount', () => {
    const refresh = vi.fn();
    const { rerender, unmount } = renderHook(({ on }) => useRefreshOnReturn(refresh, on), {
      initialProps: { on: false },
    });
    focusWindow();
    expect(refresh).not.toHaveBeenCalled();

    rerender({ on: true });
    unmount();
    focusWindow();
    expect(refresh).not.toHaveBeenCalled();
  });
});
