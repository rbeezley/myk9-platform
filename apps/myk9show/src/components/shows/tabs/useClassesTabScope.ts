import { useMemo, useState } from 'react';
import type { ListOptionsFilterField, ListView } from '@/components/list-toolkit';
import type { ClassInfo } from './classInfo';
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
}: ScopeInput) {
  const [search, setSearch] = useState('');
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
  // Search and element only exist for managers; everyone else keeps the view alone.
  const filteredClasses = useMemo(
    () => (scopeToTrial ? narrowClasses(viewClasses, search, element) : viewClasses),
    [viewClasses, scopeToTrial, search, element]
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
        count: narrowClasses(viewClasses, '', value).length,
      })),
    };
  }, [scopedClasses, viewClasses, element]);

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
