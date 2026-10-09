/**
 * Every URL the Results tab reads or writes, in one place so the list, the detail and the tests
 * cannot spell them differently.
 *
 * `classId` and `trialId` are what Overview's links into Results already emit
 * (`getCockpitResultsControlHref`), so a class selected from there opens here unchanged.
 */
import { ALL_DAYS, getShowHomeHref } from '@/features/show-map/cockpit/cockpitRoutes';
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
 * The live scoresheet, pre-filled with the saved result (MYK9-1025): the existing correct-score
 * flow ringside reaches from a class's entry list.
 */
export function getFixScoreHref(showId: string, classId: string, entryId: string): string {
  return `/at-show/${encodeURIComponent(showId)}/class/${encodeURIComponent(
    classId
  )}/score/${encodeURIComponent(entryId)}`;
}

export function getResultsStepHref(showId: string, step: 'submit' | 'close'): string {
  return `/shows/${encodeURIComponent(showId)}/results?step=${step}`;
}
