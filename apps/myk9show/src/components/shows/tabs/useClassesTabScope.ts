import { useMemo, useState } from 'react';
import type { ListOptionsFilterField, ListView } from '@/components/list-toolkit';
import type { ClassInfo } from './classInfo';
import { buildClassesTabColumns } from './classesTabColumns';
import {
  activeClassesTabViewId,
  buildClassesTabViews,
  classesTabViewFilters,
  filterClassesForTab,
} from './classesTabViews';
import {
  listTrialOptions,
  narrowClasses,
  resolveScopeTrialId,
  type ShowTrial,
} from './classesTabScope';

interface ScopeInput {
  classes: ClassInfo[];
  /** The show's trials, so one with no classes yet is still a scope. */
  trials?: readonly ShowTrial[] | undefined;
  /** Managers work one trial at a time; everyone else reads the whole show. */
  scopeToTrial: boolean;
  requestedTrialId: string | null | undefined;
  viewId: string;
  setViewId: (id: string) => void;
  /** The table hides its Ring column, so search must not find a row by it. */
  hideRing?: boolean;
}

/**
 * What Setup → Classes shows: the managed trial (managers), the open view, then the text
 * search and element filter. The view counts and the element counts come from the same
 * `filterClassesForTab` the rows do, so a number never disagrees with the list under it.
 */
export function useClassesTabScope({
  classes,
  trials,
  scopeToTrial,
  requestedTrialId,
  viewId,
  setViewId,
  hideRing = false,
}: ScopeInput) {
  const [search, setSearch] = useState('');
  const searchColumns = useMemo(
    () =>
      buildClassesTabColumns({
        canManage: false,
        hideRing,
        selectAll: () => null,
        select: () => null,
        judge: () => null,
        rowMenu: () => null,
      }),
    [hideRing]
  );
  const [element, setElement] = useState('all');

  const trialOptions = useMemo(() => listTrialOptions(classes, trials), [classes, trials]);
  const scopeTrialId = scopeToTrial ? resolveScopeTrialId(trialOptions, requestedTrialId) : null;
  const scopedClasses = useMemo(
    () => (scopeTrialId ? classes.filter(cls => cls.trialId === scopeTrialId) : classes),
    [classes, scopeTrialId]
  );

  const viewFilters = classesTabViewFilters(viewId);
  const views: ListView[] = useMemo(() => buildClassesTabViews(scopedClasses), [scopedClasses]);
  const activeViewId = activeClassesTabViewId(viewFilters);
  const viewClasses = useMemo(
    () => filterClassesForTab(scopedClasses, classesTabViewFilters(viewId)),
    [scopedClasses, viewId]
  );
  // One search for everyone, read from the table's own columns (no renderers needed to read them);
  // the element filter is a manager's. Readers keep element 'all'.
  const filteredClasses = useMemo(
    () => narrowClasses(viewClasses, search, element, searchColumns),
    [viewClasses, search, element, searchColumns]
  );

  const elementField: ListOptionsFilterField = useMemo(() => {
    const elements = Array.from(new Set(scopedClasses.map(cls => cls.element).filter(Boolean)));
    return {
      kind: 'options',
      key: 'element',
      label: 'Element',
      value: element === 'all' ? null : element,
      onChange: value => setElement(value ?? 'all'),
      options: elements.sort().map(value => ({
        value,
        label: value,
        // "How many would picking this element show": the open view, any search aside.
        count: narrowClasses(viewClasses, '', value, searchColumns).length,
      })),
    };
  }, [scopedClasses, viewClasses, element, searchColumns]);

  const isNarrowed = viewId !== 'all' || search !== '' || element !== 'all';
  const clearFilters = () => {
    setViewId('all');
    setSearch('');
    setElement('all');
  };

  return {
    trialOptions,
    scopeTrialId,
    scopedClasses,
    filteredClasses,
    views,
    activeViewId,
    viewFilters,
    search,
    setSearch,
    element,
    setElement,
    elementField,
    isNarrowed,
    clearFilters,
  };
}
