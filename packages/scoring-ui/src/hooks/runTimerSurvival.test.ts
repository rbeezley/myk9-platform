/**
 * MYK9-2007: a scoresheet timer measures with a clock that does not jump when
 * the phone's wall clock corrects itself, survives a reload of the page, and
 * still counts the time a backgrounded page slept through.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStopwatch } from './useStopwatch';
import { useElementTimer } from './useElementTimer';
import { resetRunClockForTests } from '../utils/runClock';
import { MAX_RELOAD_GAP_MS } from '../utils/runTimerStorage';

const WALL_START = new Date('2026-11-14T15:00:00.000Z').getTime();

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** The wall clock alone moves (a network time correction); the run clock does not. */
function correctWallClock(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

/** The page sleeps: no timers fire, the wall clock moves, the monotonic clock stands still. */
function sleepPage(ms: number) {
  setVisibility('hidden');
  vi.setSystemTime(Date.now() + ms);
  setVisibility('visible');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(WALL_START);
  localStorage.clear();
  resetRunClockForTests();
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('stopwatch and a wall-clock correction (MYK9-2007)', () => {
  it('a clock that jumps forward mid-run does not inflate the time or time the dog out', () => {
    const onTimeExpired = vi.fn();
    const { result } = renderHook(() => useStopwatch({ maxTime: '3:00', onTimeExpired }));
    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    correctWallClock(10 * 60 * 1000);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    let recorded = -1;
    act(() => {
      recorded = result.current.pause();
    });
    expect(onTimeExpired).not.toHaveBeenCalled();
    expect(recorded).toBeGreaterThanOrEqual(5900);
    expect(recorded).toBeLessThanOrEqual(6100);
    expect(result.current.formatTime(recorded)).toMatch(/^0:0[56]\./);
  });

  it('a clock that jumps back mid-run never gives a negative time', () => {
    const { result } = renderHook(() => useStopwatch({ maxTime: '3:00' }));
    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    correctWallClock(-60 * 60 * 1000);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    let recorded = -1;
    act(() => {
      recorded = result.current.pause();
    });
    expect(recorded).toBeGreaterThanOrEqual(5900);
    expect(recorded).toBeLessThanOrEqual(6100);
  });

  it('a jump forward and back across a pause and resume keeps the displayed time equal to the stored time', () => {
    const { result } = renderHook(() => useStopwatch());
    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    correctWallClock(90_000);
    let first = 0;
    act(() => {
      first = result.current.pause();
    });
    correctWallClock(-200_000);
    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    let second = 0;
    act(() => {
      second = result.current.pause();
    });
    expect(second - first).toBeGreaterThanOrEqual(1900);
    expect(second - first).toBeLessThanOrEqual(2100);
    expect(result.current.time).toBe(second);
  });
});

describe('element timer and a wall-clock correction (MYK9-2007)', () => {
  it('ignores a clock that jumps forward and back mid-run', () => {
    const { result } = renderHook(() => useElementTimer());
    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    correctWallClock(10 * 60 * 1000);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    correctWallClock(-30 * 60 * 1000);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      result.current.stop();
    });
    expect(result.current.time).toBeGreaterThanOrEqual(4900);
    expect(result.current.time).toBeLessThanOrEqual(5100);
  });
});

describe('backgrounding (MYK9-2007)', () => {
  it('counts the time a hidden page slept through when the page returns', () => {
    const { result } = renderHook(() => useStopwatch({ maxTime: '3:00' }));
    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => {
      sleepPage(20_000);
      vi.advanceTimersByTime(100);
    });
    let recorded = -1;
    act(() => {
      recorded = result.current.pause();
    });
    expect(recorded).toBeGreaterThanOrEqual(25_000);
    expect(recorded).toBeLessThanOrEqual(25_300);
  });

  it('a long sleep still snaps to the limit and times the dog out once', () => {
    const onTimeExpired = vi.fn();
    const { result } = renderHook(() => useStopwatch({ maxTime: '0:10', onTimeExpired }));
    act(() => result.current.start());
    act(() => {
      sleepPage(60_000);
      vi.advanceTimersByTime(100);
    });
    expect(onTimeExpired).toHaveBeenCalledTimes(1);
    expect(onTimeExpired).toHaveBeenCalledWith('0:10.00');
    expect(result.current.isRunning).toBe(false);
  });

  it('a wall-clock correction while the page stays visible is not credited as sleep', () => {
    const { result } = renderHook(() => useStopwatch({ maxTime: '3:00' }));
    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // Hidden and shown with no wall time passing: nothing to credit.
    act(() => {
      setVisibility('hidden');
      setVisibility('visible');
    });
    let recorded = -1;
    act(() => {
      recorded = result.current.pause();
    });
    expect(recorded).toBeLessThan(2200);
  });
});

describe('reload mid-run (MYK9-2007)', () => {
  const key = 'entry-1';

  /** A reload: the old page's timers die without cleanup, then a new page mounts. */
  function reload<T>(render: () => T, gapMs: number): T {
    vi.setSystemTime(Date.now() + gapMs);
    resetRunClockForTests();
    return render();
  }

  it('a running stopwatch comes back running with its time intact', () => {
    const first = renderHook(() => useStopwatch({ maxTime: '3:00', persistKey: key }));
    act(() => first.result.current.start());
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    // The page dies with no cleanup: take the saved snapshot out of the unmount's reach.
    const saved = localStorage.getItem(`myk9:run-timer:${key}:search`);
    first.unmount();
    localStorage.setItem(`myk9:run-timer:${key}:search`, saved!);

    const second = reload(
      () => renderHook(() => useStopwatch({ maxTime: '3:00', persistKey: key })),
      1500
    );
    expect(second.result.current.isRunning).toBe(true);
    expect(second.result.current.recovery).toBe('resumed');
    // Last write was at start (0 s) or within the last second: the span between
    // that write and now is bridged by the wall clock, so it is at least 4 s.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    let recorded = -1;
    act(() => {
      recorded = second.result.current.pause();
    });
    expect(recorded).toBeGreaterThanOrEqual(4000);
    expect(recorded).toBeLessThan(7500);
    expect(second.result.current.recovery).toBeNull();
  });

  it('a stopped stopwatch comes back stopped at the same time', () => {
    const first = renderHook(() => useStopwatch({ persistKey: key }));
    act(() => first.result.current.start());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    let stoppedAt = 0;
    act(() => {
      stoppedAt = first.result.current.pause();
    });
    const saved = localStorage.getItem(`myk9:run-timer:${key}:search`);
    first.unmount();
    localStorage.setItem(`myk9:run-timer:${key}:search`, saved!);

    const second = reload(() => renderHook(() => useStopwatch({ persistKey: key })), 60_000);
    expect(second.result.current.isRunning).toBe(false);
    expect(second.result.current.time).toBe(stoppedAt);
    expect(second.result.current.recovery).toBe('stopped');
  });

  it.each([
    ['a gap too long to be a reload', MAX_RELOAD_GAP_MS + 1000],
    ['a wall clock that went backward', -60_000],
  ])('says the time was lost after %s, and never trusts the span', (_name, gap) => {
    const first = renderHook(() => useStopwatch({ maxTime: '3:00', persistKey: key }));
    act(() => first.result.current.start());
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    const saved = localStorage.getItem(`myk9:run-timer:${key}:search`);
    first.unmount();
    localStorage.setItem(`myk9:run-timer:${key}:search`, saved!);

    const second = reload(
      () => renderHook(() => useStopwatch({ maxTime: '3:00', persistKey: key })),
      gap
    );
    expect(second.result.current.recovery).toBe('lost');
    expect(second.result.current.isRunning).toBe(false);
    expect(second.result.current.time).toBe(0);
  });

  it('a restored run past the limit snaps to the limit and times the dog out', () => {
    const onTimeExpired = vi.fn();
    const first = renderHook(() => useStopwatch({ maxTime: '0:10', persistKey: key }));
    act(() => first.result.current.start());
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    const saved = localStorage.getItem(`myk9:run-timer:${key}:search`);
    first.unmount();
    localStorage.setItem(`myk9:run-timer:${key}:search`, saved!);

    const second = reload(
      () => renderHook(() => useStopwatch({ maxTime: '0:10', persistKey: key, onTimeExpired })),
      20_000
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onTimeExpired).toHaveBeenCalledWith('0:10.00');
    expect(second.result.current.isRunning).toBe(false);
  });

  it('leaving the sheet in the app ends the run: nothing is restored', () => {
    const first = renderHook(() => useStopwatch({ persistKey: key }));
    act(() => first.result.current.start());
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    first.unmount();
    const second = renderHook(() => useStopwatch({ persistKey: key }));
    expect(second.result.current.time).toBe(0);
    expect(second.result.current.recovery).toBeNull();
  });

  it('the element timer comes back running too', () => {
    const first = renderHook(() => useElementTimer({ persistKey: key }));
    act(() => first.result.current.start());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const saved = localStorage.getItem(`myk9:run-timer:${key}:element`);
    first.unmount();
    localStorage.setItem(`myk9:run-timer:${key}:element`, saved!);

    const second = reload(() => renderHook(() => useElementTimer({ persistKey: key })), 500);
    expect(second.result.current.isRunning).toBe(true);
    expect(second.result.current.recovery).toBe('resumed');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      second.result.current.stop();
    });
    expect(second.result.current.time).toBeGreaterThanOrEqual(3000);
  });
});
