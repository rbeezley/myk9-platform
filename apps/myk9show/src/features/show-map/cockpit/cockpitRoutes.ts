import { getClassManagementHref } from '@/components/classes/classManagementFilters';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';
import { getPaperScoringClassHref } from '@/pages/scoring/scoringRoutes';
import { getReportScopeSearchParams } from '@/lib/reports/reportScope';
import type { ReportScope } from '@/lib/reports/types';

import type { CockpitFilter } from './secretaryCockpitTypes';

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
  const selectedDay = params.get('day')?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
  const focusedClassId = params.get('focus')?.trim() || undefined;
  const anchor = params.get('anchor')?.trim() || undefined;
  return {
    ...(selectedDay ? { selectedDay } : {}),
    filter,
    ...(focusedClassId ? { focusedClassId } : {}),
    ...(anchor ? { anchor } : {}),
  };
}

export function getShowDeskHref({
  showId,
  state,
}: {
  showId: string;
  state: CockpitUrlState;
}): string {
  const params = new URLSearchParams();
  if (state.selectedDay) params.set('day', state.selectedDay);
  if (state.filter !== 'all') params.set('filter', state.filter);
  if (state.focusedClassId) params.set('focus', state.focusedClassId);
  if (state.anchor) params.set('anchor', state.anchor);
  const query = params.toString();
  return `/shows/${encodeURIComponent(showId)}/show-desk${query ? `?${query}` : ''}`;
}

function withReturnTo(href: string, returnTo: string): string {
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}

export function getCockpitEntryManagementHref(input: {
  showId: string;
  trialId?: string;
  classId?: string;
  tab?: 'entries' | 'move-ups' | 'pulls' | 'waitlist';
  attention?: 'pending' | 'missing_information' | 'accepted' | 'waitlist' | 'issues' | 'pulled';
  payment?: 'pending' | 'paid_online' | 'paid_by_check' | 'paid_by_cash' | 'waived' | 'refunded';
  mode?: 'review' | 'day-of';
  returnTo: string;
}): string {
  return withReturnTo(getEntryManagementHref(input), input.returnTo);
}

export function getCockpitClassManagementHref(input: {
  showId: string;
  trialId: string;
  classId: string;
  returnTo: string;
}): string {
  return withReturnTo(
    getClassManagementHref({
      showId: input.showId,
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

export function getCockpitResultsControlHref(input: {
  showId: string;
  trialId?: string;
  classId?: string;
  returnTo: string;
}): string {
  const params = new URLSearchParams();
  if (input.trialId) params.set('trialId', input.trialId);
  if (input.classId) params.set('classId', input.classId);
  const query = params.toString();
  return withReturnTo(
    `/shows/${encodeURIComponent(input.showId)}/results-control${query ? `?${query}` : ''}`,
    input.returnTo
  );
}

export function getCockpitSubmitResultsHref(input: {
  showId: string;
  trialId?: string;
  returnTo: string;
}): string {
  const params = new URLSearchParams();
  if (input.trialId) params.set('trialId', input.trialId);
  const query = params.toString();
  return withReturnTo(
    `/shows/${encodeURIComponent(input.showId)}/submit-results${query ? `?${query}` : ''}`,
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

export function resolveShowDeskReturnHref(
  candidate: string | null | undefined,
  expectedShowId?: string
): string | null {
  if (!candidate?.startsWith('/') || candidate.startsWith('//')) return null;
  let url: URL;
  try {
    url = new URL(candidate, 'https://myk9.internal');
  } catch {
    return null;
  }
  if (url.origin !== 'https://myk9.internal') return null;
  const match = url.pathname.match(/^\/shows\/([^/]+)\/show-desk$/);
  if (!match?.[1]) return null;
  const showId = decodeURIComponent(match[1]);
  if (expectedShowId && showId !== expectedShowId) return null;
  return getShowDeskHref({ showId, state: normalizeCockpitUrlState(url.searchParams) });
}
