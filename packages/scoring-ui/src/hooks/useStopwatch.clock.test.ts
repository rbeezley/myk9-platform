// MYK9-2007: the run timer measures on a clock a phone's wall-clock correction
// cannot move, and survives a reload mid-run.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { correctWallClock, setPageVisibility, sleepPage } from '../test/clockTestUtils';
import { useStopwatch } from './useStopwatch';

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('useStopwatch clock (MYK9-2007)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    setPageVisibility('visible');
    vi.useRealTimers();
  });

  describe('a corrected phone clock', () => {
    it('does not inflate a run when the wall clock jumps forward', () => {
      const { result } = renderHook(() => useStopwatch({ maxTime: '3:00' }));
      act(() => result.current.start());
      advance(5000);

      correctWallClock(+10 * 60_000);
      advance(1000);

      let stored = '';
      act(() => {
        stored = result.current.formatTime(result.current.pause());
      });
      expect(stored).toBe('0:06.00');
      expect(result.current.isTimeExpired()).toBe(false);
    });

    it('does not time the dog out to Max Time on a forward correction', () => {
      const onTimeExpired = vi.fn();
      const { result } = renderHook(() => useStopwatch({ maxTime: '3:00', onTimeExpired }));
      act(() => result.current.start());
      advance(5000);

      correctWallClock(+60 * 60_000);
      advance(1000);

      expect(onTimeExpired).not.toHaveBeenCalled();
      expect(result.current.isRunning).toBe(true);
    });

    it('never goes negative when the wall clock jumps back', () => {
      const { result } = renderHook(() => useStopwatch({ maxTime: '3:00' }));
      act(() => result.current.start());
      advance(5000);

      correctWallClock(-60_000);
      advance(1000);

      let elapsed = -1;
      act(() => {
        elapsed = result.current.pause();
      });
      expect(elapsed).toBe(6000);
      expect(result.current.formatTime(elapsed)).toBe('0:06.00');
    });

    it('shows the time it stores, to the hundredth, after a correction', () => {
      const { result } = renderHook(() => useStopwatch());
      act(() => result.current.start());
      advance(4350);
      correctWallClock(-5_000);
      advance(0);

      let stored = '';
      act(() => {
        stored = result.current.formatTime(result.current.pause());
      });
      expect(result.current.formatTime(result.current.time)).toBe(stored);
      expect(stored).toBe('0:04.35');
    });
  });

  describe('backgrounding', () => {
    it('counts the time a locked phone was asleep', () => {
      const { result } = renderHook(() => useStopwatch({ maxTime: '3:00' }));
      act(() => result.current.start());
      advance(2000);

      sleepPage(30_000);
      advance(100);

      let elapsed = 0;
      act(() => {
        elapsed = result.current.pause();
      });
      expect(elapsed).toBeGreaterThanOrEqual(32_000);
      expect(elapsed).toBeLessThan(32_500);
    });

    it('snaps to the limit when the phone sleeps through it', () => {
      const onTimeExpired = vi.fn();
      const { result } = renderHook(() => useStopwatch({ maxTime: '0:10', onTimeExpired }));
      act(() => result.current.start());
      advance(1000);

      sleepPage(60_000);
      advance(100);

      expect(onTimeExpired).toHaveBeenCalledWith('0:10.00');
      expect(result.current.isRunning).toBe(false);
    });

    it('a wall clock that moves backward while asleep never subtracts time', () => {
      const { result } = renderHook(() => useStopwatch({ maxTime: '3:00' }));
      act(() => result.current.start());
      advance(4000);

      sleepPage(-30_000);
      advance(100);

      let elapsed = 0;
      act(() => {
        elapsed = result.current.pause();
      });
      expect(elapsed).toBeGreaterThanOrEqual(4000);
    });
  });

  describe('a reload mid-run', () => {
    const KEY = 'entry-1:search';

    /** What the page does as it unloads, then a fresh page. */
    function reload(unmount: () => void) {
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      unmount();
    }

    it('restores a stopped time exactly and hands it to the sheet', () => {
      const first = renderHook(() => useStopwatch({ persistKey: KEY, maxTime: '3:00' }));
      act(() => first.result.current.start());
      advance(4350);
      act(() => {
        first.result.current.pause();
      });
      reload(first.unmount);

      const onRestore = vi.fn();
      const second = renderHook(() =>
        useStopwatch({ persistKey: KEY, maxTime: '3:00', onRestore })
      );

      expect(second.result.current.time).toBe(4350);
      expect(second.result.current.isRunning).toBe(false);
      expect(second.result.current.restoreNotice).toBeNull();
      expect(onRestore).toHaveBeenCalledWith(
        expect.objectContaining({ elapsedMs: 4350, running: false, formatted: '0:04.35' })
      );
    });

    it('carries on counting from where a running timer was, and says so', () => {
      const first = renderHook(() => useStopwatch({ persistKey: KEY, maxTime: '3:00' }));
      act(() => first.result.current.start());
      advance(5000);
      reload(first.unmount);
      vi.setSystemTime(Date.now() + 2000); // the reload takes two seconds

      const second = renderHook(() => useStopwatch({ persistKey: KEY, maxTime: '3:00' }));
      expect(second.result.current.restoreNotice).toMatch(/restarted during this run/i);
      advance(1000);

      expect(second.result.current.isRunning).toBe(true);
      let elapsed = 0;
      act(() => {
        elapsed = second.result.current.pause();
      });
      expect(elapsed).toBeGreaterThanOrEqual(7900);
      expect(elapsed).toBeLessThan(8400);
    });

    it('does not trust a wall clock that went backward across the reload', () => {
      const first = renderHook(() => useStopwatch({ persistKey: KEY, maxTime: '3:00' }));
      act(() => first.result.current.start());
      advance(5000);
      reload(first.unmount);
      vi.setSystemTime(Date.now() - 60_000);

      const onRestore = vi.fn();
      const second = renderHook(() =>
        useStopwatch({ persistKey: KEY, maxTime: '3:00', onRestore })
      );

      expect(second.result.current.isRunning).toBe(false);
      expect(second.result.current.time).toBe(5000);
      expect(second.result.current.restoreNotice).toMatch(/Type the time/);
      expect(second.result.current.restoreNotice).toMatch(/Use max time/);
      expect(second.result.current.restoreNotice).toMatch(/Reset/);
      expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'uncertain' }));
    });

    it('does not trust an implausibly long gap either', () => {
      const first = renderHook(() => useStopwatch({ persistKey: KEY, maxTime: '3:00' }));
      act(() => first.result.current.start());
      advance(5000);
      reload(first.unmount);
      vi.setSystemTime(Date.now() + 60 * 60_000);

      const second = renderHook(() => useStopwatch({ persistKey: KEY, maxTime: '3:00' }));

      expect(second.result.current.isRunning).toBe(false);
      expect(second.result.current.time).toBe(5000);
      expect(second.result.current.restoreNotice).not.toBeNull();
    });

    it('a run that crossed the limit during the reload expires normally', () => {
      const first = renderHook(() => useStopwatch({ persistKey: KEY, maxTime: '0:10' }));
      act(() => first.result.current.start());
      advance(9000);
      reload(first.unmount);
      vi.setSystemTime(Date.now() + 5000);

      const onTimeExpired = vi.fn();
      const second = renderHook(() =>
        useStopwatch({ persistKey: KEY, maxTime: '0:10', onTimeExpired })
      );
      advance(100);

      expect(onTimeExpired).toHaveBeenCalledWith('0:10.00');
      expect(second.result.current.isRunning).toBe(false);
    });

    it('leaving the sheet, or Reset, forgets the run', () => {
      const first = renderHook(() => useStopwatch({ persistKey: KEY }));
      act(() => first.result.current.start());
      advance(3000);
      first.unmount(); // navigated away: not a page unload

      const second = renderHook(() => useStopwatch({ persistKey: KEY }));
      expect(second.result.current.time).toBe(0);

      act(() => second.result.current.start());
      advance(2000);
      act(() => second.result.current.reset());
      reload(second.unmount);
      const third = renderHook(() => useStopwatch({ persistKey: KEY }));
      expect(third.result.current.time).toBe(0);
    });

    it('a record from yesterday is not restored', () => {
      localStorage.setItem(
        `myk9.scoresheetRun.v1:${KEY}`,
        JSON.stringify({
          v: 1,
          elapsedMs: 5000,
          running: false,
          wallMs: Date.now() - 20 * 60 * 60_000,
        })
      );
      const { result } = renderHook(() => useStopwatch({ persistKey: KEY }));
      expect(result.current.time).toBe(0);
    });

    it('keeps nothing without a key', () => {
      const first = renderHook(() => useStopwatch());
      act(() => first.result.current.start());
      advance(3000);
      reload(first.unmount);
      expect(localStorage.length).toBe(0);
    });
  });
});
