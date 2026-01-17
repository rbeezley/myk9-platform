/**
 * Countdown Timer Hook for Result Entry System
 * 
 * Provides dual timer functionality (stopwatch + countdown) for accurate
 * dog show result timing with warning alerts and precision control.
 * 
 * Used by judges for real-time timing during competition events.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface CountdownTimerState {
  // Timer values in milliseconds
  searchTime: number;        // Elapsed time (stopwatch counting up)
  remainingTime: number;     // Time remaining (countdown)
  
  // Timer status
  isRunning: boolean;
  isWarning: boolean;        // True when within 30 seconds of time limit
  isExpired: boolean;        // True when time limit exceeded
  
  // Control functions
  start: () => void;
  stop: () => void;
  reset: () => void;
  
  // Current timer display values
  searchTimeDisplay: string;    // MM:SS.HH format
  remainingTimeDisplay: string; // MM:SS format
}

interface UseCountdownTimerOptions {
  maxTimeMs: number;                                    // Class time limit in milliseconds
  level: 'Novice' | 'Advanced' | 'Excellent' | 'Masters'; // Competition level
  onTimeWarning?: (remainingMs: number) => void;       // Called at 30-second warning
  onTimeExpired?: () => void;                           // Called when time limit exceeded
  onSearchTime?: (timeMs: number) => void;              // Called when timer stopped
  precision?: number;                                   // Update interval in ms (default: 10)
}

const WARNING_THRESHOLD_MS = 30000; // 30 seconds

/**
 * Custom hook for dual timer functionality (stopwatch + countdown)
 * 
 * Provides precise timing for dog show competitions with warning alerts
 * and automatic expiration handling. Follows AKC timing rules.
 * 
 * @param options - Timer configuration and callbacks
 * @returns Timer state and control functions
 * 
 * @example
 * ```tsx
 * const timer = useCountdownTimer({
 *   maxTimeMs: 120000, // 2 minutes
 *   level: 'Novice',
 *   onTimeWarning: (remaining) => playWarningSound(),
 *   onTimeExpired: () => handleTimeExpired(),
 *   onSearchTime: (time) => setResultTime(time)
 * });
 * 
 * // Start timing when dog begins search
 * <button onClick={timer.start}>Start</button>
 * 
 * // Display current times
 * <div>Search Time: {timer.searchTimeDisplay}</div>
 * <div>Remaining: {timer.remainingTimeDisplay}</div>
 * ```
 */
export function useCountdownTimer(options: UseCountdownTimerOptions): CountdownTimerState {
  const {
    maxTimeMs,
    level,
    onTimeWarning,
    onTimeExpired,
    onSearchTime,
    precision = 10
  } = options;

  // Timer state
  const [searchTime, setSearchTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // Refs for interval and callbacks
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const warningTriggeredRef = useRef(false);
  const expiredTriggeredRef = useRef(false);

  // Store callbacks in refs to avoid dependency issues - sync in effect
  const onTimeWarningRef = useRef(onTimeWarning);
  const onTimeExpiredRef = useRef(onTimeExpired);
  useEffect(() => {
    onTimeWarningRef.current = onTimeWarning;
    onTimeExpiredRef.current = onTimeExpired;
  });

  // Calculate remaining time
  const remainingTime = Math.max(0, maxTimeMs - searchTime);

  // Masters level doesn't get warnings per AKC rules
  const shouldShowWarnings = level !== 'Masters';

  // Format time displays
  const searchTimeDisplay = formatTimePrecise(searchTime);
  const remainingTimeDisplay = formatTimeMinutes(remainingTime);

  // Start timer
  const start = useCallback(() => {
    if (isRunning) return;

    const now = Date.now();
    startTimeRef.current = now - pausedTimeRef.current;
    
    setIsRunning(true);
    warningTriggeredRef.current = false;
    expiredTriggeredRef.current = false;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setSearchTime(elapsed);
    }, precision);
  }, [isRunning, precision]);

  // Stop timer
  const stop = useCallback(() => {
    if (!isRunning) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsRunning(false);
    pausedTimeRef.current = searchTime;
    
    // Notify parent component of final time
    if (onSearchTime) {
      onSearchTime(searchTime);
    }
  }, [isRunning, searchTime, onSearchTime]);

  // Reset timer
  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setSearchTime(0);
    setIsRunning(false);

    pausedTimeRef.current = 0;
    startTimeRef.current = 0;
    warningTriggeredRef.current = false;
    expiredTriggeredRef.current = false;
  }, []);

  // Derive warning and expired state from remaining time
  const remaining = maxTimeMs - searchTime;
  const isWarning = shouldShowWarnings && remaining <= WARNING_THRESHOLD_MS && remaining > 0;
  const isExpired = remaining <= 0;

  // Store stop in ref to use in effect without dependency - sync in effect
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });

  // Handle callbacks and auto-stop for expiration
  useEffect(() => {
    // Handle warning callback
    if (isWarning && !warningTriggeredRef.current) {
      warningTriggeredRef.current = true;
      onTimeWarningRef.current?.(remaining);
    }

    // Handle expiration
    if (isExpired && !expiredTriggeredRef.current) {
      expiredTriggeredRef.current = true;
      // Auto-stop timer when expired - use setTimeout to defer the state update
      if (isRunning) {
        setTimeout(() => stopRef.current(), 0);
      }
      onTimeExpiredRef.current?.();
    }
  }, [isWarning, isExpired, remaining, isRunning]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    searchTime,
    remainingTime,
    isRunning,
    isWarning,
    isExpired,
    start,
    stop,
    reset,
    searchTimeDisplay,
    remainingTimeDisplay
  };
}

/**
 * Format time for precise display (MM:SS.HH)
 */
function formatTimePrecise(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

/**
 * Format time for countdown display (MM:SS)
 */
function formatTimeMinutes(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000); // Round up for countdown
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Multi-area timer hook for Interior Excellent and Masters classes
 * 
 * Manages sequential timing across multiple search areas with progressive
 * unlocking and individual time limits per area.
 */
interface MultiAreaTimerOptions {
  areas: Array<{
    areaNumber: number;
    maxTimeMs: number;
  }>;
  level: 'Excellent' | 'Masters';
  onAreaComplete?: (areaNumber: number, timeMs: number) => void;
  onAllComplete?: (totalTimeMs: number) => void;
}

export interface MultiAreaTimerState extends CountdownTimerState {
  currentArea: number;           // Currently active area (1-based)
  completedAreas: number[];      // List of completed area numbers
  areaResults: Array<{           // Results for each area
    areaNumber: number;
    searchTime: number;
    qualified: boolean;
  }>;
  totalSearchTime: number;       // Sum of all area times
  canProceedToNext: boolean;     // Whether next area is unlocked
  
  // Multi-area specific controls
  assignTimeToArea: (areaNumber: number) => void;
  proceedToNextArea: () => void;
  getCurrentAreaLimit: () => number;
}

/**
 * Hook for managing multi-area timer sequences
 * 
 * Used for Interior Excellent (2 areas) and Interior Masters (3 areas)
 * with different time limits per area and sequential progression.
 */
export function useMultiAreaTimer(options: MultiAreaTimerOptions): MultiAreaTimerState {
  const { areas, level, onAreaComplete, onAllComplete } = options;
  
  const [currentArea, setCurrentArea] = useState(1);
  const [areaResults, setAreaResults] = useState<Array<{
    areaNumber: number;
    searchTime: number;
    qualified: boolean;
  }>>([]);

  // Get current area configuration
  const currentAreaConfig = areas.find(area => area.areaNumber === currentArea);
  const maxTimeMs = currentAreaConfig?.maxTimeMs || 0;

  // Base timer for current area
  const baseTimer = useCountdownTimer({
    maxTimeMs,
    level,
    precision: 10
  });

  // Calculate derived state
  const completedAreas = areaResults.map(result => result.areaNumber);
  const totalSearchTime = areaResults.reduce((sum, result) => sum + result.searchTime, 0);
  const canProceedToNext = areaResults.length > 0 && 
                          areaResults[areaResults.length - 1]?.qualified &&
                          currentArea < areas.length;

  // Assign current timer time to specific area
  const assignTimeToArea = useCallback((areaNumber: number) => {
    if (!baseTimer.searchTime) return;

    const newResult = {
      areaNumber,
      searchTime: baseTimer.searchTime,
      qualified: true // Default to qualified - will be set by scoresheet
    };

    setAreaResults(prev => {
      const filtered = prev.filter(r => r.areaNumber !== areaNumber);
      return [...filtered, newResult].sort((a, b) => a.areaNumber - b.areaNumber);
    });

    // Reset timer for next area
    baseTimer.reset();

    // Notify parent
    if (onAreaComplete) {
      onAreaComplete(areaNumber, baseTimer.searchTime);
    }
  }, [baseTimer, onAreaComplete]);

  // Proceed to next area
  const proceedToNextArea = useCallback(() => {
    if (canProceedToNext) {
      setCurrentArea(prev => prev + 1);
    }
  }, [canProceedToNext]);

  // Get current area time limit
  const getCurrentAreaLimit = useCallback(() => {
    return maxTimeMs;
  }, [maxTimeMs]);

  // Check if all areas are complete
  useEffect(() => {
    if (areaResults.length === areas.length && onAllComplete) {
      onAllComplete(totalSearchTime);
    }
  }, [areaResults.length, areas.length, totalSearchTime, onAllComplete]);

  return {
    ...baseTimer,
    currentArea,
    completedAreas,
    areaResults,
    totalSearchTime,
    canProceedToNext,
    assignTimeToArea,
    proceedToNextArea,
    getCurrentAreaLimit
  };
}