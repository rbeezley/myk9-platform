/**
 * useAreaManagement Hook
 *
 * Extracted from AKCScentWorkScoresheet.tsx and AKCNationalsScoresheet.tsx
 * Manages search area state and interactions for scent work scoring.
 *
 * Features:
 * - Area initialization based on element/level
 * - Area update handlers (time, found, correct)
 * - Smart time input parsing and formatting
 * - Total time calculation across all areas
 * - Area clearing and reset
 *
 * @example
 * ```tsx
 * const areas = useAreaManagement({
 *   element: 'Interior',
 *   level: 'Excellent',
 *   isNationalsMode: false
 * });
 *
 * <input
 *   value={areas.areas[0].time}
 *   onChange={(e) => areas.handleTimeInput(0, e.target.value)}
 *   onBlur={(e) => areas.handleTimeBlur(0, e.target.value)}
 * />
 * <div>Total: {areas.totalTime}</div>
 * ```
 */

import { useState, useCallback, useMemo } from 'react';
import { initializeAreas, type AreaScore } from '../services/scoresheets/areaInitialization';
import { parseSmartTime } from '../utils/timeInputParsing';

export interface UseAreaManagementOptions {
  /** Scent work element (e.g., 'Interior', 'Container') */
  element?: string;
  /** Class level (e.g., 'Novice', 'Excellent', 'Master') */
  level?: string;
  /** Whether this is a Nationals event */
  isNationalsMode?: boolean;
  /** Callback when area time changes (for external synchronization) */
  onAreaTimeChange?: (areaIndex: number, time: string) => void;
}

export interface UseAreaManagementReturn {
  /** Current area scores */
  areas: AreaScore[];
  /** Update a specific field of an area */
  updateArea: (index: number, field: keyof AreaScore, value: AreaScore[keyof AreaScore]) => void;
  /** Handle time input change (real-time typing) */
  handleTimeInput: (index: number, rawInput: string) => void;
  /** Handle time input blur (apply smart parsing) */
  handleTimeBlur: (index: number, rawInput: string) => void;
  /** Clear time for a specific area */
  clearTime: (index: number) => void;
  /** Initialize areas for a new class/entry */
  initializeForClass: (element: string, level: string) => void;
  /** Set all areas at once (for loading saved data) */
  setAreas: (areas: AreaScore[]) => void;
  /** Calculate total time across all areas */
  totalTime: string;
  /** Get count of areas with hides found */
  foundCount: number;
  /** Get count of correct hides */
  correctCount: number;
  /** Reset all areas */
  reset: () => void;
}

/**
 * Hook for managing search areas in scent work scoring
 *
 * Handles area initialization, time input, and calculations based on
 * element type, level, and show type (regular vs Nationals).
 */
export function useAreaManagement(
  options: UseAreaManagementOptions = {}
): UseAreaManagementReturn {
  const {
    element = '',
    level = '',
    isNationalsMode = false,
    onAreaTimeChange
  } = options;

  // Area state
  const [areas, setAreas] = useState<AreaScore[]>(() =>
    initializeAreas(element, level, isNationalsMode)
  );

  /**
   * Update a specific field of an area
   */
  const updateArea = useCallback((index: number, field: keyof AreaScore, value: AreaScore[keyof AreaScore]) => {
    setAreas((prev) =>
      prev.map((area, i) =>
        i === index ? { ...area, [field]: value } : area
      )
    );

    // Notify external listener if time changed
    // Type assertion is safe: when field === 'time', value must be string per AreaScore type
    if (field === 'time' && onAreaTimeChange) {
      onAreaTimeChange(index, value as string);
    }
  }, [onAreaTimeChange]);

  /**
   * Handle time input change (real-time typing)
   */
  const handleTimeInput = useCallback((index: number, rawInput: string) => {
    updateArea(index, 'time', rawInput);
  }, [updateArea]);

  /**
   * Handle time input blur (apply smart parsing)
   */
  const handleTimeBlur = useCallback((index: number, rawInput: string) => {
    const parsedTime = parseSmartTime(rawInput);
    updateArea(index, 'time', parsedTime);
  }, [updateArea]);

  /**
   * Clear time for a specific area
   */
  const clearTime = useCallback((index: number) => {
    updateArea(index, 'time', '');
  }, [updateArea]);

  /**
   * Initialize areas for a new class/entry
   */
  const initializeForClass = useCallback((element: string, level: string) => {
    const newAreas = initializeAreas(element, level, isNationalsMode);
    setAreas(newAreas);
  }, [isNationalsMode]);

  /**
   * Convert time string to seconds
   */
  const convertTimeToSeconds = useCallback((timeString: string): number => {
    const parts = timeString.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return Math.round(minutes * 60 + seconds);
    }
    return Math.round(parseFloat(timeString) || 0);
  }, []);

  /**
   * Calculate total time across all areas
   */
  const totalTime = useMemo(() => {
    const totalSeconds = areas.reduce((sum, area) => {
      return sum + (area.time ? convertTimeToSeconds(area.time) : 0);
    }, 0);

    if (totalSeconds === 0) return '';

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    // Format as "M:SS" (e.g., "2:35")
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [areas, convertTimeToSeconds]);

  /**
   * Get count of areas with hides found
   */
  const foundCount = useMemo(() => {
    return areas.filter((area) => area.found).length;
  }, [areas]);

  /**
   * Get count of correct hides
   */
  const correctCount = useMemo(() => {
    return areas.filter((area) => area.correct).length;
  }, [areas]);

  /**
   * Reset all areas
   */
  const reset = useCallback(() => {
    setAreas(initializeAreas(element, level, isNationalsMode));
  }, [element, level, isNationalsMode]);

  return {
    areas,
    updateArea,
    handleTimeInput,
    handleTimeBlur,
    clearTime,
    initializeForClass,
    setAreas,
    totalTime,
    foundCount,
    correctCount,
    reset
  };
}
