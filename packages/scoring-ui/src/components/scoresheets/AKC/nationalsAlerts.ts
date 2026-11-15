import { NATIONALS_SCORING } from '@myk9/core';

/**
 * Every Nationals class opens with this many areas. It is the Nationals format, not
 * the class rule (sport_class_rules only carries 1 to 3, and the Nationals rules
 * change year to year). A change of format is this one constant.
 */
export const NATIONALS_AREA_COUNT = 5;

/**
 * One area's time limit in seconds: the class time split across its areas. The one
 * number the timer stops at, "Use max time" fills and a Qualified is checked
 * against (MYK9-2019). 0 means the class has no limit. Never `areaMaxTimeSeconds`:
 * the rules builder fills that with the whole class time for every area.
 */
export function nationalsAreaLimitSeconds(maxTimeSeconds: number, areaCount: number): number {
  return maxTimeSeconds > 0 ? Math.floor(maxTimeSeconds / Math.max(1, areaCount)) : 0;
}

/**
 * Nationals points (MYK9-1835): +10 per correct alert, -5 per incorrect alert and
 * -5 per finish call error, from NATIONALS_SCORING. A run never scores below 0.
 */
export function calculatePoints(
  correctAlerts: number[],
  incorrectAlerts: number[],
  finishCallErrors = 0
): number {
  const { CORRECT_ALERT_POINTS, INCORRECT_ALERT_PENALTY, FINISH_CALL_ERROR_PENALTY } =
    NATIONALS_SCORING;
  const pts =
    sum(correctAlerts) * CORRECT_ALERT_POINTS -
    sum(incorrectAlerts) * INCORRECT_ALERT_PENALTY -
    finishCallErrors * FINISH_CALL_ERROR_PENALTY;
  return Math.max(0, pts);
}

/** Saved totals go in Area 1 (only totals are stored); the rest start at zero. */
export function seedAlerts(areaCount: number, total = 0): number[] {
  return Array.from({ length: areaCount }, (_, i) => (i === 0 ? total : 0));
}

export const sum = (counts: number[]): number => counts.reduce((total, n) => total + n, 0);
