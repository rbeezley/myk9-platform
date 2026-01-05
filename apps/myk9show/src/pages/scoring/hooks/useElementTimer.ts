/**
 * useElementTimer Hook
 *
 * Simple continuous timer for UKC Nosework Element Time tracking.
 * Unlike Search Time (which pauses), Element Time runs continuously
 * from start until the judge clicks Finish.
 *
 * Used for Superior, Master, and Elite levels where dogs search for
 * multiple hides and need both accumulated search time and total
 * element time recorded.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

export interface UseElementTimerReturn {
  /** Current elapsed time in milliseconds */
  time: number;
  /** Whether the timer is currently running */
  isRunning: boolean;
  /** Start the timer (records start timestamp) */
  start: () => void;
  /** Stop the timer (freezes current time) */
  stop: () => void;
  /** Resume the timer after stop */
  resume: () => void;
  /** Reset timer to zero */
  reset: () => void;
  /** Format milliseconds as "M:SS.ss" */
  formatTime: (milliseconds: number) => string;
}

/**
 * Hook for continuous Element Time tracking in UKC Nosework scoresheets.
 *
 * @example
 * ```tsx
 * const elementTimer = useElementTimer();
 *
 * // Start both timers together
 * const handleStart = () => {
 *   searchStopwatch.start();
 *   elementTimer.start();
 * };
 *
 * // Finish stops both
 * const handleFinish = () => {
 *   searchStopwatch.pause();
 *   elementTimer.stop();
 * };
 * ```
 */
export function useElementTimer(): UseElementTimerReturn {
  // Current displayed time (updated every 10ms while running)
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // Track the start timestamp and any accumulated time from previous runs
  const startTimestampRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  /**
   * Format milliseconds as "M:SS.ss"
   */
  const formatTime = useCallback((milliseconds: number): string => {
    const totalSeconds = milliseconds / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = (totalSeconds % 60).toFixed(2);
    return `${minutes}:${seconds.padStart(5, '0')}`;
  }, []);

  /**
   * Start the timer
   */
  const start = useCallback(() => {
    if (isRunning) return;

    setIsRunning(true);
    startTimestampRef.current = Date.now();

    // Update time every 100ms (10x/sec) - smooth display, better battery life
    intervalRef.current = setInterval(() => {
      if (startTimestampRef.current !== null) {
        const elapsed = Date.now() - startTimestampRef.current + accumulatedTimeRef.current;
        setTime(elapsed);
      }
    }, 100);
  }, [isRunning]);

  /**
   * Stop the timer (freezes current time, can be resumed)
   */
  const stop = useCallback(() => {
    if (!isRunning) return;

    setIsRunning(false);

    // Save accumulated time
    if (startTimestampRef.current !== null) {
      accumulatedTimeRef.current += Date.now() - startTimestampRef.current;
    }
    startTimestampRef.current = null;

    // Clear interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [isRunning]);

  /**
   * Resume the timer after stop
   */
  const resume = useCallback(() => {
    if (isRunning) return;

    setIsRunning(true);
    startTimestampRef.current = Date.now();

    // Continue updating time (100ms for better battery life)
    intervalRef.current = setInterval(() => {
      if (startTimestampRef.current !== null) {
        const elapsed = Date.now() - startTimestampRef.current + accumulatedTimeRef.current;
        setTime(elapsed);
      }
    }, 100);
  }, [isRunning]);

  /**
   * Reset timer to zero
   */
  const reset = useCallback(() => {
    setIsRunning(false);
    setTime(0);
    startTimestampRef.current = null;
    accumulatedTimeRef.current = 0;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return {
    time,
    isRunning,
    start,
    stop,
    resume,
    reset,
    formatTime
  };
}
