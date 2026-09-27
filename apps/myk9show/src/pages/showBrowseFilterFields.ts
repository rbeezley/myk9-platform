/**
 * Find Shows' filter-bar fields (list-toolkit rollout, MYK9-798): Discipline,
 * Entry Status, Club, and (once a location is known) Distance — replacing the
 * page's own `buildChipFilters` + `FilterChips`/`ListControls` combination.
 *
 * Options carry no counts: an accurate "how many would this leave" number
 * needs re-running the whole filter pipeline once per option per dimension,
 * which `applyFilters` (`useBrowseShowsFilters.ts`) does not expose as a
 * reusable step. Omitting the count is supported by the kit (`ListFilterOption.count`
 * is optional) and keeps this page's filters at the same shape as before.
 */

import type { ListFilterField } from '@/components/list-toolkit';
import { RADIUS_OPTIONS } from '@/features/location/distance';
import type { ShowFilters } from '@/hooks/useBrowseShowsFilters';
import { DISCIPLINE_MAP, ENTRY_STATUS_OPTIONS } from './showBrowseDisciplineOptions';

export interface ShowBrowseClubOption {
  label: string;
  value: string;
}

interface BuildShowBrowseFilterFieldsArgs {
  filters: ShowFilters;
  onFiltersChange: (updater: (prev: ShowFilters) => ShowFilters) => void;
  clubOptions: ShowBrowseClubOption[];
  /** Whether the visitor's location is known — the Distance field is inert without one. */
  hasLocation: boolean;
}

export function buildShowBrowseFilterFields({
  filters,
  onFiltersChange,
  clubOptions,
  hasLocation,
}: BuildShowBrowseFilterFieldsArgs): ListFilterField[] {
  const fields: ListFilterField[] = [
    {
      kind: 'options',
      key: 'discipline',
      label: 'Discipline',
      value: filters.discipline === 'all' ? null : filters.discipline,
      onChange: value => onFiltersChange(prev => ({ ...prev, discipline: value ?? 'all' })),
      options: Object.entries(DISCIPLINE_MAP).map(([value, label]) => ({ value, label })),
    },
    {
      kind: 'options',
      key: 'entryStatus',
      label: 'Entry Status',
      value: filters.entryStatus === 'all' ? null : filters.entryStatus,
      onChange: value => onFiltersChange(prev => ({ ...prev, entryStatus: value ?? 'all' })),
      options: [...ENTRY_STATUS_OPTIONS],
    },
    {
      kind: 'options',
      key: 'club',
      label: 'Club',
      value: filters.club === 'all' ? null : filters.club,
      onChange: value => onFiltersChange(prev => ({ ...prev, club: value ?? 'all' })),
      options: clubOptions,
    },
  ];

  if (hasLocation) {
    fields.push({
      kind: 'options',
      key: 'radius',
      label: 'Distance',
      value: filters.radius === 'all' ? null : filters.radius,
      onChange: value => onFiltersChange(prev => ({ ...prev, radius: value ?? 'all' })),
      options: RADIUS_OPTIONS.map(miles => ({ value: miles, label: `Within ${miles} mi` })),
    });
  }

  return fields;
}
