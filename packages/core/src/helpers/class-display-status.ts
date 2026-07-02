export type ClassDisplayStatus = 'not-started' | 'in-progress' | 'completed';

/**
 * The one label per lifecycle stage (UX walk remediation 2.B). Never
 * "No Status", never Complete/Completed drift — surfaces render these
 * exact strings or no chip at all.
 */
export const CLASS_DISPLAY_STATUS_LABELS: Record<ClassDisplayStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In Progress',
  completed: 'Completed',
};

/**
 * Total lookup: any unrecognized value renders as "Not started" rather than
 * crashing or leaking a raw enum string (house rule: `MAP[x] ?? MAP.unknown`).
 */
export function getClassDisplayStatusLabel(
  status: ClassDisplayStatus | string | null | undefined
): string {
  return (
    CLASS_DISPLAY_STATUS_LABELS[status as ClassDisplayStatus] ??
    CLASS_DISPLAY_STATUS_LABELS['not-started']
  );
}

/**
 * Draft shows render no class lifecycle chips at all — "Not started" on a
 * show that isn't published yet is status noise (UX walk remediation 2.B(1)).
 * Only an affirmative `'draft'` hides chips: cold-store rows with no show
 * status keep their chips (ringside must not lose state while syncing).
 */
export function shouldShowClassLifecycleChips(showStatus: string | null | undefined): boolean {
  return showStatus !== 'draft';
}

export interface ClassDisplayStatusInput {
  status?: string;
  is_scoring_finalized?: boolean;
  entry_count: number;
  scored_count: number;
  has_active_entries?: boolean;
}

export function getClassDisplayStatus(input: ClassDisplayStatusInput): ClassDisplayStatus {
  // Priority 1: Finalized flag
  if (input.is_scoring_finalized === true) {
    return 'completed';
  }

  // Priority 2: Canonical status
  if (input.status === 'Completed') {
    return 'completed';
  }

  // Priority 3: All entries scored
  if (input.scored_count === input.entry_count && input.entry_count > 0) {
    return 'completed';
  }

  // Priority 4: In Progress status or active scoring
  if (input.status === 'In Progress') {
    return 'in-progress';
  }

  if (input.has_active_entries || input.scored_count > 0) {
    return 'in-progress';
  }

  // Default
  return 'not-started';
}
