/**
 * useNationalsCounters Hook
 *
 * Extracted from AKCNationalsScoresheet.tsx
 * Manages Nationals-specific alert counters and point calculations for scoring.
 *
 * Features:
 * - Alert counters (correct/incorrect)
 * - Finish call error tracking
 * - Excused status
 * - Real-time point calculation
 * - Callback for area auto-updates
 *
 * @example
 * ```tsx
 * const nationals = useNationalsCounters({
 *   faultCount: 2,
 *   onAlertsChange: (correct, incorrect) => updateAreas(correct, incorrect)
 * });
 *
 * <NationalsCounterSimple
 *   alertsCorrect={nationals.alertsCorrect}
 *   onAlertsCorrectChange={nationals.setAlertsCorrect}
 * />
 * <div>Points: {nationals.totalPoints}</div>
 * ```
 */

import { useState, useEffect, useCallback } from 'react';

export interface UseNationalsCountersOptions {
  /** Fault count for penalty calculation */
  faultCount?: number;
  /** Callback when alerts change (for area auto-calculation) */
  onAlertsChange?: (alertsCorrect: number, alertsIncorrect: number) => void;
}

export interface UseNationalsCountersReturn {
  /** Number of correct alerts */
  alertsCorrect: number;
  /** Number of incorrect alerts */
  alertsIncorrect: number;
  /** Number of finish call errors */
  finishCallErrors: number;
  /** Whether the dog is excused */
  isExcused: boolean;
  /** Calculated total points (real-time) */
  totalPoints: number;
  /** Set number of correct alerts */
  setAlertsCorrect: (value: number | ((prev: number) => number)) => void;
  /** Set number of incorrect alerts */
  setAlertsIncorrect: (value: number | ((prev: number) => number)) => void;
  /** Set number of finish call errors */
  setFinishCallErrors: (value: number | ((prev: number) => number)) => void;
  /** Set excused status */
  setIsExcused: (value: boolean | ((prev: boolean) => boolean)) => void;
  /** Increment correct alerts */
  incrementCorrect: () => void;
  /** Decrement correct alerts */
  decrementCorrect: () => void;
  /** Increment incorrect alerts */
  incrementIncorrect: () => void;
  /** Decrement incorrect alerts */
  decrementIncorrect: () => void;
  /** Increment finish call errors */
  incrementFinishErrors: () => void;
  /** Decrement finish call errors */
  decrementFinishErrors: () => void;
  /** Reset all counters to zero */
  reset: () => void;
}

/**
 * Hook for managing Nationals scoring counters
 *
 * Nationals scoring uses a points-based system:
 * - Correct alerts: +10 points each
 * - Incorrect alerts: -5 points each
 * - Faults: -2 points each
 * - Finish call errors: -5 points each
 * - Excused: 0 points total
 */
export function useNationalsCounters(
  options: UseNationalsCountersOptions = {}
): UseNationalsCountersReturn {
  const { faultCount = 0, onAlertsChange } = options;

  // Nationals-specific state
  const [alertsCorrect, setAlertsCorrect] = useState(0);
  const [alertsIncorrect, setAlertsIncorrect] = useState(0);
  const [finishCallErrors, setFinishCallErrors] = useState(0);
  const [isExcused, setIsExcused] = useState(false);

  /**
   * Calculate Nationals points in real-time
   *
   * Formula:
   * - Correct alerts: +10 points each
   * - Incorrect alerts: -5 points each
   * - Faults: -2 points each
   * - Finish call errors: -5 points each
   * - Excused: 0 points total
   */
  const calculatePoints = useCallback((): number => {
    if (isExcused) return 0;

    const correctPoints = alertsCorrect * 10;
    const incorrectPenalty = alertsIncorrect * 5;
    const faultPenalty = faultCount * 2;
    const finishErrorPenalty = finishCallErrors * 5;

    return correctPoints - incorrectPenalty - faultPenalty - finishErrorPenalty;
  }, [alertsCorrect, alertsIncorrect, faultCount, finishCallErrors, isExcused]);

  // Recalculate points whenever dependencies change
  const totalPoints = calculatePoints();

  /**
   * Notify parent when alerts change (for area auto-calculation)
   */
  useEffect(() => {
    if (onAlertsChange) {
      onAlertsChange(alertsCorrect, alertsIncorrect);
    }
  }, [alertsCorrect, alertsIncorrect, onAlertsChange]);

  /**
   * Increment correct alerts
   */
  const incrementCorrect = useCallback(() => {
    setAlertsCorrect((prev) => prev + 1);
  }, []);

  /**
   * Decrement correct alerts (minimum 0)
   */
  const decrementCorrect = useCallback(() => {
    setAlertsCorrect((prev) => Math.max(0, prev - 1));
  }, []);

  /**
   * Increment incorrect alerts
   */
  const incrementIncorrect = useCallback(() => {
    setAlertsIncorrect((prev) => prev + 1);
  }, []);

  /**
   * Decrement incorrect alerts (minimum 0)
   */
  const decrementIncorrect = useCallback(() => {
    setAlertsIncorrect((prev) => Math.max(0, prev - 1));
  }, []);

  /**
   * Increment finish call errors
   */
  const incrementFinishErrors = useCallback(() => {
    setFinishCallErrors((prev) => prev + 1);
  }, []);

  /**
   * Decrement finish call errors (minimum 0)
   */
  const decrementFinishErrors = useCallback(() => {
    setFinishCallErrors((prev) => Math.max(0, prev - 1));
  }, []);

  /**
   * Reset all counters to zero
   */
  const reset = useCallback(() => {
    setAlertsCorrect(0);
    setAlertsIncorrect(0);
    setFinishCallErrors(0);
    setIsExcused(false);
  }, []);

  return {
    alertsCorrect,
    alertsIncorrect,
    finishCallErrors,
    isExcused,
    totalPoints,
    setAlertsCorrect,
    setAlertsIncorrect,
    setFinishCallErrors,
    setIsExcused,
    incrementCorrect,
    decrementCorrect,
    incrementIncorrect,
    decrementIncorrect,
    incrementFinishErrors,
    decrementFinishErrors,
    reset
  };
}
