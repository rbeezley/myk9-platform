// MYK9-2007: the element timer shares the run timer's clock and reload rules.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { correctWallClock, setPageVisibility, sleepPage } from '../test/clockTestUtils';
import { useElementTimer } from './useElementTimer';

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('useElementTimer clock (MYK9-2007)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    setPageVisibility('visible');
    vi.useRealTimers();
  });

  it('ignores a wall clock correction, forward or back, mid-run', () => {
    const onExpired = vi.fn();
    const { result } = renderHook(() => useElementTimer({ maxTimeMs: 180_000, onExpired }));
    act(() => result.current.start());
    advance(5000);
    correctWallClock(+30 * 60_000);
    advance(1000);
    correctWallClock(-60 * 60_000);
    advance(1000);

    act(() => {
      result.current.stop();
    });
    expect(result.current.time).toBe(7000);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('counts a locked phone as time that passed', () => {
    const { result } = renderHook(() => useElementTimer({ maxTimeMs: 180_000 }));
    act(() => result.current.start());
    advance(2000);
    sleepPage(30_000);
    advance(100);

    act(() => {
      result.current.stop();
    });
    expect(result.current.time).toBeGreaterThanOrEqual(32_000);
    expect(result.current.time).toBeLessThan(32_500);
  });

  it('survives a reload mid-run and carries on', () => {
    const first = renderHook(() => useElementTimer({ persistKey: 'entry-1:element' }));
    act(() => first.result.current.start());
    advance(5000);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    first.unmount();
    vi.setSystemTime(Date.now() + 1500);

    const second = renderHook(() => useElementTimer({ persistKey: 'entry-1:element' }));
    expect(second.result.current.restoreNotice).toMatch(/reloaded during this run/i);
    advance(1000);

    expect(second.result.current.isRunning).toBe(true);
    act(() => {
      second.result.current.stop();
    });
    expect(second.result.current.time).toBeGreaterThanOrEqual(7400);
    expect(second.result.current.time).toBeLessThan(7900);
  });
});
