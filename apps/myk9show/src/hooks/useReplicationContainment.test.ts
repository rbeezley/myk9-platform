import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReplicationContainment } from './useReplicationContainment';

const containment = (until: number) =>
  new CustomEvent('replication:containment', { detail: { until } });

describe('useReplicationContainment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts inactive — the banner must not flash on every mount', () => {
    const { result } = renderHook(() => useReplicationContainment());
    expect(result.current.active).toBe(false);
    expect(result.current.until).toBeNull();
  });

  it('activates on the event and self-clears once the window passes', () => {
    const { result } = renderHook(() => useReplicationContainment());

    act(() => {
      window.dispatchEvent(containment(Date.now() + 5_000));
    });
    expect(result.current.active).toBe(true);

    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(result.current.active).toBe(false);
    expect(result.current.until).toBeNull();
  });

  it('extends the window when the server re-arms the pause', () => {
    const { result } = renderHook(() => useReplicationContainment());
    const first = Date.now() + 5_000;

    act(() => {
      window.dispatchEvent(containment(first));
    });
    act(() => {
      vi.advanceTimersByTime(3_000);
      window.dispatchEvent(containment(Date.now() + 10_000));
    });

    // Past the ORIGINAL deadline but inside the new one — a re-arm must not be
    // cut short by the first timer, or the banner disappears while the outbox
    // is still paused.
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current.active).toBe(true);
    expect(result.current.until).toBeGreaterThan(first);
  });

  it('ignores an already-expired window rather than latching on', () => {
    const { result } = renderHook(() => useReplicationContainment());

    act(() => {
      window.dispatchEvent(containment(Date.now() - 1_000));
    });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.active).toBe(false);
  });

  it('ignores a malformed event instead of throwing at the judge', () => {
    const { result } = renderHook(() => useReplicationContainment());

    act(() => {
      window.dispatchEvent(new CustomEvent('replication:containment'));
      window.dispatchEvent(
        new CustomEvent('replication:containment', { detail: { until: 'soon' } })
      );
    });
    expect(result.current.active).toBe(false);
  });

  it('stops listening and clears its timer on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { result, unmount } = renderHook(() => useReplicationContainment());

    act(() => {
      window.dispatchEvent(containment(Date.now() + 5_000));
    });
    expect(result.current.active).toBe(true);

    unmount();
    expect(clearSpy).toHaveBeenCalled();

    // No state update after unmount — dispatching again must be inert.
    expect(() => window.dispatchEvent(containment(Date.now() + 5_000))).not.toThrow();
    clearSpy.mockRestore();
  });
});
