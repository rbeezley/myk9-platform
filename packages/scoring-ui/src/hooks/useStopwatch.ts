/**
 * useStopwatch Hook
 *
 * Manages stopwatch timer state and controls for scoring.
 *
 * Features:
 * - Start/stop/reset timer controls
 * - Auto-stop when max time is reached
 * - 30-second warning for non-Master levels
 * - Voice announcements integration (via callbacks)
 * - Remaining time calculations
 */

import { useState, useRef, useEffect } from 'react';
import type { StopwatchOptions, StopwatchReturn } from '../types';

/**
 * Parse a time string "MM:SS" or "M:SS" to milliseconds
 */
function parseMaxTimeToMs(maxTime: string): number {
  const parts = maxTime.split(':');
  const minutes = parseFloat(parts[0] || '0');
  const seconds = parseFloat(parts[1] || '0');
  return (minutes * 60 + seconds) * 1000;
}

/**
 * Hook for managing stopwatch functionality in scoresheets
 *
 * @example
 * ```tsx
 * const stopwatch = useStopwatch({
 *   maxTime: "3:00",
 *   level: "Novice",
 *   enableVoiceAnnouncements: true,
 *   onTimeExpired: (time) => handleAreaUpdate(0, 'time', time),
 *   onWarningChime: () => playWarningSound(),
 *   onVoiceAnnouncement: (seconds) => announce(`${seconds} seconds remaining`),
 * });
 *
 * <button onClick={stopwatch.start}>Start</button>
 * <div>{stopwatch.formatTime(stopwatch.time)}</div>
 * ```
 */
export function useStopwatch(options: StopwatchOptions = {}): StopwatchReturn {
  const {
    maxTime,
    level,
    enableVoiceAnnouncements = false,
    onTimeExpired,
    onWarningChime,
    onVoiceAnnouncement,
    onScoringActiveChange
  } = options;

  // Timer state
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [interval, setIntervalState] = useState<ReturnType<typeof setInterval> | null>(null);

  // Refs for cleanup and voice announcements
  const intervalRef = useRef(interval);
  const has30SecondAnnouncedRef = useRef(false);

  // Update ref when interval changes
  useEffect(() => {
    intervalRef.current = interval;
  }, [interval]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      const currentInterval = intervalRef.current;
      if (currentInterval) {
        clearInterval(currentInterval);
      }
    };
  }, []);

  /**
   * Format milliseconds as "M:SS.ss"
   */
  const formatTime = (milliseconds: number): string => {
    const totalSeconds = milliseconds / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = (totalSeconds % 60).toFixed(2);
    return `${minutes}:${seconds.padStart(5, '0')}`;
  };

  /**
   * Get max time in milliseconds
   */
  const getMaxTimeMs = (): number => {
    if (!maxTime) return 0;
    return parseMaxTimeToMs(maxTime);
  };

  /**
   * Get remaining time in milliseconds
   */
  const getRemainingTimeMs = (): number => {
    if (!maxTime) return 0;
    return Math.max(0, getMaxTimeMs() - time);
  };

  /**
   * Get remaining time formatted as "M:SS.ss"
   */
  const getRemainingTime = (): string => {
    if (!maxTime) return '';

    // Calculate remaining time
    const remainingMs = getRemainingTimeMs();
    const remainingSeconds = remainingMs / 1000;
    const mins = Math.floor(remainingSeconds / 60);
    const secs = (remainingSeconds % 60).toFixed(2);

    return `${mins}:${secs.padStart(5, '0')}`;
  };

  /**
   * Check if 30-second warning should be shown (non-Master only)
   */
  const shouldShow30SecondWarning = (): boolean => {
    if (!isRunning || !maxTime) return false;

    // No warnings for Master level
    const normalizedLevel = level?.toLowerCase() || '';
    if (normalizedLevel === 'master' || normalizedLevel === 'masters') return false;

    // Parse max time to milliseconds
    const maxTimeMs = parseMaxTimeToMs(maxTime);

    // Show warning if less than 30 seconds remaining
    const remainingMs = maxTimeMs - time;
    return remainingMs > 0 && remainingMs <= 30000; // 30 seconds
  };

  /**
   * Check if time has expired
   */
  const isTimeExpired = (): boolean => {
    if (!maxTime) return false;

    // Parse max time to milliseconds
    const maxTimeMs = parseMaxTimeToMs(maxTime);

    // Time is expired if current time equals or exceeds max time
    return time > 0 && time >= maxTimeMs;
  };

  /**
   * Get warning message for UI display
   */
  const getWarningMessage = (): string | null => {
    if (isTimeExpired()) {
      return "Time Expired";
    } else if (shouldShow30SecondWarning()) {
      return "30 Second Warning";
    }
    return null;
  };

  /**
   * Start or resume the timer
   */
  const start = () => {
    setIsRunning(true);
    const startTime = Date.now() - time;
    const newInterval = setInterval(() => {
      const currentTime = Date.now() - startTime;
      setTime(currentTime);

      // Auto-stop when time expires (if maxTime is set)
      if (maxTime) {
        const maxTimeMs = parseMaxTimeToMs(maxTime);

        if (currentTime >= maxTimeMs) {
          // Time expired - auto stop
          setIsRunning(false);
          clearInterval(newInterval);
          setIntervalState(null);

          // Set the exact max time as the final time
          setTime(maxTimeMs);

          // Trigger callback if provided
          if (onTimeExpired) {
            const formattedMaxTime = formatTime(maxTimeMs);
            onTimeExpired(formattedMaxTime);
          }
        }
      }
    }, 100); // 100ms interval (10x/sec) - smooth display, better battery life
    setIntervalState(newInterval);
  };

  /**
   * Pause the timer (keeps current time)
   */
  const pause = () => {
    setIsRunning(false);
    if (interval) {
      clearInterval(interval);
      setIntervalState(null);
    }
  };

  /**
   * Reset timer to zero and stop
   */
  const reset = () => {
    setTime(0);
    if (interval) {
      clearInterval(interval);
      setIntervalState(null);
    }
    setIsRunning(false);
  };

  // Voice announcement and chime for 30-second warning
  useEffect(() => {
    if (!maxTime) {
      return;
    }

    if (!isRunning) {
      // Reset the flag when timer stops
      has30SecondAnnouncedRef.current = false;
      return;
    }

    // No warnings for Master level
    const normalizedLevel = level?.toLowerCase() || '';
    if (normalizedLevel === 'master' || normalizedLevel === 'masters') return;

    // Parse max time to milliseconds
    const maxTimeMs = parseMaxTimeToMs(maxTime);

    // Calculate remaining time
    const remainingMs = maxTimeMs - time;
    const remainingSeconds = Math.floor(remainingMs / 1000);

    // Announce/chime when crossing the 30-second threshold
    // Trigger when: 29 < remaining <= 30 seconds
    if (remainingSeconds <= 30 && remainingSeconds > 29 && !has30SecondAnnouncedRef.current) {
      // Play chime via callback (if provided)
      if (onWarningChime) {
        onWarningChime();
      }

      // Also announce voice if voice announcements enabled
      if (enableVoiceAnnouncements && onVoiceAnnouncement) {
        onVoiceAnnouncement(30);
      }
      has30SecondAnnouncedRef.current = true;
    }

    // Reset flag if we're above 30 seconds (in case timer is reset/restarted)
    if (remainingSeconds > 30 && has30SecondAnnouncedRef.current) {
      has30SecondAnnouncedRef.current = false;
    }
  }, [time, isRunning, enableVoiceAnnouncements, level, maxTime, onWarningChime, onVoiceAnnouncement]);

  // Notify scoring active state change
  useEffect(() => {
    if (onScoringActiveChange) {
      onScoringActiveChange(isRunning);
    }

    // Cleanup: ensure scoring state is cleared when component unmounts
    return () => {
      if (onScoringActiveChange) {
        onScoringActiveChange(false);
      }
    };
  }, [isRunning, onScoringActiveChange]);

  return {
    time,
    isRunning,
    formatTime,
    getRemainingTime,
    getMaxTimeMs,
    getRemainingTimeMs,
    start,
    pause,
    reset,
    shouldShow30SecondWarning,
    isTimeExpired,
    getWarningMessage
  };
}
