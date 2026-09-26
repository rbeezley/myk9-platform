/**
 * Class Management's built-in views (list-toolkit rollout, MYK9-811) — the
 * same four presets `ClassLifecyclePresetTiles` rendered as stat cards, now
 * `ListViewTabs`. A view is active only when the filters match it exactly
 * (status AND element AND search all at the preset's default) — any further
 * narrowing reads as a custom filter, matching `activeUserViewId`
 * (`pages/admin/userListViews.ts`).
 */

import type { ListView } from '@/components/list-toolkit';
import {
  filterManagedClasses,
  type ClassManagementFilterState,
  type ClassManagementRowLike,
  type ClassManagementStatusFilter,
} from './classManagementFilters';

const DEFAULT_CLASS_MANAGEMENT_FILTERS: ClassManagementFilterState = {
  status: 'all',
  element: 'all',
  search: '',
};

interface ClassManagementViewDefinition {
  id: string;
  label: string;
  state: () => ClassManagementFilterState;
}

const preset = (status: ClassManagementStatusFilter) => (): ClassManagementFilterState => ({
  ...DEFAULT_CLASS_MANAGEMENT_FILTERS,
  status,
});

const CLASS_MANAGEMENT_VIEWS: readonly ClassManagementViewDefinition[] = [
  { id: 'all', label: 'All', state: preset('all') },
  { id: 'not_started', label: 'Not started', state: preset('not_started') },
  { id: 'in_progress', label: 'In progress', state: preset('in_progress') },
  { id: 'completed', label: 'Completed', state: preset('completed') },
];

function sameState(a: ClassManagementFilterState, b: ClassManagementFilterState): boolean {
  return a.status === b.status && a.element === b.element && a.search === b.search;
}

export function activeClassManagementViewId(state: ClassManagementFilterState): string | null {
  return CLASS_MANAGEMENT_VIEWS.find(view => sameState(view.state(), state))?.id ?? null;
}

export function classManagementViewState(id: string): ClassManagementFilterState {
  return (CLASS_MANAGEMENT_VIEWS.find(view => view.id === id) ?? CLASS_MANAGEMENT_VIEWS[0]).state();
}

/** Every built-in view with its count over the whole (unfiltered-by-search) trial. */
export function buildClassManagementViews<T extends ClassManagementRowLike>(
  classes: T[]
): ListView[] {
  return CLASS_MANAGEMENT_VIEWS.map(view => {
    const state = view.state();
    return {
      id: view.id,
      label: view.label,
      count: filterManagedClasses(classes, '', state).length,
    };
  });
}
