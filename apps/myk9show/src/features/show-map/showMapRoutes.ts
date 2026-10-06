import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';
import { getPaperScoringClassHref } from '@/pages/scoring/scoringRoutes';
import type { ReportScope } from '@/lib/reports/types';
import { getReportScopeSearchParams } from '@/lib/reports/reportScope';

export interface ShowMapReportHrefInput {
  reportId: string;
  scope: ReportScope;
}

export function getShowMapShowHref(showId: string): string {
  return `/shows/${showId}`;
}

export function getShowMapTrialHref(showId: string, trialId: string): string {
  return `/shows/${showId}/trials/${trialId}`;
}

export function getShowMapClassHref(showId: string, trialId: string, classId: string): string {
  return `/shows/${showId}/trials/${trialId}/classes/${classId}`;
}

export function getShowMapClassScoringHref(classId: string): string {
  return getPaperScoringClassHref(classId);
}

export function getShowMapTrialScheduleHref(showId: string): string {
  return `/shows/${showId}`;
}

export function getShowMapReportHref({ reportId, scope }: ShowMapReportHrefInput): string {
  const params = new URLSearchParams({ report: reportId });
  getReportScopeSearchParams(scope).forEach((value, key) => params.set(key, value));
  return `/shows/${scope.showId}/reports?${params.toString()}`;
}

/**
 * MYK9-919: Entry Management is the one home of approve. Show Map's "Review
 * entry" links to its pending review queue (the same destination as the Show
 * Desk's "entries waiting for review" signal) instead of approving in place, so
 * every approve runs the canonical write, audit and decision-email prompt.
 */
export function getShowMapReviewEntryHref(showId: string | null | undefined): string | undefined {
  return showId
    ? getEntryManagementHref({ showId, attention: 'pending', mode: 'review' })
    : undefined;
}
