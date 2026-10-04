import {
  summarizeShowDayReconciliation,
  type ShowDayReconciliationEntry,
} from './showDayReconciliationSummary';
import type { ShowIncidentSummary } from './showIncidents';

export interface CloseoutShowSummary {
  id: string;
  status?: string | null;
}

export interface CloseoutTrialSummary {
  id: string;
  status?: string | null;
}

export interface CloseoutClassSummary {
  id: string;
  status?: string | null;
  entryCount?: number | null;
  scoredCount?: number | null;
  /** Entries never accepted. Not scoring work, but still unresolved at close. */
  pendingCount?: number | null;
}

export interface ResultSubmissionSummary {
  status?: string | null;
  trial_id?: string | null;
}

export interface CloseoutReadinessInput {
  classes: CloseoutClassSummary[];
  entries: ShowDayReconciliationEntry[];
  /** `null` when the incident log could not be read. */
  incidents: Pick<ShowIncidentSummary, 'reportableCount' | 'urgentCount'> | null;
  /** `null` when result submissions could not be read. */
  submissions: ResultSubmissionSummary[] | null;
}

export interface CloseoutReadiness {
  concerns: string[];
  hasConcerns: boolean;
}

export interface CloseoutCascadeTargets {
  showId: string;
  trialIds: string[];
  classIds: string[];
}

const COMPLETED_STATUSES = new Set(['completed', 'complete']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);
const SUBMITTED_STATUSES = new Set(['sent', 'submitted']);

function normalizeStatus(status: string | null | undefined): string {
  return status?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
}

function isCompleted(status: string | null | undefined): boolean {
  return COMPLETED_STATUSES.has(normalizeStatus(status));
}

function isCancelled(status: string | null | undefined): boolean {
  return CANCELLED_STATUSES.has(normalizeStatus(status));
}

export function isShowClosedOut(status: string | null | undefined): boolean {
  return isCompleted(status);
}

function needsCascade(status: string | null | undefined): boolean {
  return !isCompleted(status) && !isCancelled(status);
}

export function buildCloseoutReadiness(input: CloseoutReadinessInput): CloseoutReadiness {
  const concerns: string[] = [];
  // A class whose counts could not be READ is not a class with nothing
  // outstanding. `?? 0` made an unknown count fail the `entryCount > 0` test,
  // so it dropped out of the incomplete tally and the gate reported "no
  // concerns" over data it never loaded.
  const unknownCountClassCount = input.classes.filter(
    cls => (cls.entryCount == null || cls.scoredCount == null) && needsCascade(cls.status)
  ).length;
  const incompleteClassCount = input.classes.filter(cls => {
    if (cls.entryCount == null || cls.scoredCount == null) return false;
    const entryCount = Number(cls.entryCount);
    const scoredCount = Number(cls.scoredCount);
    return entryCount > 0 && scoredCount < entryCount && needsCascade(cls.status);
  }).length;
  // A pending entry is out of the scoring count (#2712) but is not resolved:
  // it was never accepted or turned away, so say so rather than drop it.
  const pendingReviewClassCount = input.classes.filter(
    cls => Number(cls.pendingCount ?? 0) > 0 && needsCascade(cls.status)
  ).length;
  // Only the pull/refund figures gate close-out, and they do not depend on when
  // an entry was taken, so no desk window is needed here.
  const reconciliation = summarizeShowDayReconciliation(input.entries, null);
  const hasSubmittedResults = input.submissions?.some(row =>
    SUBMITTED_STATUSES.has(normalizeStatus(row.status))
  );

  if (unknownCountClassCount > 0) {
    concerns.push(
      `${unknownCountClassCount} ${unknownCountClassCount === 1 ? 'class has' : 'classes have'} entry data we could not load, so scoring completeness is unknown.`
    );
  }
  if (incompleteClassCount > 0) {
    concerns.push(
      `${incompleteClassCount} ${incompleteClassCount === 1 ? 'class still has' : 'classes still have'} unscored entries.`
    );
  }
  if (pendingReviewClassCount > 0) {
    concerns.push(
      `${pendingReviewClassCount} ${pendingReviewClassCount === 1 ? 'class still has' : 'classes still have'} entries waiting for review.`
    );
  }

  // Unread is its own concern: offline, the close must stay possible (it is a
  // replicated write), but it may not claim "nothing submitted" or "no
  // reportable incidents" over data it never read.
  if (input.submissions === null) {
    concerns.push(
      'Result submissions could not be checked, so whether results were sent is unknown.'
    );
  } else if (!hasSubmittedResults) {
    concerns.push('No result submission has been recorded for this show.');
  }

  if (reconciliation.refundReviewCount > 0) {
    concerns.push(
      `${reconciliation.refundReviewCount} pulled ${reconciliation.refundReviewCount === 1 ? 'entry needs' : 'entries need'} refund review.`
    );
  }

  if (input.incidents === null) {
    concerns.push(
      'The incident log could not be checked, so open reportable incidents are unknown.'
    );
  } else if (input.incidents.reportableCount > 0) {
    concerns.push(
      `${input.incidents.reportableCount} reportable ${input.incidents.reportableCount === 1 ? 'incident is' : 'incidents are'} still in the incident log.`
    );
  }

  return { concerns, hasConcerns: concerns.length > 0 };
}

export function selectCloseoutCascadeTargets(input: {
  show: CloseoutShowSummary;
  trials: CloseoutTrialSummary[];
  classes: CloseoutClassSummary[];
}): CloseoutCascadeTargets {
  return {
    showId: input.show.id,
    trialIds: input.trials.filter(trial => needsCascade(trial.status)).map(trial => trial.id),
    classIds: input.classes.filter(cls => needsCascade(cls.status)).map(cls => cls.id),
  };
}
