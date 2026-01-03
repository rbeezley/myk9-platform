/**
 * Multi-Area Timing Hook
 * 
 * Manages sequential timing for multi-area Scent Work classes (Interior Excellent/Masters).
 * Tracks individual area times, handles area transitions, and maintains total time.
 */

import { useState, useCallback, useRef } from 'react';
import { useCountdownTimer } from './useCountdownTimer';
import type { AreaStatus } from '@/types/scent-work-types';

export interface UseMultiAreaTimingProps {
  totalTimeMs: number;
  areaCount: number;
  level: 'Novice' | 'Advanced' | 'Excellent' | 'Masters';
  onAreaComplete?: (areaIndex: number, timeMs: number) => void;
  onAllAreasComplete?: (totalTimeMs: number, areaTimes: number[]) => void;
  onTimeExpired?: () => void;
}

export interface UseMultiAreaTimingReturn {
  // Current state
  currentAreaIndex: number;
  areaStatuses: AreaStatus[];
  areaTimes: number[];
  totalElapsedTime: number;
  remainingTime: number;
  isRunning: boolean;
  
  // Actions
  startArea: (areaIndex?: number) => void;
  completeCurrentArea: () => void;
  failCurrentArea: () => void;
  reset: () => void;
  
  // Timer control for current area
  pauseTimer: () => void;
  resumeTimer: () => void;
  
  // Derived state
  canStartArea: (areaIndex: number) => boolean;
  isAreaActive: (areaIndex: number) => boolean;
  isComplete: boolean;
  hasFailed: boolean;
}

/**
 * Custom hook for managing multi-area timing in Scent Work
 * 
 * Features:
 * - Sequential area timing with locked progression
 * - Individual area time tracking
 * - Total time limit enforcement
 * - Area status management (locked/ready/active/completed/failed)
 * - Automatic progression and failure handling
 */
export function useMultiAreaTiming({
  totalTimeMs,
  areaCount,
  level,
  onAreaComplete,
  onAllAreasComplete,
  onTimeExpired
}: UseMultiAreaTimingProps): UseMultiAreaTimingReturn {
  // State management
  const [currentAreaIndex, setCurrentAreaIndex] = useState<number>(-1);
  const [areaStatuses, setAreaStatuses] = useState<AreaStatus[]>(() => 
    Array(areaCount).fill(null).map((_, index) => 
      index === 0 ? 'ready' : 'locked'
    )
  );
  const [areaTimes, setAreaTimes] = useState<number[]>(() => 
    Array(areaCount).fill(0)
  );
  
  // Refs for tracking time across areas
  const areaStartTimeRef = useRef<number>(0);
  const totalStartTimeRef = useRef<number>(0);
  const cumulativeTimeRef = useRef<number>(0);
  
  // Calculate total elapsed time (currently tracked by timer)
  // const totalElapsedTime = areaTimes.reduce((sum, time) => sum + time, 0);
  
  // Single countdown timer for total time limit
  const {
    searchTime: elapsedTimeMs,
    remainingTime: remainingTimeMs,
    isRunning,
    start: startTimer,
    stop: stopTimer,
    reset: resetTimer
  } = useCountdownTimer({
    maxTimeMs: totalTimeMs,
    level: level,
    onTimeExpired: () => {
      // Mark current area as failed and stop
      if (currentAreaIndex >= 0) {
        failCurrentArea();
      }
      onTimeExpired?.();
    }
  });
  
  // Helper functions - defined before use
  const canStartArea = useCallback((areaIndex: number): boolean => {
    return areaStatuses[areaIndex] === 'ready' && currentAreaIndex === -1;
  }, [areaStatuses, currentAreaIndex]);
  
  // Start timing for a specific area
  const startArea = useCallback((areaIndex: number = 0) => {
    // Validate area can be started
    if (!canStartArea(areaIndex)) {
      console.warn(`Cannot start area ${areaIndex} - not ready`);
      return;
    }
    
    // Update area status
    setAreaStatuses(prev => {
      const newStatuses = [...prev];
      newStatuses[areaIndex] = 'active';
      return newStatuses;
    });
    
    // Set current area and track start time
    setCurrentAreaIndex(areaIndex);
    areaStartTimeRef.current = performance.now();
    
    // Start overall timer if this is the first area
    if (areaIndex === 0 && !isRunning) {
      totalStartTimeRef.current = performance.now();
      startTimer();
    } else if (!isRunning) {
      // Restart timer for subsequent areas
      startTimer();
    }
  }, [startTimer, isRunning, canStartArea]);
  
  // Complete the current area and move to next
  const completeCurrentArea = useCallback(() => {
    if (currentAreaIndex < 0 || areaStatuses[currentAreaIndex] !== 'active') {
      return;
    }
    
    // Calculate area time
    const areaTime = performance.now() - areaStartTimeRef.current;
    
    // Update area times
    setAreaTimes(prev => {
      const newTimes = [...prev];
      newTimes[currentAreaIndex] = areaTime;
      return newTimes;
    });
    
    // Update area status
    setAreaStatuses(prev => {
      const newStatuses = [...prev];
      newStatuses[currentAreaIndex] = 'completed';
      
      // Unlock next area if available
      if (currentAreaIndex + 1 < areaCount) {
        newStatuses[currentAreaIndex + 1] = 'ready';
      }
      
      return newStatuses;
    });
    
    // Track cumulative time
    cumulativeTimeRef.current += areaTime;
    
    // Notify completion
    onAreaComplete?.(currentAreaIndex, areaTime);
    
    // Check if all areas complete
    const nextAreaIndex = currentAreaIndex + 1;
    if (nextAreaIndex >= areaCount) {
      // All areas complete
      stopTimer();
      const totalTime = performance.now() - totalStartTimeRef.current;
      onAllAreasComplete?.(totalTime, [...areaTimes]);
      setCurrentAreaIndex(-1);
    } else {
      // Stop timer between areas (will be restarted when next area begins)
      stopTimer();
      setCurrentAreaIndex(-1); // No active area until next is started
    }
  }, [currentAreaIndex, areaStatuses, areaCount, stopTimer, onAreaComplete, onAllAreasComplete, areaTimes]);
  
  // Fail the current area
  const failCurrentArea = useCallback(() => {
    if (currentAreaIndex < 0 || areaStatuses[currentAreaIndex] !== 'active') {
      return;
    }
    
    // Calculate area time up to failure
    const areaTime = performance.now() - areaStartTimeRef.current;
    
    // Update area times
    setAreaTimes(prev => {
      const newTimes = [...prev];
      newTimes[currentAreaIndex] = areaTime;
      return newTimes;
    });
    
    // Update area status
    setAreaStatuses(prev => {
      const newStatuses = [...prev];
      newStatuses[currentAreaIndex] = 'failed';
      
      // Lock all subsequent areas
      for (let i = currentAreaIndex + 1; i < areaCount; i++) {
        newStatuses[i] = 'locked';
      }
      
      return newStatuses;
    });
    
    // Stop timing
    stopTimer();
    setCurrentAreaIndex(-1);
  }, [currentAreaIndex, areaStatuses, areaCount, stopTimer]);
  
  // Reset all timing state
  const reset = useCallback(() => {
    setCurrentAreaIndex(-1);
    setAreaStatuses(Array(areaCount).fill(null).map((_, index) => 
      index === 0 ? 'ready' : 'locked'
    ));
    setAreaTimes(Array(areaCount).fill(0));
    areaStartTimeRef.current = 0;
    totalStartTimeRef.current = 0;
    cumulativeTimeRef.current = 0;
    resetTimer();
  }, [areaCount, resetTimer]);
  
  const isAreaActive = useCallback((areaIndex: number): boolean => {
    return areaStatuses[areaIndex] === 'active' && currentAreaIndex === areaIndex;
  }, [areaStatuses, currentAreaIndex]);
  
  // Derived state
  const isComplete = areaStatuses.every(status => status === 'completed');
  const hasFailed = areaStatuses.some(status => status === 'failed');
  
  // Stub pause/resume for now (timer is controlled by start/stop)
  const pauseTimer = useCallback(() => {
    console.warn('Pause not supported in multi-area timing');
  }, []);
  
  const resumeTimer = useCallback(() => {
    console.warn('Resume not supported in multi-area timing');
  }, []);

  return {
    // Current state
    currentAreaIndex,
    areaStatuses,
    areaTimes,
    totalElapsedTime: elapsedTimeMs,
    remainingTime: remainingTimeMs,
    isRunning,
    
    // Actions
    startArea,
    completeCurrentArea,
    failCurrentArea,
    reset,
    pauseTimer,
    resumeTimer,
    
    // Derived state
    canStartArea,
    isAreaActive,
    isComplete,
    hasFailed
  };
}