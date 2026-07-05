import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAutoDismiss } from './useAutoDismiss';

describe('useAutoDismiss', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('shows immediately and auto-dismisses after the delay', () => {
    const setVisible = vi.fn();
    const { result } = renderHook(() => useAutoDismiss(setVisible, 2000));

    act(() => result.current());
    expect(setVisible).toHaveBeenCalledWith(true);
    expect(setVisible).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    // still visible — not yet dismissed
    expect(setVisible).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(setVisible).toHaveBeenCalledWith(false);
    expect(setVisible).toHaveBeenCalledTimes(2);
  });

  it('resets the dismiss window on a rapid re-trigger (second save is not cut short)', () => {
    const setVisible = vi.fn();
    const { result } = renderHook(() => useAutoDismiss(setVisible, 2000));

    act(() => result.current());
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Re-trigger before the first window closes.
    act(() => result.current());

    // 1500ms more → 3000ms since the FIRST trigger, but only 1500ms since reset.
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    const falseCalls = setVisible.mock.calls.filter(([v]) => v === false);
    expect(falseCalls).toHaveLength(0); // not dismissed yet — window was reset

    // Complete the reset window.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(setVisible).toHaveBeenLastCalledWith(false);
  });

  it('clears the pending timer on unmount (no setState after unmount)', () => {
    const setVisible = vi.fn();
    const { result, unmount } = renderHook(() => useAutoDismiss(setVisible, 2000));

    act(() => result.current());
    setVisible.mockClear();

    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(setVisible).not.toHaveBeenCalled();
  });
});
