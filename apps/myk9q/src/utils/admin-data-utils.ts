/**
 * Admin Data Formatting Utilities
 *
 * Extracted from CompetitionAdmin.tsx
 * Pure utility functions for formatting trial and class data in admin interfaces.
 *
 * Features:
 * - Trial date formatting with timezone handling
 * - Class details formatting
 * - Trial label generation
 * - Bulk class selection details
 */

/**
 * Trial data structure
 */
export interface Trial {
  trial_id: number;
  trial_number: number;
  trial_date: string;
}

/**
 * Class data structure
 */
export interface ClassInfo {
  id: number;
  element: string;
  level: string;
  section: string;
}

/**
 * Format trial date to readable format
 *
 * Converts ISO date string (YYYY-MM-DD) to readable format (Day, Mon DD, YYYY).
 * Handles timezone issues by parsing date components manually.
 *
 * @param dateString - ISO date string (YYYY-MM-DD)
 * @returns Formatted date string (e.g., "Sun, Jan 19, 2025")
 *
 * @example
 * ```ts
 * formatTrialDate('2025-01-19');
 * // Returns: "Sun, Jan 19, 2025"
 *
 * formatTrialDate('2024-12-25');
 * // Returns: "Wed, Dec 25, 2024"
 *
 * formatTrialDate('invalid');
 * // Returns: "invalid" (fallback to original)
 * ```
 */
export function formatTrialDate(dateString: string): string {
  try {
    // Validate input format
    if (!dateString || !dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateString;
    }

    // Parse date components manually to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);

    // Validate date ranges
    if (
      isNaN(year) ||
      isNaN(month) ||
      isNaN(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      return dateString;
    }

    const date = new Date(year, month - 1, day); // month is 0-indexed

    // Verify the date is valid (catches things like Feb 30)
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return dateString;
    }

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    const dayName = days[date.getDay()];
    const monthName = months[date.getMonth()];
    const dayNumber = date.getDate();
    const yearNumber = date.getFullYear();

    return `${dayName}, ${monthName} ${dayNumber}, ${yearNumber}`;
  } catch {
    return dateString; // Fallback to original if parsing fails
  }
}

/**
 * Format class details for display
 *
 * Combines element, level, and section into a readable format.
 *
 * @param classInfo - Class information object
 * @returns Formatted class details (e.g., "Container (Novice A • Regular)")
 *
 * @example
 * ```ts
 * formatClassDetails({
 *   id: 1,
 *   element: 'Container',
 *   level: 'Novice A',
 *   section: 'Regular'
 * });
 * // Returns: "Container (Novice A • Regular)"
 *
 * formatClassDetails({
 *   id: 2,
 *   element: 'Interior',
 *   level: 'Master',
 *   section: '20 inch'
 * });
 * // Returns: "Interior (Master • 20 inch)"
 * ```
 */
export function formatClassDetails(classInfo: ClassInfo): string {
  return `${classInfo.element} (${classInfo.level} • ${classInfo.section})`;
}

/**
 * Format trial label with date and number
 *
 * Generates a display label for a trial combining date and number.
 *
 * @param trial - Trial information object
 * @param format - Label format: 'date-first' or 'number-first'
 * @returns Formatted trial label
 *
 * @example
 * ```ts
 * formatTrialLabel(
 *   { trial_id: 1, trial_number: 1, trial_date: '2025-01-19' },
 *   'date-first'
 * );
 * // Returns: "Sun, Jan 19, 2025 • Trial 1"
 *
 * formatTrialLabel(
 *   { trial_id: 1, trial_number: 1, trial_date: '2025-01-19' },
 *   'number-first'
 * );
 * // Returns: "Trial 1 - Sun, Jan 19, 2025"
 * ```
 */
export function formatTrialLabel(
  trial: Trial,
  format: 'date-first' | 'number-first' = 'date-first'
): string {
  const formattedDate = formatTrialDate(trial.trial_date);

  if (format === 'number-first') {
    return `Trial ${trial.trial_number} - ${formattedDate}`;
  } else {
    return `${formattedDate} • Trial ${trial.trial_number}`;
  }
}

/**
 * Format trial label by ID
 *
 * Finds trial by ID and generates a display label.
 * Falls back to "Trial {id}" if trial not found.
 *
 * @param trialId - Trial ID to find
 * @param trials - Array of trials to search
 * @param format - Label format: 'date-first' or 'number-first'
 * @returns Formatted trial label or fallback
 *
 * @example
 * ```ts
 * const trials = [
 *   { trial_id: 1, trial_number: 1, trial_date: '2025-01-19' }
 * ];
 *
 * formatTrialLabelById(1, trials, 'date-first');
 * // Returns: "Sun, Jan 19, 2025 • Trial 1"
 *
 * formatTrialLabelById(999, trials, 'date-first');
 * // Returns: "Trial 999" (fallback)
 * ```
 */
export function formatTrialLabelById(
  trialId: number,
  trials: Trial[],
  format: 'date-first' | 'number-first' = 'date-first'
): string {
  const trial = trials.find((t) => t.trial_id === trialId);
  return trial ? formatTrialLabel(trial, format) : `Trial ${trialId}`;
}

/**
 * Get selected class details for bulk operations
 *
 * Filters classes by selected IDs and formats their details.
 *
 * @param classes - All available classes
 * @param selectedClassIds - Set of selected class IDs
 * @returns Array of formatted class details
 *
 * @example
 * ```ts
 * const classes = [
 *   { id: 1, element: 'Container', level: 'Novice A', section: 'Regular' },
 *   { id: 2, element: 'Interior', level: 'Master', section: '20 inch' },
 *   { id: 3, element: 'Buried', level: 'Advanced', section: 'Preferred' }
 * ];
 *
 * getSelectedClassDetails(classes, new Set([1, 3]));
 * // Returns: [
 * //   "Container (Novice A • Regular)",
 * //   "Buried (Advanced • Preferred)"
 * // ]
 * ```
 */
export function getSelectedClassDetails(
  classes: ClassInfo[],
  selectedClassIds: Set<number>
): string[] {
  return classes
    .filter((cls) => selectedClassIds.has(cls.id))
    .map((cls) => formatClassDetails(cls));
}

/**
 * Group classes by trial
 *
 * Organizes classes into groups by trial ID.
 *
 * @param classes - Array of classes with trial information
 * @returns Map of trial ID to classes
 *
 * @example
 * ```ts
 * const classes = [
 *   { id: 1, trial_id: 1, element: 'Container', level: 'Novice A', section: 'Regular' },
 *   { id: 2, trial_id: 1, element: 'Interior', level: 'Master', section: '20 inch' },
 *   { id: 3, trial_id: 2, element: 'Buried', level: 'Advanced', section: 'Preferred' }
 * ];
 *
 * groupClassesByTrial(classes);
 * // Returns: Map {
 * //   1 => [
 * //     { id: 1, trial_id: 1, element: 'Container', ... },
 * //     { id: 2, trial_id: 1, element: 'Interior', ... }
 * //   ],
 * //   2 => [
 * //     { id: 3, trial_id: 2, element: 'Buried', ... }
 * //   ]
 * // }
 * ```
 */
export function groupClassesByTrial<T extends { trial_id: number }>(
  classes: T[]
): Map<number, T[]> {
  const groups = new Map<number, T[]>();

  for (const cls of classes) {
    const trialClasses = groups.get(cls.trial_id) || [];
    trialClasses.push(cls);
    groups.set(cls.trial_id, trialClasses);
  }

  return groups;
}
