import { CLASS_STATUS } from '@myk9/core';

/** Threshold in minutes before data is considered stale */
const STALE_THRESHOLD_MINUTES = 10;

export interface StaleDataStatus {
  /** Whether the data is stale */
  isStale: boolean;
  /** Minutes since last result (null if no results) */
  minutesSinceLastResult: number | null;
  /** Whether to show the warning banner */
  shouldShowWarning: boolean;
}

/**
 * Calculate stale data status for a class.
 *
 * Stale data warning shows when:
 * 1. Class is actively in progress
 * 2. Has at least one result (lastResultAt exists)
 * 3. More than 10 minutes since last result
 *
 * @param classStatus - Current class status
 * @param lastResultAt - Timestamp of last result (ISO string or Date)
 * @returns StaleDataStatus object
 */
export function getStaleDataStatus(
  classStatus: string,
  lastResultAt?: string | Date | null
): StaleDataStatus {
  // Only show warning if class is actively in progress
  if (classStatus !== CLASS_STATUS.IN_PROGRESS) {
    return { isStale: false, minutesSinceLastResult: null, shouldShowWarning: false };
  }

  // Must have at least one result to establish baseline
  if (!lastResultAt) {
    return { isStale: false, minutesSinceLastResult: null, shouldShowWarning: false };
  }

  // Calculate time since last result
  const lastResultTime =
    typeof lastResultAt === 'string' ? new Date(lastResultAt) : lastResultAt;
  const now = new Date();
  const minutesSinceLastResult = Math.floor(
    (now.getTime() - lastResultTime.getTime()) / (1000 * 60)
  );

  const isStale = minutesSinceLastResult >= STALE_THRESHOLD_MINUTES;

  return {
    isStale,
    minutesSinceLastResult,
    shouldShowWarning: isStale,
  };
}

/**
 * Format stale time for display.
 *
 * @param minutes - Number of minutes
 * @returns Formatted string like "15 min ago" or "2 hr ago"
 */
export function formatStaleTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ago`;
}
