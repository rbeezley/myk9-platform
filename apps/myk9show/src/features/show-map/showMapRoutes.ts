import { getPaperScoringClassHref } from '@/pages/scoring/scoringRoutes';

export interface ShowMapReportHrefInput {
  reportId: string;
  showId: string;
  trialId?: string | undefined;
  classId?: string | undefined;
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
  showId,
  trialId,
  classId,
}: ShowMapReportHrefInput): string {
  const params = new URLSearchParams({ report: reportId });
  if (trialId) params.set('trialId', trialId);
  if (classId) params.set('classId', classId);
  return `/shows/${showId}/reports?${params.toString()}`;
}
