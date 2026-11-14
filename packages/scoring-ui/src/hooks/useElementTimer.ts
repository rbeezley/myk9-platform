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
import type { ElementTimerReturn, RestoredTimer } from '../types';
import { startRunSpan, type RunSpan } from '../utils/runClock';
import { useRunPersistence } from './useRunPersistence';

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
  /** Keeps the run on the device across a reload mid-run (MYK9-2007). */
  persistKey?: string | undefined;
  /** Called once when a reload restored the run, before it carries on. */
  onRestore?: ((run: RestoredTimer) => void) | undefined;
}

/** The last 30 seconds before the max, where the host shows the warning. */
function isInWarningWindow(elapsedMs: number, maxTimeMs: number | undefined): boolean {
  return Boolean(maxTimeMs) && (maxTimeMs ?? 0) - elapsedMs <= 30_000;
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

  // `time` (state) is the value as of the last transition; the live clock is
  // `timeRef`, which the 100ms paint moves without a React render (MYK9-1375).
  const [isRunning, setIsRunning] = useState(false);
  const runningRef = useRef(false);
  // Track the run clock and any accumulated time from previous runs. The clock is
  // monotonic, so a corrected phone clock cannot move the element time (MYK9-2007).
  const spanRef = useRef<RunSpan | null>(null);
  const accumulatedTimeRef = useRef(0);
  const persistence = useRunPersistence({
    persistKey: options.persistKey,
    read: () => ({
      elapsedMs: runningRef.current
        ? accumulatedTimeRef.current + (spanRef.current?.read() ?? 0)
        : accumulatedTimeRef.current,
      running: runningRef.current,
    }),
    running: isRunning,
  });
  const { restored, sync: syncRun, clear: clearRun } = persistence;
  const [time, setTime] = useState(restored?.elapsedMs ?? 0);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(restored?.notice ?? null);
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
    runningRef.current = true;
    spanRef.current = startRunSpan();
    // Whether the host already rendered the warning window (a resume inside it has).
    let inWarningWindow = isInWarningWindow(accumulatedTimeRef.current, maxTimeMsRef.current);
    intervalRef.current = setInterval(() => {
      if (spanRef.current === null) return;
      const elapsed = accumulatedTimeRef.current + spanRef.current.read();
      const maxTimeMs = maxTimeMsRef.current;
      if (maxTimeMs && elapsed >= maxTimeMs) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        spanRef.current = null;
        runningRef.current = false;
        accumulatedTimeRef.current = maxTimeMs;
        commitTime(maxTimeMs);
        setIsRunning(false);
        syncRun();
        onExpiredRef.current?.();
        return;
      }
      const warning = isInWarningWindow(elapsed, maxTimeMs);
      if (warning === inWarningWindow) {
        publishTime(elapsed);
      } else {
        inWarningWindow = warning;
        commitTime(elapsed);
      }
    }, 100);
    syncRun();
  }, [commitTime, publishTime, syncRun]);

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
    if (spanRef.current !== null) {
      accumulatedTimeRef.current += spanRef.current.read();
    }
    runningRef.current = false;
    // Stopped at or past the max before a tick noticed it: report it to the caller,
    // which owns the stop and records the result (onExpired is for tick expiry).
    const reachedMax = Boolean(maxTimeMs) && accumulatedTimeRef.current >= (maxTimeMs ?? 0);
    if (maxTimeMs) accumulatedTimeRef.current = Math.min(accumulatedTimeRef.current, maxTimeMs);
    spanRef.current = null;
    commitTime(accumulatedTimeRef.current);

    // Clear interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    syncRun();
    return reachedMax;
  }, [isRunning, maxTimeMs, commitTime, syncRun]);

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
    runningRef.current = false;
    commitTime(0);
    spanRef.current = null;
    accumulatedTimeRef.current = 0;
    setRestoreNotice(null);
    clearRun();

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [commitTime, clearRun]);

  // A reload mid-run: carry on from the checkpoint (MYK9-2007).
  const restoreRef = useRef({ restored, run, onRestore: options.onRestore });
  useEffect(() => {
    restoreRef.current = { restored, run, onRestore: options.onRestore };
  });
  useEffect(() => {
    const { restored: found, run: resume, onRestore: notify } = restoreRef.current;
    if (!found) return;
    accumulatedTimeRef.current = found.elapsedMs;
    notify?.({ ...found, formatted: formatTime(found.elapsedMs) });
    if (found.running) resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

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
    restoreNotice,
  };
}
