/**
 * Check-in Status Types and Utilities
 *
 * Manages the check-in workflow for exhibitors at dog shows
 */

export type CheckInStatus =
  | 'none'
  | 'checked-in'
  | 'conflict'
  | 'pulled'
  | 'at-gate'
  | 'go-to-gate';

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
  none: {
    status: 'none',
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
  'go-to-gate': {
    status: 'go-to-gate',
    label: 'Go to Gate',
    color: 'text-blue-600',
    backgroundColor: 'bg-blue-100',
    borderColor: 'border-blue-200',
    icon: '→',
    description: 'Exhibitor should proceed to gate',
    priority: 2,
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
  return status !== 'none' && status !== 'pulled';
}

export function requiresAction(status: CheckInStatus): boolean {
  return status === 'go-to-gate' || status === 'conflict';
}

export function canProceedToGate(status: CheckInStatus): boolean {
  return status === 'checked-in' || status === 'go-to-gate';
}
