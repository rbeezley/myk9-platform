import { getSelectClassesHref } from '@/pages/secretary/selectClassesRoutes';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';
import { getPaperScoringClassHref } from '@/pages/scoring/scoringRoutes';
import { getReportScopeSearchParams } from '@/lib/reports/reportScope';
import type { ReportScope } from '@/lib/reports/types';

import type { CockpitFilter } from './secretaryCockpitTypes';

/** The All days choice; the URL leaves `day` unset for it. */
export const ALL_DAYS = 'all';

const COCKPIT_FILTERS: ReadonlySet<string> = new Set([
  'all',
  'in-progress',
  'needs-attention',
  'needs-closeout',
]);

export interface CockpitUrlState {
  selectedDay?: string | undefined;
  filter: CockpitFilter;
  focusedClassId?: string | undefined;
  anchor?: string | undefined;
}

export function getCockpitAnchorElementId(anchor: string): string {
  return `cockpit-anchor-${encodeURIComponent(anchor)}`;
}

export function normalizeCockpitUrlState(params: URLSearchParams): CockpitUrlState {
  const rawFilter = params.get('filter');
  const filter = COCKPIT_FILTERS.has(rawFilter ?? '') ? (rawFilter as CockpitFilter) : 'all';
  // No `day` means All days, the show home's default (MYK9-955).
  const selectedDay = params.get('day')?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? ALL_DAYS;
  const focusedClassId = params.get('focus')?.trim() || undefined;
  const anchor = params.get('anchor')?.trim() || undefined;
  return {
    selectedDay,
    filter,
    ...(focusedClassId ? { focusedClassId } : {}),
    ...(anchor ? { anchor } : {}),
  };
}

export function writeCockpitUrlState(
  previous: URLSearchParams,
  state: CockpitUrlState
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.selectedDay && state.selectedDay !== ALL_DAYS) params.set('day', state.selectedDay);
  if (state.filter !== 'all') params.set('filter', state.filter);
  if (state.focusedClassId) params.set('focus', state.focusedClassId);
  if (state.anchor) params.set('anchor', state.anchor);

  const requestedToolId = previous.get('tool')?.trim();
  if (requestedToolId) params.set('tool', requestedToolId);

  // MYK9-825/826, renamed `rosterFilter` -> `view` by MYK9-812: the
  // People-at-show roster's own view (`usePeopleRosterUrlState`, e.g.
  // `needs-check-in`) rides in a param distinct from this state's own
  // `filter`. CockpitUrlState has no concept of it, so without carrying it
  // forward here (same as `tool` above) a cockpit-driven URL rewrite — e.g.
  // selecting a day or focusing a class — would silently drop it on the
  // next `writeCockpitUrlState` call, resetting the roster to "All
  // exhibitors" on reopen/refresh.
  const requestedRosterView = previous.get('view')?.trim();
  if (requestedRosterView) params.set('view', requestedRosterView);

  return params;
}

function withReturnTo(href: string, returnTo?: string): string {
  if (!returnTo) return href;
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}

export function getCockpitEntryManagementHref(input: {
  showId: string;
  trialId?: string;
  classId?: string;
  tab?: 'entries' | 'move-ups' | 'pulls' | 'waitlist';
  attention?: 'pending' | 'missing_information' | 'accepted' | 'waitlist' | 'issues';
  payment?: 'pending' | 'paid_online' | 'paid_by_check' | 'paid_by_cash' | 'waived' | 'refunded';
  mode?: 'review' | 'day-of';
  returnTo: string;
}): string {
  return withReturnTo(getEntryManagementHref(input), input.returnTo);
}

/**
 * Select classes on the home, scoped to the class's trial and focused on it.
 * Both share `focus`/`view`, so `returnTo` carries the cockpit state that
 * Select classes' Done restores.
 */
export function getCockpitClassManagementHref(input: {
  showId: string;
  trialId: string;
  classId: string;
  returnTo: string;
}): string {
  return withReturnTo(
    getSelectClassesHref(input.showId, undefined, {
      trialId: input.trialId,
      focusClassId: input.classId,
    }),
    input.returnTo
  );
}

export function getCockpitPaperScoringHref(input: { classId: string; returnTo: string }): string {
  return withReturnTo(getPaperScoringClassHref(input.classId), input.returnTo);
}

export function getCockpitReportHref(input: {
  reportId: string;
  scope: ReportScope;
  returnTo: string;
}): string {
  const params = getReportScopeSearchParams(input.scope);
  params.set('report', input.reportId);
  return withReturnTo(
    `/shows/${encodeURIComponent(input.scope.showId)}/reports?${params.toString()}`,
    input.returnTo
  );
}

/**
 * MYK9-1036: the Result Catalog for ONE judge's day. The judge is named by id, the same identity
 * the Show Map groups on; the day is the trial date. The Reports page resolves both against the
 * show's classes, so no trial or class rides along.
 */
export function getCockpitJudgeDayCatalogHref(input: {
  showId: string;
  judgeId: string;
  date: string;
  returnTo: string;
}): string {
  const params = new URLSearchParams({ judgeId: input.judgeId, day: input.date });
  params.set('report', 'result-catalog');
  return withReturnTo(
    `/shows/${encodeURIComponent(input.showId)}/reports?${params.toString()}`,
    input.returnTo
  );
}

export function getCockpitResultsControlHref(input: {
  showId: string;
  trialId?: string;
  classId?: string;
  returnTo?: string;
}): string {
  const params = new URLSearchParams();
  if (input.trialId) params.set('trialId', input.trialId);
  if (input.classId) params.set('classId', input.classId);
  const query = params.toString();
  return withReturnTo(
    `/shows/${encodeURIComponent(input.showId)}/results${query ? `?${query}` : ''}`,
    input.returnTo
  );
}

export function getCockpitSubmitResultsHref(input: {
  showId: string;
  trialId?: string;
  returnTo?: string;
}): string {
  // Submit Results is a STEP inside the Results tab now (MYK9-630 phase 2), not
  // a route of its own, so `step` rides in the query with everything else.
  const params = new URLSearchParams();
  params.set('step', 'submit');
  if (input.trialId) params.set('trialId', input.trialId);
  return withReturnTo(
    `/shows/${encodeURIComponent(input.showId)}/results?${params.toString()}`,
    input.returnTo
  );
}

export function getCockpitClassDetailsHref(input: {
  showId: string;
  trialId: string;
  classId: string;
  returnTo: string;
}): string {
  return withReturnTo(
    `/shows/${encodeURIComponent(input.showId)}/trials/${encodeURIComponent(
      input.trialId
    )}/classes/${encodeURIComponent(input.classId)}`,
    input.returnTo
  );
}

/** The secretary's home: the manager Overview at `/shows/:id` (MYK9-955). */
export function getShowHomeHref({
  showId,
  state,
}: {
  showId: string;
  state: CockpitUrlState;
}): string {
  const params = writeCockpitUrlState(new URLSearchParams(), state);
  const query = params.toString();
  return `/shows/${encodeURIComponent(showId)}${query ? `?${query}` : ''}`;
}

/**
 * Where a "back" link from a cockpit deep link returns, and what it is called.
 * Accepts the show home (`/shows/:id`) of the expected show, and the retired
 * Show Day URLs (`/show-day`, `/show-desk`) a `returnTo` in an open tab may
 * still carry, which now mean the home too (MYK9-957); anything else is refused.
 */
export function resolveShowDeskReturn(
  candidate: string | null | undefined,
  expectedShowId?: string
): { href: string; label: string } | null {
  if (!candidate?.startsWith('/') || candidate.startsWith('//')) return null;
  let url: URL;
  try {
    url = new URL(candidate, 'https://myk9.internal');
  } catch {
    return null;
  }
  if (url.origin !== 'https://myk9.internal') return null;
  const match = url.pathname.match(/^\/shows\/([^/]+)(\/(?:show-day|show-desk))?$/);
  if (!match?.[1]) return null;
  let showId: string;
  try {
    showId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (expectedShowId && showId !== expectedShowId) return null;
  const state = normalizeCockpitUrlState(url.searchParams);
  return { href: getShowHomeHref({ showId, state }), label: 'Back to show' };
}

export function resolveShowDeskReturnHref(
  candidate: string | null | undefined,
  expectedShowId?: string
): string | null {
  return resolveShowDeskReturn(candidate, expectedShowId)?.href ?? null;
}
