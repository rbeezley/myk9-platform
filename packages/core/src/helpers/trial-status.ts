/**
 * Trial composite status — one composed line per trial (UX walk remediation
 * 2.B(3), kills C7). A trial never renders independent per-stage counters
 * ("Upcoming 0 / In Progress 0 / Complete 0"); it composes one sentence from
 * its classes' display statuses.
 *
 * "Needs wrap-up" is a Show Desk concern layered on top: this helper only
 * asserts `needsWrapUp` when every class is finished — the only time that
 * label may appear.
 */
import { getClassDisplayStatus, type ClassDisplayStatusInput } from './class-display-status';

export type TrialCompositeKind = 'no-classes' | 'not-started' | 'in-progress' | 'completed';

export interface TrialCompositeStatus {
  kind: TrialCompositeKind;
  /** The one composed line, e.g. "In progress — 1 of 3 classes complete". */
  label: string;
  completedCount: number;
  totalCount: number;
  /** True only when every class is finished. */
  needsWrapUp: boolean;
}

function classesNoun(count: number): string {
  return count === 1 ? 'class' : 'classes';
}

export function deriveTrialCompositeStatus(
  classes: readonly ClassDisplayStatusInput[]
): TrialCompositeStatus {
  const totalCount = classes.length;
  if (totalCount === 0) {
    return {
      kind: 'no-classes',
      label: 'No classes yet',
      completedCount: 0,
      totalCount: 0,
      needsWrapUp: false,
    };
  }

  const statuses = classes.map(getClassDisplayStatus);
  const completedCount = statuses.filter(status => status === 'completed').length;

  if (completedCount === totalCount) {
    return {
      kind: 'completed',
      label: 'Completed',
      completedCount,
      totalCount,
      needsWrapUp: true,
    };
  }

  const anyStarted = statuses.some(status => status !== 'not-started');
  if (!anyStarted) {
    return {
      kind: 'not-started',
      label: 'Not started',
      completedCount,
      totalCount,
      needsWrapUp: false,
    };
  }

  return {
    kind: 'in-progress',
    label: `In progress — ${completedCount} of ${totalCount} ${classesNoun(totalCount)} complete`,
    completedCount,
    totalCount,
    needsWrapUp: false,
  };
}
