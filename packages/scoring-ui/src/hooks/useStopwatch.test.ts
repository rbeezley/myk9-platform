import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStopwatch } from './useStopwatch';

describe('useStopwatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start with time at 0 and not running', () => {
      const { result } = renderHook(() => useStopwatch());
      expect(result.current.time).toBe(0);
      expect(result.current.isRunning).toBe(false);
    });
  });

  describe('formatTime', () => {
    it('should format 0 as 0:00.00', () => {
      const { result } = renderHook(() => useStopwatch());
      expect(result.current.formatTime(0)).toBe('0:00.00');
    });

    it('should format 5000ms as 0:05.00', () => {
      const { result } = renderHook(() => useStopwatch());
      expect(result.current.formatTime(5000)).toBe('0:05.00');
    });

    it('should format 63500ms as 1:03.50', () => {
      const { result } = renderHook(() => useStopwatch());
      expect(result.current.formatTime(63500)).toBe('1:03.50');
    });

    it('should format 180000ms as 3:00.00', () => {
      const { result } = renderHook(() => useStopwatch());
      expect(result.current.formatTime(180000)).toBe('3:00.00');
    });
  });

  describe('start/pause/reset', () => {
    it('should set isRunning to true when started', () => {
      const { result } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
      });

      expect(result.current.isRunning).toBe(true);
    });

    it('should accumulate time while running', () => {
      const { result } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.time).toBeGreaterThan(0);
    });

    it('should stop accumulating time when paused', () => {
      const { result } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      act(() => {
        result.current.pause();
      });

      const timeAtPause = result.current.time;
      expect(result.current.isRunning).toBe(false);

      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Time should not have changed after pause
      expect(result.current.time).toBe(timeAtPause);
    });

    it('should reset time to 0 and stop running', () => {
      const { result } = renderHook(() => useStopwatch());

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

  describe('maxTime', () => {
    it('should parse maxTime and return it in milliseconds', () => {
      const { result } = renderHook(() => useStopwatch({ maxTime: '3:00' }));
      expect(result.current.getMaxTimeMs()).toBe(180000);
    });

    it('should return 0 for getMaxTimeMs when no maxTime set', () => {
      const { result } = renderHook(() => useStopwatch());
      expect(result.current.getMaxTimeMs()).toBe(0);
    });

    it('should calculate remaining time', () => {
      const { result } = renderHook(() => useStopwatch({ maxTime: '3:00' }));

      // At time 0, remaining should be full max time
      expect(result.current.getRemainingTimeMs()).toBe(180000);
    });

    it('should return empty string for getRemainingTime when no maxTime', () => {
      const { result } = renderHook(() => useStopwatch());
      expect(result.current.getRemainingTime()).toBe('');
    });

    it('should auto-stop when maxTime is reached', () => {
      const onTimeExpired = vi.fn();
      const { result } = renderHook(() => useStopwatch({ maxTime: '0:02', onTimeExpired }));

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(2500);
      });

      expect(result.current.isRunning).toBe(false);
      expect(onTimeExpired).toHaveBeenCalled();
    });
  });

  describe('isTimeExpired', () => {
    it('should return false when no maxTime is set', () => {
      const { result } = renderHook(() => useStopwatch());
      expect(result.current.isTimeExpired()).toBe(false);
    });

    it('should return false when time is below max', () => {
      const { result } = renderHook(() => useStopwatch({ maxTime: '3:00' }));
      expect(result.current.isTimeExpired()).toBe(false);
    });
  });

  describe('30-second warning', () => {
    it('should not show warning for Master level', () => {
      const { result } = renderHook(() => useStopwatch({ maxTime: '3:00', level: 'Master' }));

      act(() => {
        result.current.start();
      });

      // Advance to 2:31 (29 seconds remaining)
      act(() => {
        vi.advanceTimersByTime(151000);
      });

      expect(result.current.shouldShow30SecondWarning()).toBe(false);
    });

    it('should not show warning when timer is not running', () => {
      const { result } = renderHook(() => useStopwatch({ maxTime: '3:00', level: 'Novice' }));
      expect(result.current.shouldShow30SecondWarning()).toBe(false);
    });

    it('should not show warning when no maxTime', () => {
      const { result } = renderHook(() => useStopwatch({ level: 'Novice' }));

      act(() => {
        result.current.start();
      });

      expect(result.current.shouldShow30SecondWarning()).toBe(false);
    });
  });

  describe('getWarningMessage', () => {
    it('should return null when no warnings', () => {
      const { result } = renderHook(() => useStopwatch());
      expect(result.current.getWarningMessage()).toBeNull();
    });
  });

  describe('onWarningChime callback', () => {
    it('should fire warning chime for non-Master level at 30 seconds remaining', () => {
      const onWarningChime = vi.fn();
      const { result } = renderHook(() =>
        useStopwatch({ maxTime: '1:00', level: 'Novice', onWarningChime })
      );

      act(() => {
        result.current.start();
      });

      // The stopwatch interval fires every 100ms.
      // With maxTime=60s, warning triggers when remaining is between 29 and 30 seconds,
      // meaning elapsed time is between 30000ms and 31000ms.
      // Advance in small increments to ensure the interval fires and the effect runs.
      for (let i = 0; i < 310; i++) {
        act(() => {
          vi.advanceTimersByTime(100);
        });
      }

      expect(onWarningChime).toHaveBeenCalled();
    });

    it('should not fire warning chime for Master level', () => {
      const onWarningChime = vi.fn();
      const { result } = renderHook(() =>
        useStopwatch({ maxTime: '1:00', level: 'Master', onWarningChime })
      );

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(30500);
      });

      expect(onWarningChime).not.toHaveBeenCalled();
    });

    // MYK9-76: the Master silence rule must cover BOTH the chime AND the voice
    // announcement, for both the singular and plural spellings — exhibitors at a
    // Master search must never hear the 30-second warning.
    it.each(['Master', 'masters'])('fires neither chime nor voice for level "%s"', levelValue => {
      const onWarningChime = vi.fn();
      const onVoiceAnnouncement = vi.fn();
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '1:00',
          level: levelValue,
          enableVoiceAnnouncements: true,
          onWarningChime,
          onVoiceAnnouncement,
        })
      );

      act(() => {
        result.current.start();
      });
      act(() => {
        vi.advanceTimersByTime(31000);
      });

      expect(onWarningChime).not.toHaveBeenCalled();
      expect(onVoiceAnnouncement).not.toHaveBeenCalled();
    });
  });

  // MYK9-76: the 30-second warning is a once-per-run event. Pausing must NOT
  // re-arm it — a timer paused past the threshold and resumed below 30s would
  // otherwise chime again immediately. A genuine reset DOES re-arm it.
  describe('warning guard across pause/resume/reset', () => {
    const advance = (steps: number) => {
      for (let i = 0; i < steps; i++) {
        act(() => {
          vi.advanceTimersByTime(100);
        });
      }
    };

    it('does not re-fire the warning after pausing past 30s and resuming', () => {
      const onWarningChime = vi.fn();
      const { result } = renderHook(() =>
        useStopwatch({ maxTime: '1:00', level: 'Novice', onWarningChime })
      );

      act(() => {
        result.current.start();
      });
      advance(310); // ~31s elapsed → ~29s remaining, chime fires once
      expect(onWarningChime).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.pause();
      });
      act(() => {
        result.current.start(); // resume, still below 30s remaining
      });
      advance(20); // +2s
      expect(onWarningChime).toHaveBeenCalledTimes(1);
    });

    it('re-arms the warning after a reset (a fresh run announces again)', () => {
      const onWarningChime = vi.fn();
      const { result } = renderHook(() =>
        useStopwatch({ maxTime: '1:00', level: 'Novice', onWarningChime })
      );

      act(() => {
        result.current.start();
      });
      advance(310);
      expect(onWarningChime).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.reset();
      });
      act(() => {
        result.current.start();
      });
      advance(310);
      expect(onWarningChime).toHaveBeenCalledTimes(2);
    });
  });

  describe('onScoringActiveChange callback', () => {
    it('should call onScoringActiveChange when running state changes', () => {
      const onScoringActiveChange = vi.fn();
      const { result } = renderHook(() => useStopwatch({ onScoringActiveChange }));

      act(() => {
        result.current.start();
      });

      expect(onScoringActiveChange).toHaveBeenCalledWith(true);

      act(() => {
        result.current.pause();
      });

      expect(onScoringActiveChange).toHaveBeenCalledWith(false);
    });
  });
});
