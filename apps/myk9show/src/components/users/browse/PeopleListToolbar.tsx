/**
 * The People page's views, filter bar and result line — the list toolkit
 * (docs/plan-list-toolkit.md, MYK9-797) configured with the roster's fields.
 *
 * Replaces the page's former chip-based Role filter and the plain
 * `ListControls` result count: the counts now live on views the visitor can
 * press, and every filter is a removable chip beside the search.
 */

import { useMemo, type ReactNode } from 'react';
import {
  ListFilterBar,
  ListResultLine,
  ListViewTabs,
  type ListFilterField,
} from '@/components/list-toolkit';
import { filterPeople, type PeopleFilters } from '@/hooks/useBrowsePeopleData';
import type { User } from '@/types/user-types';
import { activePeopleViewId, buildPeopleViews, peopleViewFilterPatch } from './peopleListViews';

const PEOPLE_NOUN = ['person', 'people'] as const;

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

interface PeopleListToolbarProps {
  /** The whole roster, for view and option counts. */
  people: User[];
  /** How many rows the current search + filters leave. */
  matchCount: number;
  filters: PeopleFilters;
  onFiltersChange: (filters: PeopleFilters) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
  availableRoles: string[];
  availableLocations: string[];
  /** Right-aligned extra on the result line — the page's table/cards toggle. */
  resultLineExtra?: ReactNode;
}

export function PeopleListToolbar({
  people,
  matchCount,
  filters,
  onFiltersChange,
  onClearAll,
  hasActiveFilters,
  availableRoles,
  availableLocations,
  resultLineExtra,
}: PeopleListToolbarProps) {
  const views = useMemo(() => buildPeopleViews(people), [people]);

  // Option counts answer "how many would picking this show" — every other
  // field held at 'all', search dropped so a typed query doesn't hide options.
  const countWith = (patch: Partial<PeopleFilters>) =>
    filterPeople(people, { ...filters, search: '', ...patch }).length;

  const fields: ListFilterField[] = [
    {
      kind: 'options',
      key: 'role',
      label: 'Role',
      value: filters.role === 'all' ? null : filters.role,
      onChange: value => onFiltersChange({ ...filters, role: value ?? 'all' }),
      options: availableRoles.map(role => ({
        value: role,
        label: formatRole(role),
        count: countWith({ role }),
      })),
    },
    {
      kind: 'options',
      key: 'location',
      label: 'Location',
      value: filters.location === 'all' ? null : filters.location,
      onChange: value => onFiltersChange({ ...filters, location: value ?? 'all' }),
      options: availableLocations.map(location => ({
        value: location,
        label: location,
        count: countWith({ location }),
      })),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <ListViewTabs
        label="People views"
        views={views}
        activeId={activePeopleViewId(filters)}
        onSelect={id => onFiltersChange({ ...filters, ...peopleViewFilterPatch(id) })}
      />
      <ListFilterBar
        searchValue={filters.search}
        onSearchChange={value => onFiltersChange({ ...filters, search: value })}
        searchPlaceholder="Search people by name or email..."
        fields={fields}
        onClearAll={onClearAll}
      />
      <ListResultLine
        shown={matchCount}
        total={people.length}
        noun={PEOPLE_NOUN}
        filtered={hasActiveFilters}
      >
        {resultLineExtra}
      </ListResultLine>
    </div>
  );
}
