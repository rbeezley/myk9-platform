/**
 * Status Formatting Utilities for ClassList
 *
 * Pure utility functions for status formatting specific to ClassList display.
 * Complements the global statusUtils.ts with ClassList-specific formatting logic.
 */

import type { ClassEntry } from '../hooks/useClassListData';
import { getClassDisplayStatus } from '@/utils/statusUtils';

/**
 * Get contextual preview text for a class based on its current status
 *
 * Provides different preview formats based on class state:
 * - **Not started**: Shows entry count
 * - **Completed**: Shows total entries scored
 * - **In progress**: Shows current dog in ring, next dogs, and remaining count
 *
 * @param classEntry - The class entry to generate preview for
 * @returns Contextual preview string with status-specific information
 *
 * @example
 * ```typescript
 * // Not started class
 * getContextualPreview({ entry_count: 15, completed_count: 0, dogs: [], ... })
 * // Returns: "15 entries • Not yet started"
 *
 * // In progress class
 * getContextualPreview({
 *   entry_count: 15,
 *   completed_count: 8,
 *   dogs: [
 *     { armband: 101, call_name: 'Max', in_ring: true, is_scored: false },
 *     { armband: 102, call_name: 'Bella', in_ring: false, is_scored: false },
 *     { armband: 103, call_name: 'Luna', in_ring: false, is_scored: false }
 *   ],
 *   ...
 * })
 * // Returns: "In Ring: 101 (Max) • Next: 102, 103\n7 of 15 remaining"
 *
 * // Completed class
 * getContextualPreview({ entry_count: 15, completed_count: 15, ... })
 * // Returns: "Completed • 15 entries scored"
 * ```
 */
export function getContextualPreview(classEntry: ClassEntry): string {
  const status = getClassDisplayStatus(classEntry);

  switch (status) {
    case 'not-started':
      return `${classEntry.entry_count} ${classEntry.entry_count === 1 ? 'entry' : 'entries'} • Not yet started`;

    case 'completed':
      return `Completed • ${classEntry.entry_count} ${classEntry.entry_count === 1 ? 'entry' : 'entries'} scored`;

    case 'in-progress': {
      const inRingDog = classEntry.dogs.find(dog => dog.in_ring);
      const nextDogs = classEntry.dogs
        .filter(dog =>
          !dog.is_scored &&
          !dog.in_ring &&
          dog.checkin_status !== 3 // Exclude pulled dogs from "next up" preview
        )
        .slice(0, 3);

      let preview = '';
      if (inRingDog) {
        preview += `In Ring: ${inRingDog.armband} (${inRingDog.call_name})`;
      }

      if (nextDogs.length > 0) {
        const nextArmband = nextDogs.map(dog => dog.armband).join(', ');
        preview += inRingDog ? ` • Next: ${nextArmband}` : `Next: ${nextArmband}`;
      }

      const remaining = classEntry.entry_count - classEntry.completed_count;
      if (preview) {
        preview += `\n${remaining} of ${classEntry.entry_count} remaining`;
      } else {
        preview = `${remaining} of ${classEntry.entry_count} remaining`;
      }

      return preview;
    }
    default:
      return `${classEntry.completed_count} of ${classEntry.entry_count} entries scored`;
  }
}

/**
 * Get formatted status with separate label and time components
 *
 * Provides structured status information for display with clear separation
 * between the status label and associated time value.
 *
 * @param classEntry - The class entry to format status for
 * @returns Object with label and time properties
 *
 * @example
 * ```typescript
 * // Briefing status with time
 * getFormattedStatus({ class_status: 'briefing', briefing_time: '9:30 AM', ... })
 * // Returns: { label: 'Briefing', time: '9:30 AM' }
 *
 * // Break status with time
 * getFormattedStatus({ class_status: 'break', break_until: '10:15 AM', ... })
 * // Returns: { label: 'Break Until', time: '10:15 AM' }
 *
 * // In progress (no time)
 * getFormattedStatus({ class_status: 'in_progress', ... })
 * // Returns: { label: 'In Progress', time: null }
 *
 * // Completed via is_scoring_finalized flag
 * getFormattedStatus({ is_scoring_finalized: true, class_status: 'no-status', ... })
 * // Returns: { label: 'Completed', time: null }
 * ```
 */
export function getFormattedStatus(classEntry: ClassEntry): { label: string; time: string | null } {
  // PRIORITY 1: Offline scoring status should always show as-is (user explicitly set it)
  // This must be checked BEFORE smart detection to prevent override
  if (classEntry.class_status === 'offline-scoring') {
    return { label: 'Offline Scoring', time: null };
  }

  // Check is_scoring_finalized first, then fall back to class_status
  const displayStatus = getClassDisplayStatus(classEntry);

  // If detected as completed via is_scoring_finalized or entry counts, show Completed
  if (displayStatus === 'completed') {
    return { label: 'Completed', time: null };
  }

  const status = classEntry.class_status;

  switch (status) {
    case 'briefing':
      return {
        label: 'Briefing',
        time: classEntry.briefing_time ?? null
      };
    case 'break':
      return {
        label: 'Break Until',
        time: classEntry.break_until ?? null
      };
    case 'start_time':
      return {
        label: 'Start Time',
        time: classEntry.start_time ?? null
      };
    case 'setup':
      return { label: 'Setup', time: null };
    case 'in_progress':
      return { label: 'In Progress', time: null };
    case 'completed':
      return { label: 'Completed', time: null };
    case 'no-status':
      return { label: 'No Status', time: null };
    default:
      // Note: offline-scoring is handled at the top of the function before smart detection
      return { label: 'No Status', time: null };
  }
}

/**
 * Get CSS status color class name for a class
 *
 * Determines the appropriate color class based on display status and manual class_status.
 * Respects priority: is_scoring_finalized > manual class_status > automatic detection.
 *
 * @param status - The class_status from database
 * @param classEntry - Optional complete class entry for smart detection
 * @returns CSS class name for status coloring
 *
 * @example
 * ```typescript
 * // Manually completed
 * getStatusColor('completed')
 * // Returns: 'completed'
 *
 * // Auto-detected in progress (smart detection)
 * getStatusColor('no-status', {
 *   class_status: 'no-status',
 *   completed_count: 5,
 *   entry_count: 15,
 *   dogs: [{ in_ring: true, ... }]
 * })
 * // Returns: 'in-progress'
 *
 * // Setup status
 * getStatusColor('setup')
 * // Returns: 'setup'
 * ```
 */
export function getStatusColor(
  status: ClassEntry['class_status'],
  classEntry?: ClassEntry
): string {
  // PRIORITY 1: Offline scoring status should always use its own color
  // This must be checked BEFORE smart detection to prevent override
  if (status === 'offline-scoring') {
    return 'offline-scoring';
  }

  // Check is_scoring_finalized first for consistent coloring
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
        const hasDogsInRing = classEntry.dogs.some(dog => dog.in_ring);

        if (isCompleted) return 'completed';
        if (hasDogsInRing) return 'in-progress';
        if (classEntry.completed_count > 0) return 'in-progress';
        return 'no-status';
      }
      return 'no-status';
  }
}

/**
 * Get human-readable status label with optional time included
 *
 * Provides a complete status string including time values when applicable.
 * Used for displays that need a single formatted string.
 *
 * @param status - The class_status from database
 * @param classEntry - Optional class entry for time values and smart detection
 * @returns Complete formatted status string
 *
 * @example
 * ```typescript
 * // Briefing with time
 * getStatusLabel('briefing', { briefing_time: '9:30 AM', ... })
 * // Returns: "Briefing 9:30 AM"
 *
 * // Break with time
 * getStatusLabel('break', { break_until: '10:15 AM', ... })
 * // Returns: "Break Until 10:15 AM"
 *
 * // Start time
 * getStatusLabel('start_time', { start_time: '8:00 AM', ... })
 * // Returns: "Start 8:00 AM"
 *
 * // In progress (no time)
 * getStatusLabel('in_progress')
 * // Returns: "In Progress"
 *
 * // Auto-detected from progress
 * getStatusLabel('no-status', { completed_count: 5, entry_count: 15, dogs: [{ in_ring: true }] })
 * // Returns: "In Progress"
 * ```
 */
export function getStatusLabel(
  status: ClassEntry['class_status'],
  classEntry?: ClassEntry
): string {
  switch (status) {
    case 'setup': return 'Setup';
    case 'briefing': {
      if (classEntry?.briefing_time) {
        return `Briefing ${classEntry.briefing_time}`;
      }
      return 'Briefing';
    }
    case 'break': {
      if (classEntry?.break_until) {
        return `Break Until ${classEntry.break_until}`;
      }
      return 'Break Until';
    }
    case 'start_time': {
      if (classEntry?.start_time) {
        return `Start ${classEntry.start_time}`;
      }
      return 'Start Time';
    }
    case 'in_progress': return 'In Progress';
    case 'offline-scoring': return 'Offline Scoring';
    case 'completed': return 'Completed';
    default:
      // Show intelligent status when class_status is 'no-status'
      if (classEntry) {
        const isCompleted = classEntry.completed_count === classEntry.entry_count && classEntry.entry_count > 0;
        const hasDogsInRing = classEntry.dogs.some(dog => dog.in_ring);

        if (isCompleted) return 'Completed';
        if (hasDogsInRing || classEntry.completed_count > 0) return 'In Progress';
        return 'Ready';
      }
      return 'Ready';
  }
}
