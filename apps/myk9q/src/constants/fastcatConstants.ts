/**
 * AKC FastCAT Scoring Constants
 *
 * FastCAT (Fast Coursing Ability Test) is a timed 100-yard dash.
 * Dogs earn points based on their speed (MPH) and a height-based handicap.
 *
 * AKC Official Formula:
 *   MPH = (100 yards * 3600) / (time_seconds * 1760)
 *   Points = MPH * handicap_multiplier
 *
 * Handicap multipliers by height at withers:
 *   - 18" and over: 1.0
 *   - 12" to under 18": 1.5
 *   - Under 12": 2.0
 *
 * Reference: AKC FastCAT Rules & Regulations
 */

/** Height category for AKC FastCAT handicap calculation */
export type FastCatHeightCategory = 'tall' | 'medium' | 'small';

/**
 * AKC height-based handicap multipliers
 * Dogs are measured at the withers and placed into one of three categories.
 */
export const FASTCAT_HANDICAP: Record<FastCatHeightCategory, { minHeight: number; maxHeight: number | null; multiplier: number; label: string }> = {
  tall:   { minHeight: 18, maxHeight: null, multiplier: 1.0, label: '18" and over' },
  medium: { minHeight: 12, maxHeight: 18,   multiplier: 1.5, label: '12" to under 18"' },
  small:  { minHeight: 0,  maxHeight: 12,   multiplier: 2.0, label: 'Under 12"' },
};

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
} as const;

/**
 * Get the handicap multiplier for a given height (in inches at withers).
 * Falls back to 1.0 (tall category) if height is not provided.
 */
export function getHandicapMultiplier(heightInches?: number | null): number {
  if (heightInches == null) return 1.0;
  if (heightInches < 12) return FASTCAT_HANDICAP.small.multiplier;
  if (heightInches < 18) return FASTCAT_HANDICAP.medium.multiplier;
  return FASTCAT_HANDICAP.tall.multiplier;
}

/**
 * Determine the height category for a given height.
 */
export function getHeightCategory(heightInches: number): FastCatHeightCategory {
  if (heightInches < 12) return 'small';
  if (heightInches < 18) return 'medium';
  return 'tall';
}

/**
 * Calculate FastCAT MPH from run time.
 * MPH = (100 * 3600) / (timeInSeconds * 1760)
 */
export function calculateFastCatMph(timeInSeconds: number): number {
  if (timeInSeconds <= 0) return 0;
  return (FASTCAT_COURSE.LENGTH_YARDS * FASTCAT_COURSE.SECONDS_PER_HOUR) /
    (timeInSeconds * FASTCAT_COURSE.YARDS_PER_MILE);
}

/**
 * Calculate FastCAT points with height-based handicap.
 * Points = round(MPH * handicap_multiplier)
 */
export function calculateFastCatPoints(timeInSeconds: number, heightInches?: number | null): number {
  const mph = calculateFastCatMph(timeInSeconds);
  const multiplier = getHandicapMultiplier(heightInches);
  return Math.round(mph * multiplier);
}

export type FastCatConstants = typeof FASTCAT_COURSE;
