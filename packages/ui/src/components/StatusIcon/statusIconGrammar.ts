export type StatusFamily = 'entry' | 'class' | 'trial';

export type StatusShape =
  'not-started' | 'pending' | 'in-progress' | 'complete' | 'needs-attention';

export const STATUS_COLOR_CLASSES = [
  'text-muted-foreground',
  'text-warning',
  'text-info',
  'text-success',
  'text-destructive',
] as const;

export type StatusColorClass = (typeof STATUS_COLOR_CLASSES)[number];

export interface StatusDescriptor {
  readonly status: string;
  readonly label: string;
  readonly shape: StatusShape;
  readonly colorClass: StatusColorClass;
}

export const ENTRY_STATUS_VALUES = [
  'no-status',
  'draft',
  'submitted',
  'paid',
  'confirmed',
  'scheduled',
  'checked-in',
  'at-gate',
  'come-to-gate',
  'in-ring',
  'competing',
  'completed',
  'withdrawn',
  'not_accepted',
  'scratched',
  'absent',
  'moved',
  'scratch-requested',
  'move-up-requested',
  'pending-payment',
  'promotion-expired',
  'pending',
  'accepted',
  'waitlist',
  'waitlisted',
  'rejected',
  'missing_info',
  'conflict',
  'pulled',
  'checked_in',
  'not_checked_in',
  'at_gate',
  'in_ring',
] as const;

export const CLASS_STATUS_VALUES = [
  'Scheduled',
  'Upcoming',
  'In Progress',
  'Completed',
  'Cancelled',
  'no-status',
  'none',
  'setup',
  'briefing',
  'break',
  'in_progress',
  'offline-scoring',
  'offline',
  'upcoming',
  'completed',
  'not-started',
  'in-progress',
  'not_started',
  'pending',
  'paused',
  'cancelled',
  'start_time',
  'start-time',
] as const;

export const TRIAL_STATUS_VALUES = [
  'no-classes',
  'not-started',
  'in-progress',
  'completed',
  'cancelled',
] as const;

function descriptor(
  status: string,
  label: string,
  shape: StatusShape,
  colorClass: StatusColorClass
): StatusDescriptor {
  return { status, label, shape, colorClass };
}

export const ENTRY_STATUS_DESCRIPTORS = {
  'no-status': descriptor('no-status', 'No Status', 'not-started', 'text-muted-foreground'),
  draft: descriptor('draft', 'Draft', 'not-started', 'text-muted-foreground'),
  submitted: descriptor('submitted', 'Submitted', 'pending', 'text-warning'),
  paid: descriptor('paid', 'Paid', 'pending', 'text-warning'),
  confirmed: descriptor('confirmed', 'Accepted', 'in-progress', 'text-info'),
  scheduled: descriptor('scheduled', 'Scheduled', 'not-started', 'text-muted-foreground'),
  'checked-in': descriptor('checked-in', 'Checked-in', 'in-progress', 'text-info'),
  'at-gate': descriptor('at-gate', 'At Gate', 'in-progress', 'text-info'),
  'come-to-gate': descriptor('come-to-gate', 'Come to Gate', 'needs-attention', 'text-warning'),
  'in-ring': descriptor('in-ring', 'In Ring', 'in-progress', 'text-info'),
  competing: descriptor('competing', 'Competing', 'in-progress', 'text-info'),
  completed: descriptor('completed', 'Completed', 'complete', 'text-success'),
  withdrawn: descriptor('withdrawn', 'Withdrawn', 'complete', 'text-muted-foreground'),
  not_accepted: descriptor('not_accepted', 'Not accepted', 'complete', 'text-destructive'),
  scratched: descriptor('scratched', 'Scratched', 'complete', 'text-muted-foreground'),
  absent: descriptor('absent', 'Absent', 'complete', 'text-muted-foreground'),
  moved: descriptor('moved', 'Moved', 'complete', 'text-muted-foreground'),
  'scratch-requested': descriptor(
    'scratch-requested',
    'Scratch requested',
    'needs-attention',
    'text-warning'
  ),
  'move-up-requested': descriptor(
    'move-up-requested',
    'Move-up requested',
    'needs-attention',
    'text-warning'
  ),
  'pending-payment': descriptor(
    'pending-payment',
    'Payment due',
    'needs-attention',
    'text-warning'
  ),
  'promotion-expired': descriptor(
    'promotion-expired',
    'Promotion expired',
    'complete',
    'text-destructive'
  ),
  pending: descriptor('pending', 'Pending', 'pending', 'text-warning'),
  accepted: descriptor('accepted', 'Accepted', 'in-progress', 'text-info'),
  waitlist: descriptor('waitlist', 'Wait list', 'pending', 'text-warning'),
  waitlisted: descriptor('waitlisted', 'Wait list', 'pending', 'text-warning'),
  rejected: descriptor('rejected', 'Rejected', 'complete', 'text-destructive'),
  missing_info: descriptor(
    'missing_info',
    'Missing information',
    'needs-attention',
    'text-warning'
  ),
  conflict: descriptor('conflict', 'Conflict', 'needs-attention', 'text-warning'),
  pulled: descriptor('pulled', 'Pulled', 'complete', 'text-muted-foreground'),
  checked_in: descriptor('checked_in', 'Checked-in', 'in-progress', 'text-info'),
  not_checked_in: descriptor(
    'not_checked_in',
    'Not checked in',
    'not-started',
    'text-muted-foreground'
  ),
  at_gate: descriptor('at_gate', 'At Gate', 'in-progress', 'text-info'),
  in_ring: descriptor('in_ring', 'In Ring', 'in-progress', 'text-info'),
} satisfies Record<(typeof ENTRY_STATUS_VALUES)[number], StatusDescriptor>;

export const CLASS_STATUS_DESCRIPTORS = {
  Scheduled: descriptor('Scheduled', 'Not started', 'not-started', 'text-muted-foreground'),
  Upcoming: descriptor('Upcoming', 'Not started', 'not-started', 'text-muted-foreground'),
  'In Progress': descriptor('In Progress', 'In Progress', 'in-progress', 'text-info'),
  Completed: descriptor('Completed', 'Completed', 'complete', 'text-success'),
  Cancelled: descriptor('Cancelled', 'Cancelled', 'complete', 'text-destructive'),
  'no-status': descriptor('no-status', 'Not started', 'not-started', 'text-muted-foreground'),
  none: descriptor('none', 'Not started', 'not-started', 'text-muted-foreground'),
  setup: descriptor('setup', 'Setup', 'not-started', 'text-muted-foreground'),
  briefing: descriptor('briefing', 'Briefing', 'in-progress', 'text-warning'),
  break: descriptor('break', 'Break', 'in-progress', 'text-warning'),
  in_progress: descriptor('in_progress', 'In Progress', 'in-progress', 'text-info'),
  'offline-scoring': descriptor(
    'offline-scoring',
    'Offline scoring',
    'needs-attention',
    'text-warning'
  ),
  offline: descriptor('offline', 'Offline scoring', 'needs-attention', 'text-warning'),
  upcoming: descriptor('upcoming', 'Upcoming', 'not-started', 'text-muted-foreground'),
  completed: descriptor('completed', 'Completed', 'complete', 'text-success'),
  'not-started': descriptor('not-started', 'Not started', 'not-started', 'text-muted-foreground'),
  'in-progress': descriptor('in-progress', 'In Progress', 'in-progress', 'text-info'),
  not_started: descriptor('not_started', 'Not started', 'not-started', 'text-muted-foreground'),
  pending: descriptor('pending', 'Pending', 'pending', 'text-warning'),
  paused: descriptor('paused', 'Paused', 'needs-attention', 'text-warning'),
  cancelled: descriptor('cancelled', 'Cancelled', 'complete', 'text-destructive'),
  start_time: descriptor('start_time', 'Upcoming', 'not-started', 'text-muted-foreground'),
  'start-time': descriptor('start-time', 'Upcoming', 'not-started', 'text-muted-foreground'),
} satisfies Record<(typeof CLASS_STATUS_VALUES)[number], StatusDescriptor>;

export const TRIAL_STATUS_DESCRIPTORS = {
  'no-classes': descriptor('no-classes', 'No classes yet', 'not-started', 'text-muted-foreground'),
  'not-started': descriptor('not-started', 'Not started', 'not-started', 'text-muted-foreground'),
  'in-progress': descriptor('in-progress', 'In progress', 'in-progress', 'text-info'),
  completed: descriptor('completed', 'Completed', 'complete', 'text-success'),
  cancelled: descriptor('cancelled', 'Cancelled', 'complete', 'text-destructive'),
} satisfies Record<(typeof TRIAL_STATUS_VALUES)[number], StatusDescriptor>;

const STATUS_DESCRIPTORS: Readonly<
  Record<StatusFamily, Readonly<Record<string, StatusDescriptor>>>
> = {
  entry: ENTRY_STATUS_DESCRIPTORS,
  class: CLASS_STATUS_DESCRIPTORS,
  trial: TRIAL_STATUS_DESCRIPTORS,
};

const FALLBACK_STATUS_BY_FAMILY: Readonly<Record<StatusFamily, string>> = {
  entry: 'no-status',
  class: 'no-status',
  trial: 'no-classes',
};

export function getStatusDescriptor(
  family: StatusFamily,
  status: string | null | undefined
): StatusDescriptor {
  const familyDescriptors = STATUS_DESCRIPTORS[family];
  return familyDescriptors[status ?? ''] ?? familyDescriptors[FALLBACK_STATUS_BY_FAMILY[family]]!;
}

export function getTrialCompositeStatus(
  classStatus: string | null | undefined,
  classCount: number
): (typeof TRIAL_STATUS_VALUES)[number] {
  const normalized =
    classStatus
      ?.trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-') ?? '';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (classCount === 0) return 'no-classes';
  if (normalized === 'completed' || normalized === 'complete') return 'completed';
  if (normalized === 'in-progress' || normalized === 'inprogress') return 'in-progress';
  return 'not-started';
}
