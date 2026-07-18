import {
  CLASS_MANAGEMENT_STATUS_FILTER_VALUES,
  isClassManagementStatusFilter,
  type ClassManagementStatusFilter,
} from '@/features/operational-views/operationalViews';

export { CLASS_MANAGEMENT_STATUS_FILTER_VALUES, isClassManagementStatusFilter };
export type { ClassManagementStatusFilter };

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
} {
  const params = new URLSearchParams(searchParams);

  const rawStatus = params.get('status');
  const status = isClassManagementStatusFilter(rawStatus) ? rawStatus : 'all';
  const search = params.get('search') ?? '';
  const element = params.get('element') ?? 'all';

  if (status === 'all') params.delete('status');
  else params.set('status', status);

  if (search === '') params.delete('search');
  else params.set('search', search);

  if (element === 'all' || element === '') params.delete('element');
  else params.set('element', element);

  return { params, status, search, element };
}
