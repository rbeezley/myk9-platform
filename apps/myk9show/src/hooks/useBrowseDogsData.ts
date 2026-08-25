import { useMemo, useCallback } from 'react';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useRoleBasedDogs } from '@/hooks/useRoleBasedData';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { getDogBreedLabel, getDogDisplayName, type Dog } from '@/types/dog-types';

export interface DogFilters {
  search: string;
  breed: string;
  sex: string;
}

const INITIAL_FILTERS: DogFilters = {
  search: '',
  breed: 'all',
  sex: 'all',
};

// WARNING: a value missing from this list is ERASED, not ignored — the param is
// stripped and the filter falls back to its default. Adding a chip option
// without adding it here does not degrade the deep link, it DESTROYS it.
// `breed` is derived from the roster, so it has no static list to check against.
const ALLOWED_FILTER_VALUES = {
  sex: ['male', 'female'],
} as const;

export interface BrowseDogsData {
  dogs: Dog[];
  filteredDogs: Dog[];
  isLoading: boolean;
  hasError: boolean;
  handleRetry: () => void;
  filters: DogFilters;
  setFilters: React.Dispatch<React.SetStateAction<DogFilters>>;
  hasActiveFilters: boolean;
  clearAllFilters: () => void;
  availableBreeds: string[];
}

export function useBrowseDogsData(): BrowseDogsData {
  const dogs = useRoleBasedDogs();
  const { isLoading, error, refetch } = useDogStoreCompat();

  const hasError = !!error;
  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  // URL-backed so a refresh, back-navigation, or shared link keeps the same
  // result set (MYK9-221). Same [values, setValues] contract as useState.
  const [filters, setFilters] = useUrlFilters<DogFilters>(INITIAL_FILTERS, {
    allowedValues: ALLOWED_FILTER_VALUES,
  });

  // Derive unique breeds from actual data
  const availableBreeds = useMemo(() => {
    const breeds = new Set<string>();
    for (const dog of dogs) {
      const breed = getDogBreedLabel(dog);
      if (breed !== 'Breed not set') breeds.add(breed);
    }
    return [...breeds].sort((a, b) => a.localeCompare(b));
  }, [dogs]);

  // Sorted once per data change, NOT per keystroke. The sort does not depend on
  // `filters` at all, but it used to sit at the end of the filter memo, so every
  // character typed re-ran an O(n log n) pass of `localeCompare` (~100x the cost
  // of a plain comparison) over the whole roster. Filtering preserves order, so
  // sorting first is equivalent.
  const sortedDogs = useMemo(
    () =>
      [...dogs].sort((a, b) =>
        (getDogDisplayName(a) || '').localeCompare(getDogDisplayName(b) || '')
      ),
    [dogs]
  );

  // Lowercased once per roster change rather than once per dog per keystroke.
  // Joined on an escaped NUL, which cannot appear in typed input, so a query
  // still cannot match across a field boundary — preserving the original
  // "any one field contains the query" semantics rather than widening them.
  const searchIndex = useMemo(
    () =>
      sortedDogs.map(dog =>
        [dog.callName, dog.name, getDogBreedLabel(dog), dog.ownerName]
          .filter(Boolean)
          .join('\u0000')
          .toLowerCase()
      ),
    [sortedDogs]
  );

  // Filter by search, breed, and sex.
  const filteredDogs = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const byBreed = filters.breed !== 'all';
    const bySex = filters.sex !== 'all';
    if (!query && !byBreed && !bySex) return sortedDogs;

    return sortedDogs.filter((dog, i) => {
      if (query && !searchIndex[i]?.includes(query)) return false;
      if (byBreed && getDogBreedLabel(dog) !== filters.breed) return false;
      if (bySex && dog.sex !== filters.sex) return false;
      return true;
    });
  }, [sortedDogs, searchIndex, filters]);

  const hasActiveFilters =
    filters.search.trim() !== '' || filters.breed !== 'all' || filters.sex !== 'all';

  const clearAllFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
  }, [setFilters]);

  return {
    dogs,
    filteredDogs,
    isLoading,
    hasError,
    handleRetry,
    filters,
    setFilters,
    hasActiveFilters,
    clearAllFilters,
    availableBreeds,
  };
}
