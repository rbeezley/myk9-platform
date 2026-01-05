/**
 * AKCNationalsScoresheet Helper Functions
 *
 * Extracted from AKCNationalsScoresheet.tsx to reduce complexity.
 * Contains timer logic, calculations, and utility functions.
 */

import type { AreaScore } from '../../../services/scoresheets/areaInitialization';
import type { ElementType } from '../../../services/nationalsScoring';
import { NATIONALS_SCORING } from '../../../constants/nationalsConstants';
import { formatSecondsToTime } from '../../../utils/timeUtils';

// ============================================================================
// Nationals-specific Types
// ============================================================================

export type NationalsQualifyingResult = 'Qualified' | 'Absent' | 'Excused';

// ============================================================================
// Time Formatting
// ============================================================================

/**
 * Format stopwatch time in milliseconds to display string (M:SS.ss)
 */
export function formatStopwatchTime(milliseconds: number): string {
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2);
  return `${minutes}:${seconds.padStart(5, '0')}`;
}

/**
 * Convert time string (M:SS or M:SS.ss) to seconds
 */
export function convertTimeToSeconds(timeString: string): number {
  const parts = timeString.split(':');
  if (parts.length === 2) {
    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return Math.round(minutes * 60 + seconds);
  }
  return Math.round(parseFloat(timeString) || 0);
}

/**
 * Parse max time string to milliseconds
 */
export function parseMaxTimeToMs(maxTimeStr: string): number {
  if (!maxTimeStr) return 0;
  const [minutes, seconds] = maxTimeStr.split(':').map(parseFloat);
  return (minutes * 60 + seconds) * 1000;
}

// ============================================================================
// Nationals Points Calculation
// ============================================================================

/**
 * Calculate Nationals points based on alerts, faults, and errors
 */
export function calculateNationalsPoints(
  isExcused: boolean,
  alertsCorrect: number,
  alertsIncorrect: number,
  faultCount: number,
  finishCallErrors: number
): number {
  if (isExcused) return 0;

  const correctPoints = alertsCorrect * NATIONALS_SCORING.CORRECT_ALERT_POINTS;
  const incorrectPenalty = alertsIncorrect * NATIONALS_SCORING.INCORRECT_ALERT_PENALTY;
  const faultPenalty = faultCount * NATIONALS_SCORING.FAULT_PENALTY;
  const finishErrorPenalty = finishCallErrors * NATIONALS_SCORING.FINISH_CALL_ERROR_PENALTY;

  return correctPoints - incorrectPenalty - faultPenalty - finishErrorPenalty;
}

// ============================================================================
// Element Type Mapping
// ============================================================================

/**
 * Map element string to Nationals element type
 */
export function mapElementToNationalsType(element: string): ElementType {
  const elementLower = element?.toLowerCase() || '';
  if (elementLower.includes('container')) return 'CONTAINER';
  if (elementLower.includes('buried')) return 'BURIED';
  if (elementLower.includes('interior')) return 'INTERIOR';
  if (elementLower.includes('exterior')) return 'EXTERIOR';
  if (elementLower.includes('handler') || elementLower.includes('discrimination')) return 'HD_CHALLENGE';
  return 'CONTAINER'; // Default
}

// ============================================================================
// Timer Warning Logic
// ============================================================================

export interface TimerWarningParams {
  isStopwatchRunning: boolean;
  stopwatchTime: number;
  level: string;
  maxTimeMs: number;
}

/**
 * Check if 30-second warning should be shown
 */
export function shouldShow30SecondWarning(params: TimerWarningParams): boolean {
  const { isStopwatchRunning, stopwatchTime, level, maxTimeMs } = params;

  if (!isStopwatchRunning) return false;

  const levelLower = level?.toLowerCase() || '';
  if (levelLower === 'master' || levelLower === 'masters') return false;

  if (maxTimeMs <= 0) return false;

  const remainingMs = maxTimeMs - stopwatchTime;
  return remainingMs > 0 && remainingMs <= 30000;
}

/**
 * Check if time has expired
 */
export function isTimeExpired(stopwatchTime: number, maxTimeMs: number): boolean {
  return stopwatchTime > 0 && maxTimeMs > 0 && stopwatchTime >= maxTimeMs;
}

/**
 * Get timer warning message
 */
export function getTimerWarningMessage(
  stopwatchTime: number,
  maxTimeMs: number,
  warningParams: TimerWarningParams
): string | null {
  if (isTimeExpired(stopwatchTime, maxTimeMs)) {
    return "Time Expired";
  } else if (shouldShow30SecondWarning(warningParams)) {
    return "30 Second Warning";
  }
  return null;
}

/**
 * Get remaining time string
 */
export function getRemainingTimeString(
  stopwatchTime: number,
  maxTimeMs: number
): string {
  if (maxTimeMs <= 0) return '';

  const remainingMs = Math.max(0, maxTimeMs - stopwatchTime);
  const remainingSeconds = remainingMs / 1000;
  const mins = Math.floor(remainingSeconds / 60);
  const secs = (remainingSeconds % 60).toFixed(2);

  return `${mins}:${secs.padStart(5, '0')}`;
}

// ============================================================================
// Area Updates for Excused
// ============================================================================

/**
 * Create updated areas when dog is excused (set max times, clear finds)
 */
export function createExcusedAreas(
  areas: AreaScore[],
  getMaxTimeForArea: (index: number) => string
): AreaScore[] {
  return areas.map((area, index) => ({
    ...area,
    time: getMaxTimeForArea(index),
    found: false,
    correct: false
  }));
}

/**
 * Calculate total max time for all areas (for excused dogs)
 */
export function calculateTotalMaxTime(
  areas: { time: string }[],
  convertToSeconds: (time: string) => number
): string {
  const totalSeconds = areas.reduce((sum, area) => {
    return sum + convertToSeconds(area.time);
  }, 0);
  return formatSecondsToTime(totalSeconds);
}

// ============================================================================
// Auto-Update Areas Based on Alerts
// ============================================================================

/**
 * Update areas based on alert counts
 */
export function updateAreasFromAlerts(
  areas: AreaScore[],
  alertsCorrect: number,
  alertsIncorrect: number
): AreaScore[] {
  return areas.map((area, index) => {
    const correctForThisArea = index < alertsCorrect;
    const incorrectForThisArea = index < alertsIncorrect && index >= alertsCorrect;

    return {
      ...area,
      found: correctForThisArea || incorrectForThisArea,
      correct: correctForThisArea
    };
  });
}
