import {
  summarizeShowDayReconciliation,
  type ShowDayReconciliationEntry,
} from './showDayReconciliationSummary';
import type { ShowIncidentSummary } from './showIncidents';
import type { ShowWorkbenchClassSummary } from './showWorkbenchTypes';

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
}

export interface ResultSubmissionSummary {
  status?: string | null;
  trial_id?: string | null;
}

export interface CloseoutReadinessInput {
  classes: CloseoutClassSummary[];
  entries: ShowDayReconciliationEntry[];
  incidents: Pick<ShowIncidentSummary, 'reportableCount' | 'urgentCount'>;
  submissions: ResultSubmissionSummary[];
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
  const incompleteClassCount = input.classes.filter(cls => {
    const entryCount = Number(cls.entryCount ?? 0);
    const scoredCount = Number(cls.scoredCount ?? 0);
    return entryCount > 0 && scoredCount < entryCount && needsCascade(cls.status);
  }).length;
  const reconciliation = summarizeShowDayReconciliation(input.entries);
  const hasSubmittedResults = input.submissions.some(row =>
    SUBMITTED_STATUSES.has(normalizeStatus(row.status))
  );

  if (incompleteClassCount > 0) {
    concerns.push(
      `${incompleteClassCount} ${incompleteClassCount === 1 ? 'class still has' : 'classes still have'} unscored entries.`
    );
  }

  if (!hasSubmittedResults) {
    concerns.push('No result submission has been recorded for this show.');
  }

  if (reconciliation.refundReviewCount > 0) {
    concerns.push(
      `${reconciliation.refundReviewCount} pulled ${reconciliation.refundReviewCount === 1 ? 'entry needs' : 'entries need'} refund review.`
    );
  }

  if (input.incidents.reportableCount > 0) {
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

export function toCloseoutClassSummary(cls: ShowWorkbenchClassSummary): CloseoutClassSummary {
  return {
    id: cls.id,
    status: cls.status,
    entryCount: cls.entryCount,
    scoredCount: cls.scoredCount,
  };
}
