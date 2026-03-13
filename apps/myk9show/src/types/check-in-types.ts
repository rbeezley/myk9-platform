/**
 * Check-in Status Types and Utilities
 *
 * Manages the check-in workflow for exhibitors at dog shows.
 * The canonical CheckInStatus type comes from @myk9/core.
 */

// Re-export the canonical type from @myk9/core
export type { CheckInStatus } from '@myk9/core';
import type { CheckInStatus } from '@myk9/core';

export interface CheckInStatusConfig {
  status: CheckInStatus;
  label: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
  icon?: string | undefined;
  description: string;
  priority: number; // For sorting and display hierarchy
}

export const CHECK_IN_STATUS_CONFIG: Record<CheckInStatus, CheckInStatusConfig> = {
  'no-status': {
    status: 'no-status',
    label: 'Not Checked In',
    color: 'text-gray-500',
    backgroundColor: 'bg-gray-100',
    borderColor: 'border-gray-200',
    description: 'Exhibitor has not checked in yet',
    priority: 0,
  },
  'checked-in': {
    status: 'checked-in',
    label: 'Checked In',
    color: 'text-teal-600',
    backgroundColor: 'bg-teal-100',
    borderColor: 'border-teal-200',
    icon: '✓',
    description: 'Exhibitor has checked in and is ready',
    priority: 1,
  },
  conflict: {
    status: 'conflict',
    label: 'Conflict',
    color: 'text-amber-600',
    backgroundColor: 'bg-amber-100',
    borderColor: 'border-amber-200',
    icon: '!',
    description: 'Schedule conflict detected',
    priority: 5,
  },
  pulled: {
    status: 'pulled',
    label: 'Pulled',
    color: 'text-red-600',
    backgroundColor: 'bg-red-100',
    borderColor: 'border-red-200',
    icon: '—',
    description: 'Entry has been pulled from competition',
    priority: 6,
  },
  'at-gate': {
    status: 'at-gate',
    label: 'At Gate',
    color: 'text-violet-600',
    backgroundColor: 'bg-violet-100',
    borderColor: 'border-violet-200',
    icon: '●',
    description: 'Exhibitor is at the gate and ready',
    priority: 3,
  },
  'come-to-gate': {
    status: 'come-to-gate',
    label: 'Come to Gate',
    color: 'text-blue-600',
    backgroundColor: 'bg-blue-100',
    borderColor: 'border-blue-200',
    icon: '→',
    description: 'Exhibitor should proceed to gate',
    priority: 2,
  },
  'in-ring': {
    status: 'in-ring',
    label: 'In Ring',
    color: 'text-indigo-600',
    backgroundColor: 'bg-indigo-100',
    borderColor: 'border-indigo-200',
    icon: '◉',
    description: 'Exhibitor is currently competing in the ring',
    priority: 4,
  },
  completed: {
    status: 'completed',
    label: 'Completed',
    color: 'text-green-600',
    backgroundColor: 'bg-green-100',
    borderColor: 'border-green-200',
    icon: '✓✓',
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
export function getCheckInStatusConfig(status: CheckInStatus): CheckInStatusConfig {
  return CHECK_IN_STATUS_CONFIG[status];
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
