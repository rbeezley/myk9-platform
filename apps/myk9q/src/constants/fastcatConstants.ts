/**
 * AKC FastCAT Scoring Constants
 *
 * FastCAT (Fast Coursing Ability Test) is a timed 100-yard dash.
 * Dogs earn points based on their speed (MPH).
 *
 * Note: The current implementation uses a simplified points formula.
 * The actual AKC formula may vary based on dog height category.
 *
 * Reference: AKC FastCAT Rules
 */

/**
 * Course and calculation constants
 */
export const FASTCAT_COURSE = {
  /** Standard FastCAT course length in yards */
  LENGTH_YARDS: 100,

  /** Conversion: yards per mile (for MPH calculation) */
  YARDS_PER_MILE: 1760,

  /** Conversion: seconds per hour (for MPH calculation) */
  SECONDS_PER_HOUR: 3600,

  /**
   * Points multiplier (simplified formula)
   * Actual AKC formula may vary by height category:
   * - 18" and over: handicap multiplier 1.0
   * - 12" to under 18": handicap multiplier 1.5
   * - Under 12": handicap multiplier 2.0
   *
   * TODO: Implement full AKC height-based formula if needed
   */
  POINTS_MULTIPLIER: 2,
} as const;

/**
 * MPH calculation formula:
 * MPH = (COURSE_LENGTH * SECONDS_PER_HOUR) / (timeInSeconds * YARDS_PER_MILE)
 *
 * Points formula (simplified):
 * Points = Math.round(MPH * POINTS_MULTIPLIER)
 */

export type FastCatConstants = typeof FASTCAT_COURSE;
