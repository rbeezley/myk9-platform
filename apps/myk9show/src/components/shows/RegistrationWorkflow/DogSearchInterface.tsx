import React, { useState, useMemo, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dog, getDogBreedLabel } from '@/types/dog-types';

import { DogSearchFilters } from './DogSearchFilters';
import {
  EMPTY_DOG_FILTERS,
  applyDogFilters,
  countAppliedDogFilters,
  type DogFilterSelection,
} from './dogSearchFilterState';

interface DogSearchInterfaceProps {
  dogs: Dog[];
  /** Canonical search text owned by the server-backed picker. */
  searchQuery?: string;
  onDogsFiltered: (filteredDogs: Dog[]) => void;
  onSearchQueryChange?: (query: string) => void;
  /** Whether any Filter-menu value is ticked, so an empty list can say why. */
  onFiltersAppliedChange?: (applied: boolean) => void;
  placeholder?: string;
  showQuickFilters?: boolean;
  showAdvancedFilters?: boolean;
  className?: string;
}

function matchesSearch(dog: Dog, query: string): boolean {
  return (
    !!dog.callName?.toLowerCase().includes(query) ||
    !!dog.name?.toLowerCase().includes(query) ||
    !!dog.ownerName?.toLowerCase().includes(query) ||
    !!dog.registrations?.some(
      reg =>
        reg.registeredName?.toLowerCase().includes(query) ||
        reg.registrationNumber?.toLowerCase().includes(query)
    ) ||
    getDogBreedLabel(dog).toLowerCase().includes(query) ||
    !!dog.microchip?.toLowerCase().includes(query)
  );
}

export const DogSearchInterface: React.FC<DogSearchInterfaceProps> = ({
  dogs,
  searchQuery: controlledSearchQuery,
  onDogsFiltered,
  onSearchQueryChange,
  onFiltersAppliedChange,
  placeholder = 'Search by call name, breed, owner, or registration number...',
  showQuickFilters = true,
  showAdvancedFilters = true,
  className = '',
}) => {
  const [selection, setSelection] = useState<DogFilterSelection>(EMPTY_DOG_FILTERS);
  const [localSearchQuery, setLocalSearchQuery] = useState('');

  // The parent owns this value when the picker is backed by a server search.
  // Every search-facing surface reads this one value so the input, chip,
  // and visible rows cannot drift across query generations.
  const isSearchControlled = controlledSearchQuery !== undefined;
  const searchQuery = isSearchControlled ? controlledSearchQuery : localSearchQuery;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const updateSearchQuery = (query: string) => {
    if (!isSearchControlled) setLocalSearchQuery(query);
    onSearchQueryChange?.(query);
  };

  const filteredDogs = useMemo(() => {
    const narrowed = applyDogFilters(dogs, selection);
    return normalizedSearchQuery
      ? narrowed.filter(dog => matchesSearch(dog, normalizedSearchQuery))
      : narrowed;
  }, [dogs, normalizedSearchQuery, selection]);

  useEffect(() => {
    onDogsFiltered(filteredDogs);
  }, [filteredDogs, onDogsFiltered]);

  const filtersApplied = countAppliedDogFilters(selection) > 0;
  useEffect(() => {
    onFiltersAppliedChange?.(filtersApplied);
  }, [filtersApplied, onFiltersAppliedChange]);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search Input — filters as you type; no search-history dropdown (MYK9-736). */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder={placeholder}
          value={searchQuery}
          onChange={e => updateSearchQuery(e.target.value)}
          className="pl-10 pr-10 border border-border"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
            aria-label="Clear dog search"
            onClick={() => updateSearchQuery('')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <DogSearchFilters
        dogs={dogs}
        selection={selection}
        onSelectionChange={setSelection}
        showRegistrationFilter={showQuickFilters}
        showDetailFilters={showAdvancedFilters}
        searchQuery={searchQuery}
        onClearAll={() => {
          setSelection(EMPTY_DOG_FILTERS);
          updateSearchQuery('');
        }}
      />
    </div>
  );
};
