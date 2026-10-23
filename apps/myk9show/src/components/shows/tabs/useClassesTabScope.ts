import { useMemo, useState } from 'react';
import type { ListView } from '@/components/list-toolkit';
import type { ClassInfo } from './classInfo';
import { buildClassesTabColumns } from './classesTabColumns';
import {
  activeClassesTabViewId,
  buildClassesTabViews,
  classesTabViewFilters,
  filterClassesForTab,
} from './classesTabViews';
import { narrowClasses } from './classesTabScope';

interface ScopeInput {
  classes: ClassInfo[];
  viewId: string;
  setViewId: (id: string) => void;
  /** The table hides its Ring column, so search must not find a row by it. */
  hideRing?: boolean;
}

/**
 * What the Classes tab shows: the open view, then the text search. The view counts come from the
 * same `filterClassesForTab` the rows do, so a number never disagrees with the list under it.
 */
export function useClassesTabScope({ classes, viewId, setViewId, hideRing = false }: ScopeInput) {
  const [search, setSearch] = useState('');
  const searchColumns = useMemo(() => buildClassesTabColumns({ hideRing }), [hideRing]);

  const viewFilters = classesTabViewFilters(viewId);
  const views: ListView[] = useMemo(() => buildClassesTabViews(classes), [classes]);
  const activeViewId = activeClassesTabViewId(viewFilters);
  const viewClasses = useMemo(
    () => filterClassesForTab(classes, classesTabViewFilters(viewId)),
    [classes, viewId]
  );
  // The one search, read from the table's own columns (no renderers needed to read them).
  const filteredClasses = useMemo(
    () => narrowClasses(viewClasses, search, searchColumns),
    [viewClasses, search, searchColumns]
  );

  const isNarrowed = viewId !== 'all' || search !== '';
  const clearFilters = () => {
    setViewId('all');
    setSearch('');
  };

  return {
    filteredClasses,
    views,
    activeViewId,
    viewFilters,
    search,
    setSearch,
    isNarrowed,
    clearFilters,
  };
}
