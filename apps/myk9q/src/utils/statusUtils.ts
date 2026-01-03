/**
 * Status Utilities
 *
 * Centralized status color and label logic for classes and entries.
 * Provides consistent status display across the application.
 */

// Entry status type is imported from entryStore (single source of truth)
import type { EntryStatus } from '../stores/entryStore';
export type { EntryStatus } from '../stores/entryStore';

// Type definitions
export type ClassStatus = 'setup' | 'briefing' | 'break' | 'start_time' | 'in_progress' | 'offline-scoring' | 'completed' | 'no-status';
export type EntryCheckInStatus = 'checked-in' | 'conflict' | 'pulled' | 'at-gate' | 'come-to-gate' | 'pending';
export type EntryResultStatus = 'qualified' | 'not-qualified' | 'excused' | 'pending';

/**
 * Represents a dog/entry in a class with minimal required fields
 */
export interface ClassDog {
  in_ring?: boolean;
  is_scored?: boolean;
  checkin_status?: number;
  armband_number?: string;
  call_name?: string;
}

/**
 * Represents a class entry with all relevant fields for status detection
 */
export interface ClassEntry {
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
 * Represents an individual dog entry for status display (DogDetails view)
 */
export interface DogEntry {
  check_in_status?: string;
  is_scored?: boolean;
  result_text?: string | null;
}

/**
 * Gets display status for a class (used for smart status detection)
 * Priority: is_scoring_finalized > manual class_status > automatic detection
 */
export function getClassDisplayStatus(classEntry: ClassEntry): 'not-started' | 'in-progress' | 'completed' {
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
    const isCompleted = classEntry.completed_count === classEntry.entry_count && classEntry.entry_count > 0;
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
 * Gets the CSS class name for class status coloring
 */
export function getClassStatusColor(
  status: ClassStatus,
  classEntry?: ClassEntry
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
    case 'no-status': return 'no-status';
    case 'setup': return 'setup';
    case 'briefing': return 'briefing';
    case 'break': return 'break';
    case 'start_time': return 'start-time';
    case 'in_progress': return 'in-progress';
    case 'completed': return 'completed';
    default:
      // Note: offline-scoring is handled at the top of the function before smart detection
      // Intelligent color based on actual class progress
      if (classEntry) {
        const isCompleted = classEntry.completed_count === classEntry.entry_count && classEntry.entry_count > 0;
        const hasDogsInRing = classEntry.dogs && classEntry.dogs.some(dog => dog.in_ring);

        if (isCompleted) return 'completed';
        if (hasDogsInRing) return 'in-progress';
        if (classEntry.completed_count > 0) return 'in-progress';
        return 'no-status';
      }
      return 'no-status';
  }
}

/**
 * Gets formatted status label and time for a class
 */
export interface FormattedStatus {
  label: string;
  time: string | null;
}

export function getFormattedClassStatus(classEntry: ClassEntry): FormattedStatus {
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

  const status = classEntry.class_status;

  switch (status) {
    case 'briefing':
      return {
        label: 'Briefing at',
        time: classEntry.briefing_time || null
      };
    case 'break':
      return {
        label: 'Break until',
        time: classEntry.break_until || null
      };
    case 'start_time':
      return {
        label: 'Start at',
        time: classEntry.start_time || null
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

/**
 * Gets the CSS class name for entry status coloring (DogDetails view)
 */
export function getEntryStatusColor(entry: DogEntry): string {
  // Check-in status takes priority
  if (entry.check_in_status === 'checked-in') return 'checked-in';
  if (entry.check_in_status === 'conflict') return 'conflict';
  if (entry.check_in_status === 'pulled') return 'pulled';
  if (entry.check_in_status === 'at-gate') return 'at-gate';
  if (entry.check_in_status === 'come-to-gate') return 'come-to-gate';

  // Result status for scored entries
  if (entry.is_scored) {
    const resultLower = entry.result_text?.toLowerCase();
    if (resultLower === 'q' || resultLower === 'qualified') {
      return 'qualified';
    } else if (resultLower === 'nq' || resultLower === 'not qualified') {
      return 'not-qualified';
    } else if (resultLower === 'ex' || resultLower === 'excused') {
      return 'excused';
    } else if (resultLower === 'abs' || resultLower === 'absent' || resultLower === 'e') {
      return 'absent';
    } else if (resultLower === 'wd' || resultLower === 'withdrawn') {
      return 'withdrawn';
    }
  }

  // Return 'no-status' for consistency with CSS classes
  return 'no-status';
}

/**
 * Gets the display label for entry status (DogDetails view)
 */
export function getEntryStatusLabel(entry: DogEntry): string {
  // Check-in status takes priority
  if (entry.check_in_status === 'checked-in') return 'Checked-in';
  if (entry.check_in_status === 'conflict') return 'Conflict';
  if (entry.check_in_status === 'pulled') return 'Pulled';
  if (entry.check_in_status === 'at-gate') return 'At Gate';
  if (entry.check_in_status === 'come-to-gate') return 'Come to Gate';

  // Result status for scored entries
  if (entry.is_scored && entry.result_text) {
    const resultLower = entry.result_text.toLowerCase();
    switch (resultLower) {
      case 'q':
      case 'qualified':
        return 'Qualified';
      case 'nq':
      case 'not qualified':
        return 'Not Qualified';
      case 'ex':
      case 'excused':
        return 'Excused';
      default:
        // Capitalize first letter of any other status
        return entry.result_text.charAt(0).toUpperCase() + entry.result_text.slice(1);
    }
  }

  return 'No Status';
}

/**
 * Gets the icon name for a check-in status
 * Returns Lucide React icon names to match dialog
 */
export function getCheckInStatusIcon(checkInStatus?: string): 'Circle' | 'Check' | 'AlertTriangle' | 'XCircle' | 'Star' | 'Bell' {
  switch (checkInStatus) {
    case 'checked-in':
      return 'Check';
    case 'conflict':
      return 'AlertTriangle';
    case 'pulled':
      return 'XCircle';
    case 'at-gate':
      return 'Star';
    case 'come-to-gate':
      return 'Bell';
    default:
      return 'Circle';
  }
}

/**
 * Determine entry status from database row data
 * Handles both simple entry_status field and complex logic with is_in_ring fallback
 *
 * @param entryStatus - Entry status from database (entry_status field)
 * @param isInRing - Whether the entry is currently in the ring (optional)
 * @returns Resolved entry status
 *
 * @example
 * // Simple status determination
 * determineEntryStatus('checked-in') // 'checked-in'
 *
 * @example
 * // With fallback to in-ring
 * determineEntryStatus(undefined, true) // 'in-ring'
 * determineEntryStatus(undefined, false) // 'no-status'
 */
export function determineEntryStatus(
  entryStatus?: string | null,
  isInRing?: boolean
): EntryStatus {
  // If entry_status exists, use it directly
  if (entryStatus) {
    return entryStatus as EntryStatus;
  }

  // Fallback: check if entry is in ring
  if (isInRing) {
    return 'in-ring';
  }

  // Default fallback
  return 'no-status';
}
