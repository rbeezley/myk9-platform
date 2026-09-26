import { matchesAny } from '@myk9/core';
import { deriveClassLifecycleValue } from '@/lib/status/classLifecycle';
import {
  CLASS_MANAGEMENT_STATUS_FILTER_VALUES,
  isClassManagementStatusFilter,
  isOperationalViewDensity,
  type ClassManagementStatusFilter,
  type OperationalViewDensity,
} from '@/features/operational-views/operationalViews';

export { CLASS_MANAGEMENT_STATUS_FILTER_VALUES, isClassManagementStatusFilter };
export type { ClassManagementStatusFilter, OperationalViewDensity };

/** The minimal row shape `filterManagedClasses` needs — kept decoupled from `DbClassRow`. */
export interface ClassManagementRowLike {
  name: string | null;
  element: string | null;
  level: string | null;
  status: string | null;
}

export interface ClassManagementFilterState {
  status: ClassManagementStatusFilter;
  element: string;
  search: string;
}

/**
 * The single source of truth for Class Management's visible rows AND every
 * count shown on its views/filter chips (list-toolkit rollout, MYK9-811) —
 * mirrors `filterUsers` (`pages/admin/UserManagementPage.helpers.ts`), one
 * function reused for the main list and every count.
 */
export function filterManagedClasses<T extends ClassManagementRowLike>(
  classes: T[],
  searchTerm: string,
  filters: Pick<ClassManagementFilterState, 'status' | 'element'>
): T[] {
  return classes.filter(cls => {
    const matchesSearch = matchesAny([cls.name ?? '', cls.element ?? '', cls.level ?? ''], searchTerm);
    const matchesStatus =
      filters.status === 'all' || deriveClassLifecycleValue(cls.status) === filters.status;
    const matchesElement = filters.element === 'all' || cls.element === filters.element;
    return matchesSearch && matchesStatus && matchesElement;
  });
}

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
  focusClassId: string | null;
} {
  const params = new URLSearchParams(searchParams);

  const rawStatus = params.get('status');
  const status = isClassManagementStatusFilter(rawStatus) ? rawStatus : 'all';
  const search = params.get('search') ?? '';
  const element = params.get('element') ?? 'all';
  const rawDensity = params.get('density');
  const density = isOperationalViewDensity(rawDensity) ? rawDensity : 'comfortable';
  const focusClassId = params.get('focus')?.trim() || null;

  if (status === 'all') params.delete('status');
  else params.set('status', status);

  if (search === '') params.delete('search');
  else params.set('search', search);

  if (element === 'all' || element === '') params.delete('element');
  else params.set('element', element);

  if (density === 'comfortable') params.delete('density');
  else params.set('density', density);

  if (focusClassId) params.set('focus', focusClassId);
  else params.delete('focus');

  return { params, status, search, element, density, focusClassId };
}

export interface ClassManagementHrefInput {
  showId: string;
  trialId: string;
  status?: ClassManagementStatusFilter;
  search?: string;
  element?: string;
  focusClassId?: string;
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
  if (input.focusClassId) params.set('focus', input.focusClassId);
  if (input.status && input.status !== 'all') params.set('status', input.status);
  if (input.search) params.set('search', input.search);
  if (input.element && input.element !== 'all') params.set('element', input.element);
  const query = params.toString();
  return `/shows/${encodeURIComponent(input.showId)}/classes/${encodeURIComponent(input.trialId)}${
    query ? `?${query}` : ''
  }`;
}
