/**
 * Canonical class status constants
 *
 * These constants define the authoritative status values for classes
 * across the entire myK9 platform. All components should use these
 * values to ensure consistency.
 */

/**
 * Class status values - use these for data storage and logic
 *
 * Note: 'Upcoming' is an accepted alias for 'Scheduled' for backward compatibility.
 * New code should prefer 'Scheduled' but both are valid.
 */
export const CLASS_STATUS = {
  /** Class is set up but not yet running (canonical value) */
  SCHEDULED: 'Scheduled',
  /** Class is set up but not yet running (legacy alias - prefer SCHEDULED) */
  UPCOMING: 'Upcoming',
  /** Class is currently being judged */
  IN_PROGRESS: 'In Progress',
  /** Class judging is complete */
  COMPLETED: 'Completed',
  /** Class was cancelled */
  CANCELLED: 'Cancelled',
} as const;

/**
 * Type representing valid class status values
 * Includes both 'Scheduled' and 'Upcoming' for compatibility
 */
export type ClassStatusValue = (typeof CLASS_STATUS)[keyof typeof CLASS_STATUS];

/**
 * Legacy status mapping - maps old status values to canonical values
 * Use this when migrating data or handling external inputs
 */
export const LEGACY_STATUS_MAP: Record<string, ClassStatusValue> = {
  // Variations of Scheduled/Upcoming (both are valid)
  Scheduled: CLASS_STATUS.SCHEDULED,
  scheduled: CLASS_STATUS.SCHEDULED,
  Upcoming: CLASS_STATUS.UPCOMING,
  upcoming: CLASS_STATUS.UPCOMING,
  Pending: CLASS_STATUS.SCHEDULED,
  pending: CLASS_STATUS.SCHEDULED,
  Planned: CLASS_STATUS.UPCOMING,
  planned: CLASS_STATUS.UPCOMING,
  Published: CLASS_STATUS.UPCOMING,
  published: CLASS_STATUS.UPCOMING,
  check_in: CLASS_STATUS.IN_PROGRESS,
  scoring: CLASS_STATUS.IN_PROGRESS,
  draft: CLASS_STATUS.SCHEDULED,
  accepting_entries: CLASS_STATUS.UPCOMING,
  closed: CLASS_STATUS.UPCOMING,
  unpublished: CLASS_STATUS.SCHEDULED,
  setup: CLASS_STATUS.SCHEDULED,

  // Variations of In Progress
  'In Progress': CLASS_STATUS.IN_PROGRESS,
  'in progress': CLASS_STATUS.IN_PROGRESS,
  // classes_status_check (migration 138) stores this spelling
  in_progress: CLASS_STATUS.IN_PROGRESS,
  InProgress: CLASS_STATUS.IN_PROGRESS,
  inProgress: CLASS_STATUS.IN_PROGRESS,

  // Variations of Completed
  Completed: CLASS_STATUS.COMPLETED,
  completed: CLASS_STATUS.COMPLETED,
  Complete: CLASS_STATUS.COMPLETED,
  complete: CLASS_STATUS.COMPLETED,

  // Variations of Cancelled
  Cancelled: CLASS_STATUS.CANCELLED,
  cancelled: CLASS_STATUS.CANCELLED,
  Canceled: CLASS_STATUS.CANCELLED,
  canceled: CLASS_STATUS.CANCELLED,
};

/**
 * Normalize a status value to canonical form
 * @param status - Input status string
 * @returns Canonical status value
 */
export function normalizeClassStatus(status: string): ClassStatusValue {
  return LEGACY_STATUS_MAP[status] ?? CLASS_STATUS.SCHEDULED;
}
