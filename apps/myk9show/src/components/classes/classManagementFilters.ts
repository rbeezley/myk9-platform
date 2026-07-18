import {
  CLASS_MANAGEMENT_STATUS_FILTER_VALUES,
  isClassManagementStatusFilter,
  isOperationalViewDensity,
  type ClassManagementStatusFilter,
  type OperationalViewDensity,
} from '@/features/operational-views/operationalViews';

export { CLASS_MANAGEMENT_STATUS_FILTER_VALUES, isClassManagementStatusFilter };
export type { ClassManagementStatusFilter, OperationalViewDensity };

/**
 * URL-backed filter state for `ClassManagementPage`, mirroring
 * `normalizeEntryManagementSearchParams` in
 * `@/components/entries/management/entryManagementFilters`.
 *
 * `status` is the LIFECYCLE bucket (`ClassManagementStatusFilter` — see
 * `operationalViews.ts`), not the raw per-org class status string. `element`
 * stays out of the curated-preset vocabulary (Decision 1 inventory) but still
 * round-trips through this normalizer as a plain string param.
 */
export function normalizeClassManagementSearchParams(searchParams: URLSearchParams): {
  params: URLSearchParams;
  status: ClassManagementStatusFilter;
  search: string;
  element: string;
  density: OperationalViewDensity;
} {
  const params = new URLSearchParams(searchParams);

  const rawStatus = params.get('status');
  const status = isClassManagementStatusFilter(rawStatus) ? rawStatus : 'all';
  const search = params.get('search') ?? '';
  const element = params.get('element') ?? 'all';
  const rawDensity = params.get('density');
  const density = isOperationalViewDensity(rawDensity) ? rawDensity : 'comfortable';

  if (status === 'all') params.delete('status');
  else params.set('status', status);

  if (search === '') params.delete('search');
  else params.set('search', search);

  if (element === 'all' || element === '') params.delete('element');
  else params.set('element', element);

  if (density === 'comfortable') params.delete('density');
  else params.set('density', density);

  return { params, status, search, element, density };
}

export interface ClassManagementHrefInput {
  showId: string;
  trialId: string;
  status?: ClassManagementStatusFilter;
  search?: string;
  element?: string;
}

/**
 * Canonical Class Management deep-link builder, mirroring
 * `getEntryManagementHref` (`@/features/entry-operations/entryAttentionRoutes`).
 * Callers (Workbench readiness surfaces, the copy-link affordance, etc.) MUST
 * use this instead of hand-assembling `/shows/:id/classes/:trialId?...` query
 * strings, so every link stays normalizer-consistent with
 * `normalizeClassManagementSearchParams`.
 */
export function getClassManagementHref(input: ClassManagementHrefInput): string {
  const params = new URLSearchParams();
  if (input.status && input.status !== 'all') params.set('status', input.status);
  if (input.search) params.set('search', input.search);
  if (input.element && input.element !== 'all') params.set('element', input.element);
  const query = params.toString();
  return `/shows/${encodeURIComponent(input.showId)}/classes/${encodeURIComponent(input.trialId)}${
    query ? `?${query}` : ''
  }`;
}
