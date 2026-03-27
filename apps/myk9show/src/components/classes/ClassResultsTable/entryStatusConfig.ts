import type { CheckInStatus } from '@myk9/core';

export interface StatusBadgeConfig {
  label: string;
  icon: string;
  className: string;
}

/** Tailwind badge styles for each check-in status. Labels/icons from @myk9/core's CHECKIN_STATUS. */
export const ENTRY_STATUS_CONFIG: Record<CheckInStatus, StatusBadgeConfig> = {
  'no-status': {
    label: 'No Status',
    icon: '',
    className: 'bg-muted text-muted-foreground',
  },
  'checked-in': {
    label: 'Checked-in',
    icon: '✓',
    className: 'bg-green-600 text-white',
  },
  conflict: {
    label: 'Conflict',
    icon: '⚠',
    className: 'bg-orange-500 text-white',
  },
  pulled: {
    label: 'Pulled',
    icon: '✕',
    className: 'bg-red-500 text-white',
  },
  'come-to-gate': {
    label: 'Come to Gate',
    icon: '✦',
    className: 'bg-primary text-primary-foreground',
  },
  'at-gate': {
    label: 'At Gate',
    icon: '★',
    className: 'bg-sky-500 text-white',
  },
  'in-ring': {
    label: 'In Ring',
    icon: '●',
    className: 'bg-amber-500 text-white',
  },
  completed: {
    label: 'Completed',
    icon: '✓',
    className: 'bg-muted text-muted-foreground',
  },
};
