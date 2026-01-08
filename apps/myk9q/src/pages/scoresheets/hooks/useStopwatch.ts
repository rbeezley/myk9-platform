/**
 * useStopwatch Hook
 *
 * Extracted from AKCScentWorkScoresheet-Enhanced.tsx
 * Manages stopwatch timer state and controls for AKC Scent Work scoring.
 *
 * Features:
 * - Start/stop/reset timer controls
 * - Auto-stop when max time is reached
 * - 30-second warning for non-Master levels
 * - Voice announcements integration
 * - Remaining time calculations
 */

import { useState, useRef, useEffect } from 'react';
import voiceAnnouncementService from '../../../services/voiceAnnouncementService';
import { notificationSoundService } from '../../../services/notificationSoundService';

export interface UseStopwatchOptions {
  /** Maximum time in "MM:SS" format (e.g., "3:00", "4:00") */
  maxTime?: string;
  /** Current level (e.g., "Novice", "Master") - Master excludes 30-second warning */
  level?: string;
  /** Enable voice announcements including 30-second warning (from settings) */
  enableVoiceAnnouncements?: boolean;
  /** Callback when timer expires (auto-stop) */
  onTimeExpired?: (formattedTime: string) => void;
}

export interface UseStopwatchReturn {
  /** Current time in milliseconds */
  time: number;
  /** Whether timer is currently running */
  isRunning: boolean;
  /** Format time as "M:SS.ss" */
  formatTime: (milliseconds: number) => string;
  /** Get remaining time as "M:SS.ss" (or empty string if no max time) */
  getRemainingTime: () => string;
  /** Get max time in milliseconds (for progress calculations) */
  getMaxTimeMs: () => number;
  /** Get remaining time in milliseconds */
  getRemainingTimeMs: () => number;
  /** Start/resume the timer */
  start: () => void;
  /** Pause the timer (keeps current time) */
  pause: () => void;
  /** Stop and reset to zero */
  reset: () => void;
  /** Check if 30-second warning should show (non-Master only) */
  shouldShow30SecondWarning: () => boolean;
  /** Check if time has expired */
  isTimeExpired: () => boolean;
  /** Get warning message: "Time Expired" | "30 Second Warning" | null */
  getWarningMessage: () => string | null;
}

/**
 * Hook for managing stopwatch functionality in AKC Scent Work scoresheets
 *
 * @example
 * ```tsx
 * const stopwatch = useStopwatch({
 *   maxTime: "3:00",
 *   level: "Novice",
 *   enableVoiceAnnouncements: true,
 *   onTimeExpired: (time) => handleAreaUpdate(0, 'time', time)
 * });
 *
 * <button onClick={stopwatch.start}>Start</button>
 * <div>{stopwatch.formatTime(stopwatch.time)}</div>
 * ```
 */
export function useStopwatch(options: UseStopwatchOptions = {}): UseStopwatchReturn {
  const {
    maxTime,
    level,
    enableVoiceAnnouncements = false,
    onTimeExpired
  } = options;

  // Timer state
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [interval, setIntervalState] = useState<NodeJS.Timeout | null>(null);

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
    const [minutes, seconds] = maxTime.split(':').map(parseFloat);
    return (minutes * 60 + seconds) * 1000;
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
    const [minutes, seconds] = maxTime.split(':').map(parseFloat);
    const maxTimeMs = (minutes * 60 + seconds) * 1000;

    // Show warning at 32 seconds to account for display latency (truly ~30 seconds when shown)
    const remainingMs = maxTimeMs - time;
    return remainingMs > 0 && remainingMs <= 32000; // 32 seconds trigger
  };

  /**
   * Check if time has expired
   */
  const isTimeExpired = (): boolean => {
    if (!maxTime) return false;

    // Parse max time to milliseconds
    const [minutes, seconds] = maxTime.split(':').map(parseFloat);
    const maxTimeMs = (minutes * 60 + seconds) * 1000;

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
        const [minutes, seconds] = maxTime.split(':').map(parseFloat);
        const maxTimeMs = (minutes * 60 + seconds) * 1000;

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
    const [minutes, seconds] = maxTime.split(':').map(parseFloat);
    const maxTimeMs = (minutes * 60 + seconds) * 1000;

    // Calculate remaining time
    const remainingMs = maxTimeMs - time;
    const remainingSeconds = Math.floor(remainingMs / 1000);

    // Announce/chime when crossing the 32-second threshold (gives 2s buffer for display latency)
    // Trigger when: 31 < remaining <= 32 seconds (announces "30 seconds")
    if (remainingSeconds <= 32 && remainingSeconds > 31 && !has30SecondAnnouncedRef.current) {
      // Always play chime (respects notification sound setting)
      notificationSoundService.playTimerWarningChime();

      // Also announce voice if voice announcements enabled (still says "30 seconds")
      if (enableVoiceAnnouncements) {
        voiceAnnouncementService.announceTimeRemaining(30);
      }
      has30SecondAnnouncedRef.current = true;
    }

    // Reset flag if we're above 32 seconds (in case timer is reset/restarted)
    if (remainingSeconds > 32 && has30SecondAnnouncedRef.current) {
      has30SecondAnnouncedRef.current = false;
    }
  }, [time, isRunning, enableVoiceAnnouncements, level, maxTime]);

  // Set scoring active state to suppress push notification voices while timing
  useEffect(() => {
    voiceAnnouncementService.setScoringActive(isRunning);

    // Cleanup: ensure scoring state is cleared when component unmounts
    return () => {
      voiceAnnouncementService.setScoringActive(false);
    };
  }, [isRunning]);

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
