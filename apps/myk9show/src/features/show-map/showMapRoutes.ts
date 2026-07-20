import { getPaperScoringClassHref } from '@/pages/scoring/scoringRoutes';
import type { ReportScope } from '@/lib/reports/types';

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
  return `/shows/${showId}/setup`;
}

export function getShowMapReportHref({
  reportId,
  scope,
}: ShowMapReportHrefInput): string {
  const params = new URLSearchParams({ report: reportId });
  if (scope.kind === 'trial' || scope.kind === 'class') params.set('trialId', scope.trialId);
  if (scope.kind === 'class') params.set('classId', scope.classId);
  return `/shows/${scope.showId}/reports?${params.toString()}`;
}
