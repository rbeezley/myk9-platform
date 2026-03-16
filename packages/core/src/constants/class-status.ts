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
 * Display configuration for each status
 * - label: User-facing display text
 * - color: Tailwind color class name (without the full class)
 * - bgClass: Full Tailwind background class
 * - textClass: Full Tailwind text class
 */
export const CLASS_STATUS_DISPLAY = {
  [CLASS_STATUS.SCHEDULED]: {
    label: 'Upcoming',
    color: 'blue',
    bgClass: 'bg-blue-100',
    textClass: 'text-blue-800',
    darkBgClass: 'dark:bg-blue-900/30',
    darkTextClass: 'dark:text-blue-300',
  },
  [CLASS_STATUS.UPCOMING]: {
    label: 'Upcoming',
    color: 'blue',
    bgClass: 'bg-blue-100',
    textClass: 'text-blue-800',
    darkBgClass: 'dark:bg-blue-900/30',
    darkTextClass: 'dark:text-blue-300',
  },
  [CLASS_STATUS.IN_PROGRESS]: {
    label: 'In Progress',
    color: 'amber',
    bgClass: 'bg-amber-100',
    textClass: 'text-amber-800',
    darkBgClass: 'dark:bg-amber-900/30',
    darkTextClass: 'dark:text-amber-300',
  },
  [CLASS_STATUS.COMPLETED]: {
    label: 'Complete',
    color: 'green',
    bgClass: 'bg-green-100',
    textClass: 'text-green-800',
    darkBgClass: 'dark:bg-green-900/30',
    darkTextClass: 'dark:text-green-300',
  },
  [CLASS_STATUS.CANCELLED]: {
    label: 'Cancelled',
    color: 'gray',
    bgClass: 'bg-gray-100',
    textClass: 'text-gray-800',
    darkBgClass: 'dark:bg-gray-700/30',
    darkTextClass: 'dark:text-gray-400',
  },
} as const;

/**
 * Order of status progression (for status cycling)
 */
export const CLASS_STATUS_ORDER: ClassStatusValue[] = [
  CLASS_STATUS.SCHEDULED,
  CLASS_STATUS.IN_PROGRESS,
  CLASS_STATUS.COMPLETED,
];

/**
 * Get the next status in the progression
 * @param currentStatus - The current class status
 * @returns The next status, or the first status if at the end
 */
export function getNextClassStatus(currentStatus: ClassStatusValue): ClassStatusValue {
  const currentIndex = CLASS_STATUS_ORDER.indexOf(currentStatus);
  if (currentIndex === -1) {
    return CLASS_STATUS.SCHEDULED;
  }
  const nextIndex = (currentIndex + 1) % CLASS_STATUS_ORDER.length;
  // nextIndex is always valid due to modulo, but TypeScript can't infer this
  return CLASS_STATUS_ORDER[nextIndex] ?? CLASS_STATUS.SCHEDULED;
}

/**
 * Get display configuration for a status value
 * @param status - The class status value
 * @returns Display configuration or default values
 */
export function getClassStatusDisplay(status: string) {
  // Try direct lookup first, then normalize legacy/trial status values
  return (
    CLASS_STATUS_DISPLAY[status as ClassStatusValue] ??
    CLASS_STATUS_DISPLAY[normalizeClassStatus(status)] ?? {
      label: status,
      color: 'gray',
      bgClass: 'bg-gray-100',
      textClass: 'text-gray-800',
      darkBgClass: 'dark:bg-gray-700/30',
      darkTextClass: 'dark:text-gray-400',
    }
  );
}

/**
 * Get CSS classes for a status badge
 * @param status - The class status value
 * @returns Combined CSS class string for badge styling
 */
export function getClassStatusBadgeClasses(status: string): string {
  const display = getClassStatusDisplay(status);
  return `${display.bgClass} ${display.textClass} ${display.darkBgClass} ${display.darkTextClass}`;
}

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

  // Variations of In Progress
  'In Progress': CLASS_STATUS.IN_PROGRESS,
  'in progress': CLASS_STATUS.IN_PROGRESS,
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
