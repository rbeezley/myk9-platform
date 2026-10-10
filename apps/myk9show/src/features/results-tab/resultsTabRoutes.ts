/**
 * Every URL the Results tab reads or writes, in one place so the list, the detail and the tests
 * cannot spell them differently.
 *
 * `classId` and `trialId` are what Overview's links into Results already emit
 * (`getCockpitResultsControlHref`), so a class selected from there opens here unchanged.
 */
import { ALL_DAYS, getShowHomeHref } from '@/features/show-map/cockpit/cockpitRoutes';
import { getPaperScoringEntryHref } from '@/pages/scoring/scoringRoutes';
import {
  DEFAULT_RESULTS_STATUS_FILTER,
  isResultsStatusFilterId,
  type ResultsStatusFilterId,
} from './resultsNextAction';

export interface ResultsTabUrlState {
  classId: string | null;
  trialId: string | null;
  search: string;
  status: ResultsStatusFilterId;
}

export function readResultsTabUrlState(params: URLSearchParams): ResultsTabUrlState {
  const status = params.get('status');
  return {
    classId: params.get('classId')?.trim() || null,
    trialId: params.get('trialId')?.trim() || null,
    search: params.get('q') ?? '',
    status: isResultsStatusFilterId(status) ? status : DEFAULT_RESULTS_STATUS_FILTER,
  };
}

/** Writes `next` over `previous`, dropping defaults and leaving `step` (and anything else) alone. */
export function writeResultsTabUrlState(
  previous: URLSearchParams,
  next: Partial<ResultsTabUrlState>
): URLSearchParams {
  const params = new URLSearchParams(previous);
  const set = (key: string, value: string | null) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };
  if ('classId' in next) set('classId', next.classId ?? null);
  if ('trialId' in next) set('trialId', next.trialId ?? null);
  if ('search' in next) set('q', next.search?.trim() ? next.search : null);
  if ('status' in next) {
    set(
      'status',
      next.status && next.status !== DEFAULT_RESULTS_STATUS_FILTER ? next.status : null
    );
  }
  return params;
}

export function getResultsClassHref(showId: string, classId: string, search = ''): string {
  const params = writeResultsTabUrlState(new URLSearchParams(search), { classId });
  return `/shows/${encodeURIComponent(showId)}/results?${params.toString()}`;
}

/** An unfinished class belongs on Overview, with that class open in the cockpit. */
export function getOverviewFocusHref(showId: string, classId: string): string {
  return getShowHomeHref({
    showId,
    state: { selectedDay: ALL_DAYS, filter: 'all', focusedClassId: classId },
  });
}

/**
 * Score from paper, with that entry selected (MYK9-1086): a correction from Results is
 * desk work against the judge's sheet, not the ringside stopwatch (owner, 2026-10-09).
 */
export function getFixScoreHref(classId: string, entryId: string): string {
  return getPaperScoringEntryHref(classId, entryId);
}

export function getResultsStepHref(showId: string, step: 'submit' | 'close'): string {
  return `/shows/${encodeURIComponent(showId)}/results?step=${step}`;
}
