import { useState, useMemo, useCallback } from 'react';
import { useRoleBasedDogs } from '@/hooks/useRoleBasedData';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { getDogDisplayName, type Dog } from '@/types/dog-types';

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

  const [filters, setFilters] = useState<DogFilters>(INITIAL_FILTERS);

  // Derive unique breeds from actual data
  const availableBreeds = useMemo(() => {
    const breeds = new Set<string>();
    for (const dog of dogs) {
      if (dog.breed) breeds.add(dog.breed);
    }
    return [...breeds].sort((a, b) => a.localeCompare(b));
  }, [dogs]);

  // Filter dogs by search, breed, and sex
  const filteredDogs = useMemo(() => {
    let result = dogs;

    // Search filter: match call name, breed, owner name, or registered name
    if (filters.search.trim()) {
      const query = filters.search.toLowerCase().trim();
      result = result.filter(
        dog =>
          dog.callName?.toLowerCase().includes(query) ||
          dog.name?.toLowerCase().includes(query) ||
          dog.breed?.toLowerCase().includes(query) ||
          dog.ownerName?.toLowerCase().includes(query)
      );
    }

    // Breed filter
    if (filters.breed !== 'all') {
      result = result.filter(dog => dog.breed === filters.breed);
    }

    // Sex filter
    if (filters.sex !== 'all') {
      result = result.filter(dog => dog.sex === filters.sex);
    }

    // Sort alphabetically by call name
    return [...result].sort((a, b) =>
      (getDogDisplayName(a) || '').localeCompare(getDogDisplayName(b) || '')
    );
  }, [dogs, filters]);

  const hasActiveFilters =
    filters.search.trim() !== '' || filters.breed !== 'all' || filters.sex !== 'all';

  const clearAllFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
  }, []);

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
