import { useMemo, useCallback } from 'react';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useRoleBasedDogs } from '@/hooks/useRoleBasedData';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { getDogBreedLabel, getDogDisplayName, type Dog } from '@/types/dog-types';
import {
  buildDogSearchText,
  DEFAULT_DOG_FILTERS,
  filterDogs,
  hasActiveDogFilters,
  type DogFilters,
} from '@/components/dogs/browse/dogBrowseFilters';

export type { DogFilters };

// WARNING: a value missing from this list is ERASED, not ignored — the param is
// stripped and the filter falls back to its default. Adding a chip option
// without adding it here does not degrade the deep link, it DESTROYS it.
// `breed` and `owner` are derived from the roster, so they have no static
// list to check against.
const ALLOWED_FILTER_VALUES = {
  sex: ['male', 'female'],
  status: ['active', 'retired', 'deceased'],
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
  availableOwners: string[];
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
  const [filters, setFilters] = useUrlFilters<DogFilters>(DEFAULT_DOG_FILTERS, {
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

  // Staff-only filter field (`dogBrowseFilterFields.ts` gates its rendering);
  // harmless to compute unconditionally since it's just names off the roster
  // this call already has.
  const availableOwners = useMemo(() => {
    const owners = new Set<string>();
    for (const dog of dogs) {
      if (dog.ownerName) owners.add(dog.ownerName);
    }
    return [...owners].sort((a, b) => a.localeCompare(b));
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
  const searchIndex = useMemo(() => sortedDogs.map(buildDogSearchText), [sortedDogs]);

  const filteredDogs = useMemo(
    () => filterDogs(sortedDogs, filters, searchIndex),
    [sortedDogs, searchIndex, filters]
  );

  const hasActiveFilters = hasActiveDogFilters(filters);

  const clearAllFilters = useCallback(() => {
    setFilters(DEFAULT_DOG_FILTERS);
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
    availableOwners,
  };
}
