/**
 * Stale Data Detection Utilities
 *
 * Detects when run order data may be outdated due to a judge being offline.
 * This helps warn exhibitors that the "dogs ahead" count may not be accurate.
 */

/** Default threshold in minutes before data is considered stale */
const STALE_THRESHOLD_MINUTES = 10;

/**
 * Result of stale data detection
 */
export interface StaleDataStatus {
  /** Whether the data is considered stale */
  isStale: boolean;
  /** Number of minutes since last result was synced (null if no results) */
  minutesSinceLastResult: number | null;
  /** Whether to show a warning to users */
  shouldShowWarning: boolean;
}

/**
 * Class data needed for stale detection
 */
interface ClassForStaleCheck {
  class_status: string;
  last_result_at?: string | null;
}

/**
 * Determines if a class's run order data may be stale
 *
 * A class is considered to have stale data when:
 * 1. It's currently "in_progress" (automatically set when first dog is scored)
 * 2. It's NOT already marked as "offline-scoring" (they already know)
 * 3. The last result was synced more than STALE_THRESHOLD_MINUTES ago
 *
 * Note: We rely on class_status === 'in_progress' because it's automatically
 * set by classCompletionService when the first dog is scored. This is more
 * reliable than checking for in_ring/at-gate entries, which can have gaps
 * between dogs.
 *
 * @param classEntry - The class data to check
 * @returns StaleDataStatus indicating if data is stale and should show warning
 */
export function getStaleDataStatus(classEntry: ClassForStaleCheck): StaleDataStatus {
  const defaultResult: StaleDataStatus = {
    isStale: false,
    minutesSinceLastResult: null,
    shouldShowWarning: false,
  };

  // Only show warning if class is actively running
  // class_status is automatically set to 'in_progress' when first dog is scored
  if (classEntry.class_status !== 'in_progress') {
    return defaultResult;
  }

  // Must have at least one result to establish baseline for staleness
  if (!classEntry.last_result_at) {
    return defaultResult;
  }

  // Calculate time since last result
  const lastResultTime = new Date(classEntry.last_result_at);
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
 * Formats the stale warning message for display
 *
 * @param minutesSinceLastResult - Minutes since last result was synced
 * @returns Formatted string like "12 min ago" or "1 hour ago"
 */
export function formatStaleTime(minutesSinceLastResult: number): string {
  if (minutesSinceLastResult < 60) {
    return `${minutesSinceLastResult} min ago`;
  }

  const hours = Math.floor(minutesSinceLastResult / 60);
  if (hours === 1) {
    return '1 hour ago';
  }
  return `${hours} hours ago`;
}
