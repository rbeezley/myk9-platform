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
import type { ElementTimerReturn } from '../types';

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
export interface ElementTimerOptions {
  /**
   * The class's maximum element time (ms). UKC's rulebook maximums are ELEMENT
   * times: when this clock reaches it the run is over, whatever the search
   * clock reads (MYK9-1093). Omit for no limit.
   */
  maxTimeMs?: number | undefined;
  /** Called once when the element time reaches `maxTimeMs`. */
  onExpired?: (() => void) | undefined;
}

export function useElementTimer(options: ElementTimerOptions = {}): ElementTimerReturn {
  const { maxTimeMs } = options;
  // Latest callback without restarting the interval on every render.
  // Latest max and callback, read by the running interval: a class limit
  // corrected mid-run applies on the next tick.
  const maxTimeMsRef = useRef(maxTimeMs);
  const onExpiredRef = useRef(options.onExpired);
  useEffect(() => {
    maxTimeMsRef.current = maxTimeMs;
    onExpiredRef.current = options.onExpired;
  });

  // Current displayed time (updated every 100ms while running)
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // Track the start timestamp and any accumulated time from previous runs
  const startTimestampRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
   * Run from now, painting every 100ms (battery). Reaching `maxTimeMs` freezes
   * the clock exactly on the max and reports expiry once.
   */
  const run = useCallback(() => {
    // Never orphan a running interval (two starts within one render).
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(true);
    startTimestampRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      if (startTimestampRef.current === null) return;
      const elapsed = Date.now() - startTimestampRef.current + accumulatedTimeRef.current;
      const maxTimeMs = maxTimeMsRef.current;
      if (maxTimeMs && elapsed >= maxTimeMs) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        startTimestampRef.current = null;
        accumulatedTimeRef.current = maxTimeMs;
        setTime(maxTimeMs);
        setIsRunning(false);
        onExpiredRef.current?.();
        return;
      }
      setTime(elapsed);
    }, 100);
  }, []);

  /**
   * Start the timer
   */
  const start = useCallback(() => {
    if (isRunning) return;

    run();
  }, [isRunning, run]);

  /**
   * Stop the timer (freezes current time, can be resumed)
   */
  const stop = useCallback((): boolean => {
    if (!isRunning) return false;

    setIsRunning(false);

    // Save accumulated time, and freeze the display on it: the interval paints
    // every 100ms, so the last painted `time` can trail the real stop instant.
    if (startTimestampRef.current !== null) {
      accumulatedTimeRef.current += Date.now() - startTimestampRef.current;
    }
    // Stopped at or past the max before a tick noticed it: report it to the caller,
    // which owns the stop and records the result (onExpired is for tick expiry).
    const reachedMax = Boolean(maxTimeMs) && accumulatedTimeRef.current >= (maxTimeMs ?? 0);
    if (maxTimeMs) accumulatedTimeRef.current = Math.min(accumulatedTimeRef.current, maxTimeMs);
    startTimestampRef.current = null;
    setTime(accumulatedTimeRef.current);

    // Clear interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return reachedMax;
  }, [isRunning, maxTimeMs]);

  /**
   * Resume the timer after stop
   */
  const resume = useCallback(() => {
    if (isRunning) return;

    run();
  }, [isRunning, run]);

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
    formatTime,
  };
}
