/**
 * Check-in Status Types and Utilities
 *
 * Manages the check-in workflow for exhibitors at dog shows.
 * The canonical CheckInStatus type comes from @myk9/core.
 */

// Re-export the canonical type from @myk9/core
export type { CheckInStatus } from '@myk9/core';
import type { CheckInStatus } from '@myk9/core';

export interface CheckInStatusMetadata {
  status: CheckInStatus;
  description: string;
  priority: number; // For sorting and display hierarchy
}

export const CHECK_IN_STATUS_METADATA: Record<CheckInStatus, CheckInStatusMetadata> = {
  'no-status': {
    status: 'no-status',
    description: 'Exhibitor has not checked in yet',
    priority: 0,
  },
  'checked-in': {
    status: 'checked-in',
    description: 'Exhibitor has checked in and is ready',
    priority: 1,
  },
  conflict: {
    status: 'conflict',
    description: 'Schedule conflict detected',
    priority: 5,
  },
  pulled: {
    status: 'pulled',
    description: 'Entry has been pulled from competition',
    priority: 6,
  },
  'at-gate': {
    status: 'at-gate',
    description: 'Exhibitor is at the gate and ready',
    priority: 3,
  },
  'come-to-gate': {
    status: 'come-to-gate',
    description: 'Exhibitor should proceed to gate',
    priority: 2,
  },
  'in-ring': {
    status: 'in-ring',
    description: 'Exhibitor is currently competing in the ring',
    priority: 4,
  },
  completed: {
    status: 'completed',
    description: 'Entry has finished competing',
    priority: 7,
  },
};

export interface CheckInInfo {
  entryId: string;
  status: CheckInStatus;
  timestamp: Date;
  updatedBy: string;
  notes?: string | undefined;
}

// Helper functions
export function getCheckInStatusMetadata(status: CheckInStatus): CheckInStatusMetadata {
  return CHECK_IN_STATUS_METADATA[status] ?? CHECK_IN_STATUS_METADATA['no-status'];
}

export function isActiveStatus(status: CheckInStatus): boolean {
  return status !== 'no-status' && status !== 'pulled';
}

export function requiresAction(status: CheckInStatus): boolean {
  return status === 'come-to-gate' || status === 'conflict';
}

export function canProceedToGate(status: CheckInStatus): boolean {
  return status === 'checked-in' || status === 'come-to-gate';
}

// Exhibitor-facing plain-language labels, distinct from the staff-grade
// grammar labels. Shared by CheckInStatusDialog and any
// other exhibitor-facing surface (e.g. the at-show "Your dogs today" view)
// that needs to badge a status in the same first-person voice.
export const EXHIBITOR_STATUS_LABELS: Partial<Record<CheckInStatus, string>> = {
  'no-status': 'I am not there yet',
  'checked-in': 'I am here',
  conflict: 'I have a conflict — tell the secretary',
  pulled: "I won't be running this class",
};
