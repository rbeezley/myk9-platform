/**
 * Calculation Utilities
 *
 * Mathematical and business logic calculations for dog show scoring.
 * Provides reusable calculation functions for time, areas, and search metrics.
 */

/**
 * Calculate total search time from individual area times
 *
 * **AKC Scent Work Rule**: Total search time is the sum of all applicable area times.
 * Areas may be 1, 2, or 3 depending on element and level:
 * - All elements/levels: Area 1
 * - Interior Excellent/Master, Handler Discrimination Master: Areas 1 + 2
 * - Interior Master only: Areas 1 + 2 + 3
 *
 * @param area1Time - Time for Area 1 in seconds (may be undefined/null)
 * @param area2Time - Time for Area 2 in seconds (may be undefined/null)
 * @param area3Time - Time for Area 3 in seconds (may be undefined/null)
 * @returns Total time in seconds (sum of all non-null/undefined areas)
 *
 * @example
 * ```typescript
 * // Interior Master (3 areas)
 * calculateTotalAreaTime(45, 52, 38) // 135 seconds
 *
 * // Interior Excellent (2 areas)
 * calculateTotalAreaTime(45, 52, undefined) // 97 seconds
 *
 * // Containers Novice (1 area)
 * calculateTotalAreaTime(45, undefined, undefined) // 45 seconds
 *
 * // Handle null values
 * calculateTotalAreaTime(45, null, null) // 45 seconds
 *
 * // All areas missing
 * calculateTotalAreaTime(undefined, undefined, undefined) // 0 seconds
 * ```
 */
export function calculateTotalAreaTime(
  area1Time?: number | null,
  area2Time?: number | null,
  area3Time?: number | null
): number {
  let totalTime = 0;

  if (area1Time) {
    totalTime += area1Time;
  }

  if (area2Time) {
    totalTime += area2Time;
  }

  if (area3Time) {
    totalTime += area3Time;
  }

  return totalTime;
}

/**
 * Format milliseconds to MM:SS.ss display format
 *
 * @param milliseconds - Time in milliseconds
 * @returns Formatted time string (e.g., "01:23.45")
 *
 * @example
 * ```typescript
 * formatTimeDisplay(83450) // "01:23.45"
 * formatTimeDisplay(5000)  // "00:05.00"
 * formatTimeDisplay(0)     // "00:00.00"
 * ```
 */
export function formatTimeDisplay(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const ms = milliseconds % 1000;

  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${Math.floor(ms / 10)
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Format seconds to M:SS display format
 *
 * @param seconds - Time in seconds
 * @returns Formatted time string (e.g., "1:23")
 *
 * @example
 * ```typescript
 * formatSecondsDisplay(83)  // "1:23"
 * formatSecondsDisplay(5)   // "0:05"
 * formatSecondsDisplay(125) // "2:05"
 * ```
 */
export function formatSecondsDisplay(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate remaining time from elapsed and max time
 *
 * @param elapsedMs - Elapsed time in milliseconds
 * @param maxTimeMs - Maximum allowed time in milliseconds
 * @returns Remaining time in milliseconds (0 if expired)
 *
 * @example
 * ```typescript
 * calculateRemainingTime(30000, 180000) // 150000
 * calculateRemainingTime(180000, 180000) // 0
 * calculateRemainingTime(200000, 180000) // 0
 * ```
 */
export function calculateRemainingTime(
  elapsedMs: number,
  maxTimeMs: number
): number {
  return Math.max(0, maxTimeMs - elapsedMs);
}

/**
 * Calculate Fast CAT speed in MPH
 *
 * @param timeInSeconds - Run time in seconds
 * @param courseLength - Course length in yards (default: 100)
 * @returns Speed in miles per hour
 *
 * @example
 * ```typescript
 * calculateFastCatMph(6.5, 100) // ~31.47 mph
 * calculateFastCatMph(10, 100)  // ~20.45 mph
 * ```
 */
export function calculateFastCatMph(
  timeInSeconds: number,
  courseLength = 100
): number {
  const YARDS_PER_MILE = 1760;
  const SECONDS_PER_HOUR = 3600;

  if (timeInSeconds <= 0) return 0;

  return (courseLength * SECONDS_PER_HOUR) / (timeInSeconds * YARDS_PER_MILE);
}

/**
 * Calculate Nationals points from scoring elements
 *
 * Formula: (Correct × 10) - (Incorrect × 5) - (Faults × 5) - (NoFinish × 5)
 *
 * @param correct - Number of correct alerts
 * @param incorrect - Number of incorrect alerts
 * @param faults - Number of faults
 * @param noFinish - Number of finish call errors
 * @returns Total points
 *
 * @example
 * ```typescript
 * calculateNationalsPoints(5, 1, 0, 0) // 45 points (50 - 5)
 * calculateNationalsPoints(3, 0, 1, 1) // 20 points (30 - 5 - 5)
 * ```
 */
export function calculateNationalsPoints(
  correct: number,
  incorrect: number,
  faults: number,
  noFinish: number
): number {
  return correct * 10 - incorrect * 5 - faults * 5 - noFinish * 5;
}
