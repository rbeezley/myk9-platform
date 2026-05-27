/**
 * Class status detection + display utilities.
 *
 * Class-related half of what was `apps/myk9q/src/utils/statusUtils.ts`.
 * The entry-related half (getEntryStatusColor, getEntryStatusLabel,
 * getCheckInStatusIcon, determineEntryStatus, DogEntry, EntryCheckInStatus,
 * EntryResultStatus) stays in apps/myk9q for PR E2 to handle alongside
 * the EntryList move.
 *
 * The split's worth tracking: apps/myk9q's `utils/statusUtils.ts`
 * remains the canonical import path for existing consumers (it
 * re-exports the moved symbols from `@myk9/ringside`), so 11 external
 * consumers see no behavior change.
 *
 * Type naming
 * -----------
 * The local `ClassEntry` interface from the original file is renamed
 * here to `ClassStatusInput` to avoid colliding with the broader
 * `ClassEntry` shape in `pages/ClassList/types.ts` (which is the
 * fetched-row shape, ~25 fields). `ClassStatusInput` is the minimal
 * 9-field shape these status functions actually need — page callers
 * pass their richer `ClassEntry`, structural typing accepts it.
 *
 * `apps/myk9q/src/utils/statusUtils.ts` re-exports `ClassStatusInput`
 * as `ClassEntry` for backwards compat with `classFilterUtils.ts`
 * which imports `ClassEntry as BaseClassEntry`.
 */

export type ClassStatus =
  | 'setup'
  | 'briefing'
  | 'break'
  | 'start_time'
  | 'in_progress'
  | 'offline-scoring'
  | 'completed'
  | 'no-status';

/**
 * Minimal dog/entry shape the class-status detectors need.
 */
export interface ClassDog {
  in_ring?: boolean;
  is_scored?: boolean;
  checkin_status?: number;
  armband_number?: string;
  call_name?: string;
}

/**
 * Minimal class-row shape the status detectors need. Named distinctly
 * from `pages/ClassList/types.ts`'s `ClassEntry` (the full fetched
 * row) to keep the two concepts unambiguous in the package.
 *
 * Callers passing the richer page `ClassEntry` work via structural
 * typing — the wider object satisfies this narrower contract.
 */
export interface ClassStatusInput {
  id: number;
  class_status: ClassStatus;
  is_scoring_finalized?: boolean;
  entry_count: number;
  completed_count: number;
  dogs: ClassDog[];
  briefing_time?: string | null;
  break_until?: string | null;
  start_time?: string | null;
}

/**
 * Detects a class's display status by combining the persisted
 * `class_status` field with completion + in-ring activity.
 *
 * Priority order (deliberate):
 *   1. `is_scoring_finalized === true` → 'completed'
 *   2. Manual `class_status === 'completed' | 'in_progress'`
 *   3. Auto-detection only when class_status is 'no-status'
 *      (manual statuses like setup/briefing/break/start_time are
 *      respected and never overridden by activity)
 */
export function getClassDisplayStatus(
  classEntry: ClassStatusInput
): 'not-started' | 'in-progress' | 'completed' {
  // PRIORITY 1: Check is_scoring_finalized field (set automatically when all entries scored)
  if (classEntry.is_scoring_finalized === true) {
    return 'completed';
  }

  // PRIORITY 2: Manual class_status always wins (for run order only usage)
  if (classEntry.class_status === 'completed') {
    return 'completed';
  }
  if (classEntry.class_status === 'in_progress') {
    return 'in-progress';
  }

  // PRIORITY 3: Only use automatic detection if class_status is 'no-status'
  // Manual statuses like setup, briefing, break, start_time should always be respected
  if (classEntry.class_status === 'no-status') {
    // A class is completed when all dogs are scored
    const isCompleted =
      classEntry.completed_count === classEntry.entry_count && classEntry.entry_count > 0;
    if (isCompleted) {
      return 'completed';
    }
    // A class is in progress if it has dogs in the ring or some scored
    if (classEntry.dogs.some(dog => dog.in_ring) || classEntry.completed_count > 0) {
      return 'in-progress';
    }
  }

  return 'not-started';
}

/**
 * Returns the CSS class-name token for class status coloring.
 */
export function getClassStatusColor(
  status: ClassStatus,
  classEntry?: ClassStatusInput
): string {
  // PRIORITY 1: Offline scoring status should always use its own color
  // This must be checked BEFORE smart detection to prevent override
  if (status === 'offline-scoring') {
    return 'offline-scoring';
  }

  // Check smart display status first if classEntry provided
  if (classEntry) {
    const displayStatus = getClassDisplayStatus(classEntry);
    if (displayStatus === 'completed') return 'completed';
    if (displayStatus === 'in-progress') return 'in-progress';
  }

  switch (status) {
    case 'no-status':
      return 'no-status';
    case 'setup':
      return 'setup';
    case 'briefing':
      return 'briefing';
    case 'break':
      return 'break';
    case 'start_time':
      return 'start-time';
    case 'in_progress':
      return 'in-progress';
    case 'completed':
      return 'completed';
    default:
      // Note: offline-scoring is handled at the top of the function before smart detection
      // Intelligent color based on actual class progress
      if (classEntry) {
        const isCompleted =
          classEntry.completed_count === classEntry.entry_count && classEntry.entry_count > 0;
        const hasDogsInRing = classEntry.dogs && classEntry.dogs.some(dog => dog.in_ring);

        if (isCompleted) return 'completed';
        if (hasDogsInRing) return 'in-progress';
        if (classEntry.completed_count > 0) return 'in-progress';
        return 'no-status';
      }
      return 'no-status';
  }
}

export interface FormattedStatus {
  label: string;
  time: string | null;
}

/**
 * Returns the user-facing label + optional time string for a class's
 * current status.
 */
export function getFormattedClassStatus(classEntry: ClassStatusInput): FormattedStatus {
  // PRIORITY 1: Offline scoring status should always show as-is (user explicitly set it)
  // This must be checked BEFORE smart detection to prevent override
  if (classEntry.class_status === 'offline-scoring') {
    return { label: 'Offline Scoring', time: null };
  }

  // Check smart display status first
  const displayStatus = getClassDisplayStatus(classEntry);

  if (displayStatus === 'completed') {
    return { label: 'Completed', time: null };
  }

  // If detected as in-progress via scoring activity (dogs scored or in ring), show In Progress
  if (displayStatus === 'in-progress') {
    return { label: 'In Progress', time: null };
  }

  const status = classEntry.class_status;

  switch (status) {
    case 'briefing':
      return {
        label: 'Briefing at',
        time: classEntry.briefing_time || null,
      };
    case 'break':
      return {
        label: 'Break until',
        time: classEntry.break_until || null,
      };
    case 'start_time':
      return {
        label: 'Start at',
        time: classEntry.start_time || null,
      };
    case 'setup':
      return { label: 'Setup', time: null };
    case 'in_progress':
      return { label: 'In Progress', time: null };
    case 'completed':
      return { label: 'Completed', time: null };
    default:
      // Note: offline-scoring is handled at the top of the function before smart detection
      return { label: 'No Status', time: null };
  }
}
