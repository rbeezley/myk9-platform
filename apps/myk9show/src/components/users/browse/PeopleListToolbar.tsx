/**
 * The People page's views, filter bar and result line — the list toolkit
 * (docs/plan-list-toolkit.md, MYK9-797) configured with the roster's fields.
 *
 * Replaces the page's former chip-based Role filter and the plain
 * `ListControls` result count: the counts now live on the "Show" select. Role
 * and Location fields were cut by MYK9-906 — the role views cover Role.
 */

import { useMemo, type ReactNode } from 'react';
import { ListFilterBar, ListResultLine, ListViewTabs } from '@/components/list-toolkit';
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
  /** Beside an open person: search and view on one row, the count only while narrowed. */
  compact?: boolean;
}

export function PeopleListToolbar({
  people,
  matchCount,
  filters,
  onFiltersChange,
  onClearAll,
  hasActiveFilters,
  resultLineExtra,
  compact = false,
}: PeopleListToolbarProps) {
  const views = useMemo(() => buildPeopleViews(people), [people]);

  const activeViewId = activePeopleViewId(filters);
  const viewTabs = (
    <ListViewTabs
      label="People views"
      views={views}
      activeId={activeViewId}
      compact={compact}
      onSelect={id => onFiltersChange({ ...filters, ...peopleViewFilterPatch(id) })}
    />
  );
  const filterBar = (
    <ListFilterBar
      searchValue={filters.search}
      onSearchChange={value => onFiltersChange({ ...filters, search: value })}
      searchPlaceholder={compact ? 'Search people' : 'Search people by name or email...'}
      fields={[]}
      compact={compact}
      {...(compact ? { className: 'min-w-0 flex-1' } : {})}
    />
  );
  return (
    <div className="flex flex-col gap-3">
      {compact ? (
        <div className="flex items-center gap-2">
          {filterBar}
          {viewTabs}
        </div>
      ) : (
        <>
          {viewTabs}
          {filterBar}
        </>
      )}
      <ListResultLine
        shown={matchCount}
        total={people.length}
        noun={PEOPLE_NOUN}
        filtered={hasActiveFilters}
        onShowAll={onClearAll}
        showAllInEmptyState={matchCount === 0}
        quietWhenUnfiltered={compact}
      >
        {resultLineExtra}
      </ListResultLine>
    </div>
  );
}
