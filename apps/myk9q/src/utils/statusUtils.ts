/**
 * Status Utilities
 *
 * Entry-related status color/label logic + a small re-export bridge to
 * the class-related half, which moved into `@myk9/ringside` during
 * PR E1a. External consumers (`classFilterUtils.ts`, services, dialogs,
 * other pages, tests) keep their existing import paths and see no
 * behavior change — the re-exports below preserve the canonical
 * surface.
 *
 * The entry-related half stays here pending PR E2 (EntryList move).
 */

// Entry status type — canonical definition in @myk9/core
import type { EntryStatus } from '@myk9/core';
export type { EntryStatus } from '@myk9/core';

// ── Class-related re-exports from @myk9/ringside ─────────────────────────
//
// `ClassEntry` is re-exported under its original local name (mapped from
// ringside's `ClassStatusInput`) so `classFilterUtils.ts`'s
// `import type { ClassEntry as BaseClassEntry } from './statusUtils'`
// keeps working unchanged.
export type {
  ClassStatus,
  ClassDog,
  FormattedStatus,
  ClassStatusInput as ClassEntry,
} from '@myk9/ringside';
export {
  getClassDisplayStatus,
  getClassStatusColor,
  getFormattedClassStatus,
} from '@myk9/ringside';

// ── Entry-related (still in apps/myk9q for PR E2 to handle) ──────────────

export type EntryCheckInStatus =
  | 'checked-in'
  | 'conflict'
  | 'pulled'
  | 'at-gate'
  | 'come-to-gate'
  | 'pending';
export type EntryResultStatus = 'qualified' | 'not-qualified' | 'excused' | 'pending';

const PULLED_ENTRY_STATUSES = new Set(['pulled', 'scratch', 'scratched', 'withdrawn', 'absent']);

/**
 * Represents an individual dog entry for status display (DogDetails view)
 */
export interface DogEntry {
  check_in_status?: string;
  is_scored?: boolean;
  result_text?: string | null;
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
export function getCheckInStatusIcon(
  checkInStatus?: string
): 'Circle' | 'Check' | 'AlertTriangle' | 'XCircle' | 'Star' | 'Bell' {
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
export function determineEntryStatus(entryStatus?: string | null, isInRing?: boolean): EntryStatus {
  // If entry_status exists, use it directly
  if (entryStatus) {
    if (PULLED_ENTRY_STATUSES.has(entryStatus.toLowerCase())) return 'pulled';
    return entryStatus as EntryStatus;
  }

  // Fallback: check if entry is in ring
  if (isInRing) {
    return 'in-ring';
  }

  // Default fallback
  return 'no-status';
}
