import type { VisibilityTiming, ResultField } from '@myk9/secretary';

export const TIMING_LABELS: Record<VisibilityTiming, string> = {
  immediate: 'Immediate',
  class_complete: 'After Class',
  manual_release: 'Manual Release',
};

export const RESULT_FIELDS: { key: ResultField; label: string }[] = [
  { key: 'placement', label: 'Placement' },
  { key: 'qualification', label: 'Qualification' },
  { key: 'time', label: 'Time' },
  { key: 'faults', label: 'Faults' },
];
