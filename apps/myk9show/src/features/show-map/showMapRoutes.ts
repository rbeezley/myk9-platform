import { getPaperScoringClassHref, getPaperScoringEntryHref } from '@/pages/scoring/scoringRoutes';

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

export function getShowMapEntryScoringHref(classId: string, entryId: string): string {
  return getPaperScoringEntryHref(classId, entryId);
}
