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
import { formatMsAsMSSCC } from '@myk9/core';
import type { ElementTimerReturn } from '../types';
import { runClockNow } from '../utils/runClock';
import {
  PERSIST_INTERVAL_MS,
  clearTimerSnapshot,
  restoreTimer,
  writeTimerSnapshot,
  type TimerRecovery,
} from '../utils/runTimerStorage';

/** Which of a scoresheet's timers this is, in the saved snapshot's key. */
const TIMER_KIND = 'element';

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
  /** Keep the run on the device under this key so a reload mid-run restores it (MYK9-2007). */
  persistKey?: string | undefined;
}

/** The last 30 seconds before the max, where the host shows the warning. */
function isInWarningWindow(elapsedMs: number, maxTimeMs: number | undefined): boolean {
  return Boolean(maxTimeMs) && (maxTimeMs ?? 0) - elapsedMs <= 30_000;
}

export function useElementTimer(options: ElementTimerOptions = {}): ElementTimerReturn {
  const { maxTimeMs, persistKey } = options;
  // Latest callback without restarting the interval on every render.
  // Latest max and callback, read by the running interval: a class limit
  // corrected mid-run applies on the next tick.
  const maxTimeMsRef = useRef(maxTimeMs);
  const onExpiredRef = useRef(options.onExpired);
  useEffect(() => {
    maxTimeMsRef.current = maxTimeMs;
    onExpiredRef.current = options.onExpired;
  });

  // `time` (state) is the value as of the last transition; the live clock is
  // `timeRef`, which the 100ms paint moves without a React render (MYK9-1375).
  const [restored] = useState(() => restoreTimer(persistKey, TIMER_KIND));
  const [recovery, setRecovery] = useState<TimerRecovery>(restored?.recovery ?? null);
  const [time, setTime] = useState(restored?.elapsedMs ?? 0);
  const [isRunning, setIsRunning] = useState(false);
  const timeRef = useRef(restored?.elapsedMs ?? 0);
  const listenersRef = useRef(new Set<() => void>());

  const subscribeTime = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);
  const getTimeMs = useCallback(() => timeRef.current, []);
  const getMaxTimeMs = useCallback(() => maxTimeMsRef.current ?? 0, []);

  /** Move the live clock; only subscribers (the display) re-render. */
  const publishTime = useCallback((ms: number) => {
    timeRef.current = ms;
    listenersRef.current.forEach(listener => listener());
  }, []);
  /** Move the live clock AND re-render the host (a transition the body shows). */
  const commitTime = useCallback(
    (ms: number) => {
      publishTime(ms);
      setTime(ms);
    },
    [publishTime]
  );

  // Track the start timestamp and any accumulated time from previous runs
  const startTimestampRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef(restored?.elapsedMs ?? 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup interval on unmount. Leaving the sheet in the app ends the run; only a
  // reload (which runs no cleanup) leaves the saved timer to restore.
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (persistKey) clearTimerSnapshot(persistKey, TIMER_KIND);
    };
  }, [persistKey]);

  const persist = useCallback(
    (elapsedMs: number, running: boolean) => {
      if (persistKey) {
        writeTimerSnapshot(persistKey, TIMER_KIND, { elapsedMs, running, wallAt: Date.now() });
      }
    },
    [persistKey]
  );

  /**
   * Format milliseconds as "M:SS.ss"
   */
  const formatTime = useCallback((milliseconds: number): string => {
    // Live clock: floor, so it never reads ahead of the real time.
    return formatMsAsMSSCC(milliseconds, 'floor');
  }, []);

  /**
   * Run from now, painting every 100ms (battery). A paint moves only the live
   * clock, except when it enters the last 30 seconds before `maxTimeMs`, which
   * the host shows (banner, chime). Reaching `maxTimeMs` freezes the clock
   * exactly on the max and reports expiry once.
   */
  const run = useCallback(() => {
    // Never orphan a running interval (two starts within one render).
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(true);
    // Monotonic: a wall-clock correction mid-run must not move the time (MYK9-2007).
    startTimestampRef.current = runClockNow();
    persist(accumulatedTimeRef.current, true);
    let lastPersist = startTimestampRef.current;
    // Whether the host already rendered the warning window (a resume inside it has).
    let inWarningWindow = isInWarningWindow(accumulatedTimeRef.current, maxTimeMsRef.current);
    intervalRef.current = setInterval(() => {
      if (startTimestampRef.current === null) return;
      const now = runClockNow();
      const elapsed = now - startTimestampRef.current + accumulatedTimeRef.current;
      const maxTimeMs = maxTimeMsRef.current;
      if (maxTimeMs && elapsed >= maxTimeMs) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        startTimestampRef.current = null;
        accumulatedTimeRef.current = maxTimeMs;
        commitTime(maxTimeMs);
        setIsRunning(false);
        persist(maxTimeMs, false);
        onExpiredRef.current?.();
        return;
      }
      if (now - lastPersist >= PERSIST_INTERVAL_MS) {
        lastPersist = now;
        persist(elapsed, true);
      }
      const warning = isInWarningWindow(elapsed, maxTimeMs);
      if (warning === inWarningWindow) {
        publishTime(elapsed);
      } else {
        inWarningWindow = warning;
        commitTime(elapsed);
      }
    }, 100);
  }, [commitTime, publishTime, persist]);

  /**
   * Start the timer
   */
  const start = useCallback(() => {
    if (isRunning) return;

    setRecovery(null);
    run();
  }, [isRunning, run]);

  // A run that was going when the page reloaded keeps going from the restored time.
  useEffect(() => {
    if (restored?.running) run();
    // Once, on mount.
  }, []);

  /**
   * Stop the timer (freezes current time, can be resumed)
   */
  const stop = useCallback((): boolean => {
    if (!isRunning) return false;

    setIsRunning(false);

    // Save accumulated time, and freeze the display on it: the interval paints
    // every 100ms, so the last painted `time` can trail the real stop instant.
    if (startTimestampRef.current !== null) {
      accumulatedTimeRef.current += runClockNow() - startTimestampRef.current;
    }
    // Stopped at or past the max before a tick noticed it: report it to the caller,
    // which owns the stop and records the result (onExpired is for tick expiry).
    const reachedMax = Boolean(maxTimeMs) && accumulatedTimeRef.current >= (maxTimeMs ?? 0);
    if (maxTimeMs) accumulatedTimeRef.current = Math.min(accumulatedTimeRef.current, maxTimeMs);
    startTimestampRef.current = null;
    commitTime(accumulatedTimeRef.current);
    persist(accumulatedTimeRef.current, false);
    setRecovery(null);

    // Clear interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return reachedMax;
  }, [isRunning, maxTimeMs, commitTime, persist]);

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
    setRecovery(null);
    commitTime(0);
    startTimestampRef.current = null;
    accumulatedTimeRef.current = 0;
    if (persistKey) clearTimerSnapshot(persistKey, TIMER_KIND);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [commitTime, persistKey]);

  return {
    time,
    isRunning,
    subscribeTime,
    getTimeMs,
    getMaxTimeMs,
    start,
    stop,
    resume,
    reset,
    formatTime,
    recovery,
  };
}
