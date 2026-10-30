/**
 * Every URL the Results tab reads or writes, in one place so the list, the detail and the tests
 * cannot spell them differently.
 *
 * `classId` and `trialId` are what Overview's links into Results already emit
 * (`getCockpitResultsControlHref`), so a class selected from there opens here unchanged.
 */
import { ALL_DAYS, getShowHomeHref } from '@/features/show-map/cockpit/cockpitRoutes';
import { getPaperScoringEntryHref } from '@/pages/scoring/scoringRoutes';
import { isResultsStatusFilterId, type ResultsStatusFilterId } from './resultsNextAction';

export interface ResultsTabUrlState {
  classId: string | null;
  trialId: string | null;
  search: string;
  /** What the URL names; `null` when it names none, so the page derives the default (MYK9-1276). */
  status: ResultsStatusFilterId | null;
}

/** The URL state with the status resolved: the URL's own, else the page's derived default. */
export type ResultsTabViewState = Omit<ResultsTabUrlState, 'status'> & {
  status: ResultsStatusFilterId;
};

export function readResultsTabUrlState(params: URLSearchParams): ResultsTabUrlState {
  const status = params.get('status');
  return {
    classId: params.get('classId')?.trim() || null,
    trialId: params.get('trialId')?.trim() || null,
    search: params.get('q') ?? '',
    status: isResultsStatusFilterId(status) ? status : null,
  };
}

/** Writes `next` over `previous` (a picked status is always written, Needs me included), leaving `step` (and anything else) alone. */
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
    set('status', next.status ?? null);
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
 *
 * Score from paper is secretary/judge only, so a manager known NOT to operate the show (a club
 * admin) keeps the ringside correct-score flow (MYK9-1025), which their ringside admin role can
 * use, instead of a link that ends on an access-denied page.
 */
export function getFixScoreHref(
  showId: string,
  classId: string,
  entryId: string,
  canOperate: boolean
): string {
  if (canOperate) return getPaperScoringEntryHref(classId, entryId);
  return `/at-show/${encodeURIComponent(showId)}/class/${encodeURIComponent(
    classId
  )}/score/${encodeURIComponent(entryId)}`;
}

export function getResultsStepHref(showId: string, step: 'submit' | 'close'): string {
  return `/shows/${encodeURIComponent(showId)}/results?step=${step}`;
}

/**
 * The nationals leaderboard is a view of the Results tab (MYK9-1516); anything else is the class
 * list. The URL alone never opens it on a show that is not known to be nationals.
 */
export function isNationalsLeaderboardView(
  params: URLSearchParams,
  isNationals: boolean | null
): boolean {
  return isNationals === true && isNationalsLeaderboardRequested(params);
}

/** The URL names the board; whether the show may open it waits on the nationals flag. */
export function isNationalsLeaderboardRequested(params: URLSearchParams): boolean {
  return params.get('view') === 'leaderboard';
}

/** Easy to link from elsewhere (the ringside menu, MYK9-1508): it is just the Results tab URL. */
export function getNationalsLeaderboardHref(showId: string): string {
  return `/shows/${encodeURIComponent(showId)}/results?view=leaderboard`;
}

export function getResultsListHref(showId: string): string {
  return `/shows/${encodeURIComponent(showId)}/results`;
}

/** The show id, from whichever route param this tab is mounted under. */
export function getShowIdParam(params: { showId?: string; id?: string }): string {
  return params.showId ?? params.id ?? '';
}
