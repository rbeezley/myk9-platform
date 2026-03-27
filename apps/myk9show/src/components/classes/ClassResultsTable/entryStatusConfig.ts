export type EntryStatus =
  | 'no_status'
  | 'checked_in'
  | 'conflict'
  | 'pulled'
  | 'come_to_gate'
  | 'at_gate'
  | 'in_ring';

export interface StatusBadgeConfig {
  label: string;
  icon: string;
  className: string;
}

export const ENTRY_STATUS_CONFIG: Record<EntryStatus, StatusBadgeConfig> = {
  no_status: {
    label: 'No Status',
    icon: '',
    className: 'bg-muted text-muted-foreground',
  },
  checked_in: {
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
  come_to_gate: {
    label: 'Come to Gate',
    icon: '✦',
    className: 'bg-primary text-primary-foreground',
  },
  at_gate: {
    label: 'At Gate',
    icon: '★',
    className: 'bg-sky-500 text-white',
  },
  in_ring: {
    label: 'In Ring',
    icon: '●',
    className: 'bg-amber-500 text-white',
  },
};
