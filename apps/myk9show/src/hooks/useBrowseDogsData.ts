import { useMemo, useCallback } from 'react';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useRoleBasedDogs } from '@/hooks/useRoleBasedData';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { getDogDisplayName, type Dog } from '@/types/dog-types';
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
const ALLOWED_FILTER_VALUES = {
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
  };
}
