/**
 * The Dogs browse page's built-in views (list-toolkit rollout, MYK9-796):
 * All / Active / Retired / Deceased, replacing the (until now unfiltered)
 * `DogStatus` column with a `ListViewTabs` row. Same convention as
 * `pages/admin/userListViews.ts` and `components/classes/classManagementViews.ts`:
 * a view is active only when every OTHER filter matches its preset exactly
 * (search excluded — it narrows within a view), and each view's count is
 * taken over the whole roster with search blanked, independent of the
 * roster's current search text.
 */
import type { ListView } from '@/components/list-toolkit';
import type { Dog } from '@/types/dog-types';
import { DEFAULT_DOG_FILTERS, filterDogs, type DogFilters } from './dogBrowseFilters';

interface DogViewDefinition {
  id: string;
  label: string;
  filters: () => DogFilters;
}

const preset = (patch: Partial<DogFilters>) => (): DogFilters => ({
  ...DEFAULT_DOG_FILTERS,
  ...patch,
});

const DOG_VIEWS: readonly DogViewDefinition[] = [
  { id: 'all', label: 'All', filters: preset({}) },
  { id: 'active', label: 'Active', filters: preset({ status: 'active' }) },
  { id: 'retired', label: 'Retired', filters: preset({ status: 'retired' }) },
  { id: 'deceased', label: 'Deceased', filters: preset({ status: 'deceased' }) },
];

function sameFilters(a: DogFilters, b: DogFilters): boolean {
  return a.status === b.status;
}

export function activeDogViewId(filters: DogFilters): string | null {
  return DOG_VIEWS.find(view => sameFilters(view.filters(), filters))?.id ?? null;
}

/** The filters for view `id`, keeping the caller's current search text. */
export function dogViewFilters(id: string, current: DogFilters): DogFilters {
  const view = DOG_VIEWS.find(candidate => candidate.id === id) ?? DOG_VIEWS[0];
  return { ...view.filters(), search: current.search };
}

/** Every built-in view with its count over the whole roster (search blanked). */
export function buildDogViews(dogs: readonly Dog[]): ListView[] {
  return DOG_VIEWS.map(view => ({
    id: view.id,
    label: view.label,
    count: filterDogs(dogs, { ...view.filters(), search: '' }).length,
  }));
}
