/**
 * Unit Tests for useStopwatch Hook
 */

import { renderHook, act } from '@testing-library/react';
import { useStopwatch } from './useStopwatch';
import voiceAnnouncementService from '../../../services/voiceAnnouncementService';

// Mock voice announcement service
vi.mock('../../../services/voiceAnnouncementService', () => ({
  default: {
    announceTimeRemaining: vi.fn(),
    setScoringActive: vi.fn()
  }
}));

describe('useStopwatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Basic timer functionality', () => {
    test('should initialize with zero time and stopped state', () => {
      const { result } = renderHook(() => useStopwatch());

      expect(result.current.time).toBe(0);
      expect(result.current.isRunning).toBe(false);
    });

    test('should start the timer', () => {
      const { result } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
      });

      expect(result.current.isRunning).toBe(true);

      // Advance time by 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.time).toBeGreaterThan(0);
    });

    test('should pause the timer', () => {
      const { result } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(1000);
      });

      const timeAtPause = result.current.time;

      act(() => {
        result.current.pause();
      });

      expect(result.current.isRunning).toBe(false);

      // Time should not advance after pause
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.time).toBe(timeAtPause);
    });

    test('should reset the timer to zero', () => {
      const { result } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(5000);
        result.current.reset();
      });

      expect(result.current.time).toBe(0);
      expect(result.current.isRunning).toBe(false);
    });

    test('should resume from paused state', () => {
      const { result } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(1000);
        result.current.pause();
      });

      const timeAtPause = result.current.time;

      act(() => {
        result.current.start(); // Resume
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.time).toBeGreaterThan(timeAtPause);
      expect(result.current.isRunning).toBe(true);
    });
  });

  describe('Time formatting', () => {
    test('should format milliseconds correctly', () => {
      const { result } = renderHook(() => useStopwatch());

      expect(result.current.formatTime(0)).toBe('0:00.00');
      expect(result.current.formatTime(1000)).toBe('0:01.00');
      expect(result.current.formatTime(60000)).toBe('1:00.00');
      expect(result.current.formatTime(90500)).toBe('1:30.50');
      expect(result.current.formatTime(125750)).toBe('2:05.75');
    });

    test('should pad seconds correctly', () => {
      const { result } = renderHook(() => useStopwatch());

      // Less than 10 seconds should be padded
      expect(result.current.formatTime(5230)).toBe('0:05.23');
      expect(result.current.formatTime(9990)).toBe('0:09.99');
    });
  });

  describe('Auto-stop on max time', () => {
    test('should auto-stop when max time is reached', () => {
      const onTimeExpired = vi.fn();
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '0:03', // 3 seconds
          onTimeExpired
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(3000); // Reach max time
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.time).toBe(3000);
      expect(onTimeExpired).toHaveBeenCalledWith('0:03.00');
    });

    test('should set exact max time when auto-stopping', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '3:00' // 180 seconds
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(180000);
      });

      expect(result.current.time).toBe(180000);
      expect(result.current.isRunning).toBe(false);
    });

    test('should not auto-stop when no max time is set', () => {
      const { result } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(600000); // 10 minutes
      });

      // Should still be running
      expect(result.current.isRunning).toBe(true);
    });
  });

  describe('Remaining time calculation', () => {
    test('should calculate remaining time correctly', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '3:00' // 180 seconds
        })
      );

      // At start: 3:00 remaining
      expect(result.current.getRemainingTime()).toBe('3:00.00');

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(30000); // 30 seconds elapsed
      });

      // After 30s: 2:30 remaining
      expect(result.current.getRemainingTime()).toBe('2:30.00');

      act(() => {
        vi.advanceTimersByTime(90000); // Total: 120 seconds elapsed
      });

      // After 2:00: 1:00 remaining
      expect(result.current.getRemainingTime()).toBe('1:00.00');
    });

    test('should return empty string when no max time is set', () => {
      const { result } = renderHook(() => useStopwatch());

      expect(result.current.getRemainingTime()).toBe('');
    });

    test('should return 0:00.00 when time expires', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '0:05' // 5 seconds
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.getRemainingTime()).toBe('0:00.00');
    });
  });

  describe('30-second warning (non-Master only)', () => {
    test('should show 30-second warning for Novice level', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '3:00', // 180 seconds
          level: 'Novice'
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(150000); // 150s elapsed, 30s remaining
      });

      expect(result.current.shouldShow30SecondWarning()).toBe(true);
      expect(result.current.getWarningMessage()).toBe('30 Second Warning');
    });

    test('should NOT show 30-second warning for Master level', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '3:00',
          level: 'Master'
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(150000); // 30s remaining
      });

      expect(result.current.shouldShow30SecondWarning()).toBe(false);
      expect(result.current.getWarningMessage()).toBe(null);
    });

    test('should NOT show 30-second warning for Masters level (plural)', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '3:00',
          level: 'Masters'
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(150000);
      });

      expect(result.current.shouldShow30SecondWarning()).toBe(false);
    });

    test('should not show warning when more than 30 seconds remain', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '3:00',
          level: 'Novice'
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(140000); // 40s remaining
      });

      expect(result.current.shouldShow30SecondWarning()).toBe(false);
    });

    test('should not show warning when timer is stopped', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '3:00',
          level: 'Novice'
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(150000);
        result.current.pause();
      });

      expect(result.current.shouldShow30SecondWarning()).toBe(false);
    });
  });

  describe('Time expired detection', () => {
    test('should detect when time has expired', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '0:05' // 5 seconds
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.isTimeExpired()).toBe(true);
      expect(result.current.getWarningMessage()).toBe('Time Expired');
    });

    test('should not show expired when time is just under max', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '3:00'
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(179000); // 179 seconds (1 second before max)
      });

      expect(result.current.isTimeExpired()).toBe(false);
    });

    test('should return false when no max time is set', () => {
      const { result } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(600000);
      });

      expect(result.current.isTimeExpired()).toBe(false);
    });
  });

  describe('Voice announcements', () => {
    test('should announce 30-second warning when enabled', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '3:00',
          level: 'Novice',
          enableVoiceAnnouncements: true,
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(150000); // Exactly 30s remaining
      });

      expect(voiceAnnouncementService.announceTimeRemaining).toHaveBeenCalledWith(30);
    });

    test('should NOT announce when voice announcements are disabled', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '3:00',
          level: 'Novice',
          enableVoiceAnnouncements: false,
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(150000);
      });

      expect(voiceAnnouncementService.announceTimeRemaining).not.toHaveBeenCalled();
    });

    test('should set scoring active state when timer is running', () => {
      const { result } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
      });

      expect(voiceAnnouncementService.setScoringActive).toHaveBeenCalledWith(true);

      act(() => {
        result.current.pause();
      });

      expect(voiceAnnouncementService.setScoringActive).toHaveBeenCalledWith(false);
    });

    test('should clear scoring active state on unmount', () => {
      const { result, unmount } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
      });

      vi.clearAllMocks();

      unmount();

      expect(voiceAnnouncementService.setScoringActive).toHaveBeenCalledWith(false);
    });
  });

  describe('Edge cases', () => {
    test('should handle rapid start/stop/start', () => {
      const { result } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(100);
        result.current.pause();
        result.current.start();
        vi.advanceTimersByTime(100);
      });

      expect(result.current.isRunning).toBe(true);
      expect(result.current.time).toBeGreaterThan(0);
    });

    test('should handle reset while running', () => {
      const { result } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(5000);
        result.current.reset();
      });

      expect(result.current.time).toBe(0);
      expect(result.current.isRunning).toBe(false);
    });

    test('should cleanup interval on unmount', () => {
      const { result, unmount } = renderHook(() => useStopwatch());

      act(() => {
        result.current.start();
      });

      // Should not throw when unmounting with active timer
      expect(() => unmount()).not.toThrow();
    });

    test('should handle max time with decimal seconds', () => {
      const { result } = renderHook(() =>
        useStopwatch({
          maxTime: '2:30' // 150 seconds
        })
      );

      act(() => {
        result.current.start();
        vi.advanceTimersByTime(150000);
      });

      expect(result.current.isTimeExpired()).toBe(true);
    });
  });
});
