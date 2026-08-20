import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNow } from './useNow';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current time on mount', () => {
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useNow(60_000));
    expect(result.current).toBe(1_000_000);
  });

  it('ticks forward at the given interval', () => {
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useNow(60_000));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(1_060_000);

    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current).toBe(1_180_000);
  });

  it('stops ticking after unmount', () => {
    vi.setSystemTime(1_000_000);
    const { result, unmount } = renderHook(() => useNow(60_000));
    unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(1_000_000);
  });
});
