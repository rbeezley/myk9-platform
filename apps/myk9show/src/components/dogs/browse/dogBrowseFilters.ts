/**
 * Pure Dogs-browse filtering (list-toolkit rollout, MYK9-796) — search and
 * status, ANDed together. Extracted from
 * `useBrowseDogsData` so the same predicate backs both the filtered roster and
 * the view-tab counts in `dogBrowseViews.ts`.
 */
import { getDogBreedLabel, type Dog } from '@/types/dog-types';

export interface DogFilters {
  search: string;
  status: string;
}

export const DEFAULT_DOG_FILTERS: DogFilters = {
  search: '',
  status: 'all',
};

/** Lowercased, NUL-joined search haystack for one dog — see `filterDogs`. */
export function buildDogSearchText(dog: Dog): string {
  return [dog.callName, dog.name, getDogBreedLabel(dog), dog.ownerName]
    .filter(Boolean)
    .join('\u0000')
    .toLowerCase();
}

/**
 * Filters `dogs` by every field in `filters`. `searchIndex`, when given, must
 * be `dogs.map(buildDogSearchText)` — callers on a hot path (typing in the
 * search box) precompute it once per roster change rather than once per
 * keystroke; callers computing a one-off count (view-tab totals) can omit it.
 */
export function filterDogs(
  dogs: readonly Dog[],
  filters: DogFilters,
  searchIndex?: readonly string[]
): Dog[] {
  const query = filters.search.trim().toLowerCase();
  const byStatus = filters.status !== 'all';

  if (!query && !byStatus) return dogs.slice();

  return dogs.filter((dog, i) => {
    if (query) {
      const haystack = searchIndex?.[i] ?? buildDogSearchText(dog);
      if (!haystack.includes(query)) return false;
    }
    if (byStatus && (dog.status ?? 'active') !== filters.status) return false;
    return true;
  });
}

export function hasActiveDogFilters(filters: DogFilters): boolean {
  return filters.search.trim() !== '' || filters.status !== 'all';
}
