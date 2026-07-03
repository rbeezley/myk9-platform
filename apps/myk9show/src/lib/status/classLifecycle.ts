export type ClassLifecycleValue =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'unknown';

export type ClassLifecycleTone = 'neutral' | 'active' | 'complete' | 'muted';

export interface ClassLifecyclePresentation {
  value: ClassLifecycleValue;
  label: string;
  tone: ClassLifecycleTone;
}

export interface ClassLifecyclePresentationInput {
  classStatus?: string | null | undefined;
  showStatus?: string | null | undefined;
}

const UNKNOWN_LIFECYCLE: ClassLifecycleValue = 'unknown';

const CLASS_LIFECYCLE_BY_STATUS: Record<string, ClassLifecycleValue> = {
  scheduled: 'not_started',
  upcoming: 'not_started',
  setup: 'not_started',
  none: 'not_started',
  not_started: 'not_started',
  no_status: 'not_started',
  pending: 'not_started',
  planned: 'not_started',
  published: 'not_started',
  accepting_entries: 'not_started',
  closed: 'not_started',
  draft: 'not_started',
  unpublished: 'not_started',
  in_progress: 'in_progress',
  inprogress: 'in_progress',
  check_in: 'in_progress',
  scoring: 'in_progress',
  briefing: 'in_progress',
  break: 'in_progress',
  start_time: 'in_progress',
  offline_scoring: 'in_progress',
  completed: 'completed',
  complete: 'completed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  unknown: UNKNOWN_LIFECYCLE,
};

export const CLASS_LIFECYCLE_LABELS: Record<ClassLifecycleValue, string> = {
  not_started: 'Not started',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  unknown: 'Unknown status',
};

const CLASS_LIFECYCLE_TONES: Record<ClassLifecycleValue, ClassLifecycleTone> = {
  not_started: 'neutral',
  in_progress: 'active',
  completed: 'complete',
  cancelled: 'muted',
  unknown: 'neutral',
};

const CLASS_LIFECYCLE_SHOW_VISIBILITY: Record<string, boolean> = {
  draft: false,
  unpublished: false,
  unknown: true,
};

function lookupKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, '_') || 'unknown';
}

export function shouldShowClassLifecycle(showStatus?: string | null | undefined): boolean {
  const key = lookupKey(showStatus);
  return CLASS_LIFECYCLE_SHOW_VISIBILITY[key] ?? CLASS_LIFECYCLE_SHOW_VISIBILITY.unknown;
}

export function deriveClassLifecycleValue(
  classStatus?: string | null | undefined
): ClassLifecycleValue {
  const key = lookupKey(classStatus);
  return CLASS_LIFECYCLE_BY_STATUS[key] ?? CLASS_LIFECYCLE_BY_STATUS.unknown;
}

export function deriveClassLifecyclePresentation({
  classStatus,
  showStatus,
}: ClassLifecyclePresentationInput): ClassLifecyclePresentation | null {
  if (!shouldShowClassLifecycle(showStatus)) return null;

  const value = deriveClassLifecycleValue(classStatus);

  return {
    value,
    label: CLASS_LIFECYCLE_LABELS[value] ?? CLASS_LIFECYCLE_LABELS.unknown,
    tone: CLASS_LIFECYCLE_TONES[value] ?? CLASS_LIFECYCLE_TONES.unknown,
  };
}
