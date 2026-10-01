/**
 * The People page's views, filter bar and result line — the list toolkit
 * (docs/plan-list-toolkit.md, MYK9-797) configured with the roster's fields.
 *
 * Replaces the page's former chip-based Role filter and the plain
 * `ListControls` result count: the counts now live on the "Show" select. Role
 * and Location fields were cut by MYK9-906 — the role views cover Role.
 */

import { useMemo, type ReactNode } from 'react';
import {
  ListFilterBar,
  ListResultLine,
  ListViewTabs,
  summarizeFilters,
} from '@/components/list-toolkit';
import type { PeopleFilters } from '@/hooks/useBrowsePeopleData';
import type { User } from '@/types/user-types';
import { activePeopleViewId, buildPeopleViews, peopleViewFilterPatch } from './peopleListViews';

const PEOPLE_NOUN = ['person', 'people'] as const;

interface PeopleListToolbarProps {
  /** The whole roster, for view and option counts. */
  people: User[];
  /** How many rows the current search + filters leave. */
  matchCount: number;
  filters: PeopleFilters;
  onFiltersChange: (filters: PeopleFilters) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
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
  resultLineExtra,
}: PeopleListToolbarProps) {
  const views = useMemo(() => buildPeopleViews(people), [people]);

  const activeViewId = activePeopleViewId(filters);
  return (
    <div className="flex flex-col gap-3">
      <ListViewTabs
        label="People views"
        views={views}
        activeId={activeViewId}
        onSelect={id => onFiltersChange({ ...filters, ...peopleViewFilterPatch(id) })}
      />
      <ListFilterBar
        searchValue={filters.search}
        onSearchChange={value => onFiltersChange({ ...filters, search: value })}
        searchPlaceholder="Search people by name or email..."
        fields={[]}
      />
      <ListResultLine
        shown={matchCount}
        total={people.length}
        noun={PEOPLE_NOUN}
        filtered={hasActiveFilters}
        filterSummary={summarizeFilters({
          search: filters.search,
          views,
          activeViewId,
          // Role and login have no field; a combination no view matches (a stale
          // link) must still be named so Show all explains it.
          extra:
            activeViewId === null
              ? [
                  ...(filters.role !== 'all' ? [`Role: ${filters.role}`] : []),
                  ...(filters.login === 'none' ? ['No login'] : []),
                ]
              : [],
        })}
        onShowAll={onClearAll}
      >
        {resultLineExtra}
      </ListResultLine>
    </div>
  );
}
