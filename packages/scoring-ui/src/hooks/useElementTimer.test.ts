import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useElementTimer } from './useElementTimer';

describe('useElementTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start with time at 0 and not running', () => {
      const { result } = renderHook(() => useElementTimer());
      expect(result.current.time).toBe(0);
      expect(result.current.isRunning).toBe(false);
    });
  });

  describe('formatTime', () => {
    it('should format 0 as 0:00.00', () => {
      const { result } = renderHook(() => useElementTimer());
      expect(result.current.formatTime(0)).toBe('0:00.00');
    });

    it('should format 63500ms as 1:03.50', () => {
      const { result } = renderHook(() => useElementTimer());
      expect(result.current.formatTime(63500)).toBe('1:03.50');
    });
  });

  describe('start', () => {
    it('should set isRunning to true', () => {
      const { result } = renderHook(() => useElementTimer());

      act(() => {
        result.current.start();
      });

      expect(result.current.isRunning).toBe(true);
    });

    it('should accumulate time while running', () => {
      const { result } = renderHook(() => useElementTimer());

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current.time).toBeGreaterThan(0);
    });

    it('should not restart if already running', () => {
      const { result } = renderHook(() => useElementTimer());

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      const timeBeforeSecondStart = result.current.time;

      act(() => {
        result.current.start(); // Should be a no-op
      });

      // Time should not reset
      expect(result.current.time).toBeGreaterThanOrEqual(timeBeforeSecondStart);
    });
  });

  describe('stop', () => {
    it('should set isRunning to false', () => {
      const { result } = renderHook(() => useElementTimer());

      act(() => {
        result.current.start();
      });

      act(() => {
        result.current.stop();
      });

      expect(result.current.isRunning).toBe(false);
    });

    it('should freeze time when stopped', () => {
      const { result } = renderHook(() => useElementTimer());

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      act(() => {
        result.current.stop();
      });

      const timeAtStop = result.current.time;

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.time).toBe(timeAtStop);
    });

    it('should not stop if not running', () => {
      const { result } = renderHook(() => useElementTimer());
      // Should not throw
      act(() => {
        result.current.stop();
      });
      expect(result.current.isRunning).toBe(false);
    });
  });

  describe('resume', () => {
    it('should resume after stop', () => {
      const { result } = renderHook(() => useElementTimer());

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      act(() => {
        result.current.stop();
      });

      act(() => {
        result.current.resume();
      });

      expect(result.current.isRunning).toBe(true);
    });

    it('should not resume if already running', () => {
      const { result } = renderHook(() => useElementTimer());

      act(() => {
        result.current.start();
      });

      // Should be a no-op
      act(() => {
        result.current.resume();
      });

      expect(result.current.isRunning).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset time to 0 and stop running', () => {
      const { result } = renderHook(() => useElementTimer());

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.time).toBe(0);
      expect(result.current.isRunning).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clean up interval on unmount', () => {
      const { result, unmount } = renderHook(() => useElementTimer());

      act(() => {
        result.current.start();
      });

      // Should not throw on unmount
      unmount();
    });
  });
});
