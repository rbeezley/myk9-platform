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
export type TrialStatusKey = TrialCompositeKind | 'cancelled';

export interface TrialStatusSummary {
  trialStatus?: string | null | undefined;
  classCount: number;
  completedCount?: number | undefined;
  hasStarted?: boolean | undefined;
}

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

export function deriveTrialStatusKey({
  trialStatus,
  classCount,
  completedCount,
  hasStarted = false,
}: TrialStatusSummary): TrialStatusKey {
  const normalized =
    trialStatus
      ?.trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-') ?? '';

  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (classCount === 0) return 'no-classes';

  if (completedCount !== undefined) {
    if (completedCount >= classCount) return 'completed';
    if (completedCount > 0 || hasStarted) return 'in-progress';
  } else if (normalized === 'completed' || normalized === 'complete') {
    return 'completed';
  }

  if (
    hasStarted ||
    normalized === 'in-progress' ||
    normalized === 'inprogress' ||
    normalized === 'briefing' ||
    normalized === 'break'
  ) {
    return 'in-progress';
  }

  return 'not-started';
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

  const anyStarted = statuses.some(status => status !== 'not-started');
  const kind = deriveTrialStatusKey({
    classCount: totalCount,
    completedCount,
    hasStarted: anyStarted,
  });

  if (kind === 'completed') {
    return {
      kind: 'completed',
      label: 'Completed',
      completedCount,
      totalCount,
      needsWrapUp: true,
    };
  }

  if (kind === 'not-started') {
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
