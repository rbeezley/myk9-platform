import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Calendar, Award, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dog, getDogBreedLabel } from '@/types/dog-types';
import { useDebounce } from '@myk9/scoring-ui';
import { useRecentSearches } from '@/hooks/useRecentSearches';
import { SearchSuggestions } from '@/components/common/RecentSearches';

import { DogSearchFilters, type QuickFilter, type SearchFilters } from './DogSearchFilters';

interface DogSearchInterfaceProps {
  dogs: Dog[];
  /** Canonical search text owned by the server-backed picker. */
  searchQuery?: string;
  onDogsFiltered: (filteredDogs: Dog[]) => void;
  onSearchQueryChange?: (query: string) => void;
  onActiveFilterChange?: (activeFilter: string) => void;
  placeholder?: string;
  showQuickFilters?: boolean;
  showAdvancedFilters?: boolean;
  enablePersistence?: boolean;
  className?: string;
}

export const DogSearchInterface: React.FC<DogSearchInterfaceProps> = ({
  dogs,
  searchQuery: controlledSearchQuery,
  onDogsFiltered,
  onSearchQueryChange,
  onActiveFilterChange,
  placeholder = 'Search by call name, breed, owner, or reg #...',
  showQuickFilters = true,
  showAdvancedFilters = true,
  enablePersistence = true,
  className = '',
}) => {
  // Recent searches hook
  const { addSearch, getSuggestions, getFrequentSearches } = useRecentSearches({ context: 'dogs' });

  // Search and filter state
  const [filters, setFilters] = useState<SearchFilters>({
    searchQuery: '',
    breedFilter: '',
    genderFilter: '',
    registrationFilter: '',
    ageFilter: '',
    quickFilter: '',
  });

  // Advanced filters visibility
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Search suggestions state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // The parent owns this value when the picker is backed by a server search.
  // Every search-facing surface reads this one value so the input, chip,
  // suggestions, and visible rows cannot drift across query generations.
  const isSearchControlled = controlledSearchQuery !== undefined;
  const searchQuery = isSearchControlled ? controlledSearchQuery : filters.searchQuery;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const updateSearchQuery = (query: string) => {
    if (!isSearchControlled) {
      setFilters(prev => ({ ...prev, searchQuery: query }));
    }
    onSearchQueryChange?.(query);
  };

  // Debounce only persistence analytics; filtering itself follows the same
  // normalized query that identifies the server request.
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Quick filters for common use cases
  const quickFilters: QuickFilter[] = useMemo(
    () => [
      {
        id: 'recent',
        label: 'Recent',
        icon: <Calendar className="h-4 w-4" />,
        description: 'Dogs with recent registrations',
        filter: dogs => {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          return dogs.filter(dog =>
            dog.registrations?.some(
              reg => reg.registrationDate && new Date(reg.registrationDate) > thirtyDaysAgo
            )
          );
        },
      },
      {
        id: 'registered',
        label: 'Registered',
        icon: <Award className="h-4 w-4" />,
        description: 'Dogs with at least one registration',
        filter: dogs => dogs.filter(dog => dog.registrations && dog.registrations.length > 0),
      },
      {
        id: 'unregistered',
        label: 'Unregistered',
        icon: <AlertCircle className="h-4 w-4" />,
        description: 'Dogs without any registrations',
        filter: dogs => dogs.filter(dog => !dog.registrations || dog.registrations.length === 0),
      },
    ],
    []
  );

  // Normalize org names like "AKC (American Kennel Club)" → "AKC"
  const normalizeOrg = (org: string): string => {
    const match = org.match(/^(\w+)\s*\(/);
    return match ? match[1] : org;
  };

  // Get unique filter options from the dog data
  const filterOptions = useMemo(() => {
    return {
      breeds: [
        ...new Set(
          dogs
            .map(dog => getDogBreedLabel(dog))
            .filter((breed): breed is string => Boolean(breed) && breed !== 'Breed not set')
        ),
      ].sort(),
      genders: [
        ...new Set(
          dogs
            .map(dog => dog.gender)
            .filter((gender): gender is 'Male' | 'Female' => Boolean(gender) && gender !== '')
        ),
      ].sort(),
      organizations: [
        ...new Set(
          dogs
            .flatMap(dog => dog.registrations?.map(reg => normalizeOrg(reg.organization)) || [])
            .filter((org): org is string => Boolean(org))
        ),
      ].sort(),
      ageGroups: [
        { value: 'puppy', label: 'Puppy (0-18 months)' },
        { value: 'young', label: 'Young Adult (18 months - 5 years)' },
        { value: 'adult', label: 'Adult (5-7 years)' },
        { value: 'senior', label: 'Senior (7+ years)' },
      ],
    };
  }, [dogs]);

  // Apply all filters to the dog data
  const filteredDogs = useMemo(() => {
    let filtered = [...dogs];

    // Apply quick filter first
    if (filters.quickFilter) {
      const quickFilter = quickFilters.find(qf => qf.id === filters.quickFilter);
      if (quickFilter) {
        filtered = quickFilter.filter(filtered);
      }
    }

    // Apply search query
    if (normalizedSearchQuery) {
      const query = normalizedSearchQuery;
      filtered = filtered.filter(dog => {
        return (
          dog.callName?.toLowerCase().includes(query) ||
          dog.name?.toLowerCase().includes(query) ||
          dog.ownerName?.toLowerCase().includes(query) ||
          dog.registrations?.some(
            reg =>
              reg.registeredName?.toLowerCase().includes(query) ||
              reg.registrationNumber?.toLowerCase().includes(query)
          ) ||
          getDogBreedLabel(dog).toLowerCase().includes(query) ||
          (dog.microchip && dog.microchip.toLowerCase().includes(query))
        );
      });
    }

    // Apply breed filter
    if (filters.breedFilter) {
      filtered = filtered.filter(dog => getDogBreedLabel(dog) === filters.breedFilter);
    }

    // Apply gender filter
    if (filters.genderFilter) {
      filtered = filtered.filter(dog => dog.gender === filters.genderFilter);
    }

    // Apply registration filter (normalize to match both "AKC" and "AKC (American Kennel Club)")
    if (filters.registrationFilter) {
      filtered = filtered.filter(dog =>
        dog.registrations?.some(
          reg => normalizeOrg(reg.organization) === filters.registrationFilter
        )
      );
    }

    // Apply age filter
    if (filters.ageFilter) {
      filtered = filtered.filter(dog => {
        if (!dog.dateOfBirth) return false;
        const ageInMonths =
          (new Date().getTime() - new Date(dog.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 30);
        switch (filters.ageFilter) {
          case 'puppy':
            return ageInMonths < 18;
          case 'young':
            return ageInMonths >= 18 && ageInMonths < 60;
          case 'adult':
            return ageInMonths >= 60 && ageInMonths < 84;
          case 'senior':
            return ageInMonths >= 84;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [dogs, normalizedSearchQuery, filters, quickFilters]);

  // Notify parent component when filtered dogs change
  React.useEffect(() => {
    onDogsFiltered(filteredDogs);
  }, [filteredDogs, onDogsFiltered]);

  // Notify parent component when active filter changes
  useEffect(() => {
    onActiveFilterChange?.(filters.quickFilter);
  }, [filters.quickFilter, onActiveFilterChange]);

  // Track search completion and add to recent searches
  const searchKey = `${normalizedSearchQuery}-${filteredDogs.length}`;
  const prevSearchKeyRef = useRef(searchKey);
  useEffect(() => {
    if (
      searchKey !== prevSearchKeyRef.current &&
      debouncedSearchQuery.trim() &&
      enablePersistence
    ) {
      prevSearchKeyRef.current = searchKey;
      addSearch(debouncedSearchQuery, {
        resultCount: filteredDogs.length,
        filters: {
          breed: filters.breedFilter,
          gender: filters.genderFilter,
          registration: filters.registrationFilter,
          age: filters.ageFilter,
          quick: filters.quickFilter,
        },
      });
    }
  }, [searchKey, debouncedSearchQuery, enablePersistence, filteredDogs.length, addSearch, filters]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const defaultFilters: SearchFilters = {
    searchQuery: '',
    breedFilter: '',
    genderFilter: '',
    registrationFilter: '',
    ageFilter: '',
    quickFilter: '',
  };

  const clearAllFilters = () => {
    setFilters(defaultFilters);
    updateSearchQuery('');
  };

  const hasActiveFilters =
    searchQuery !== '' ||
    filters.breedFilter !== '' ||
    filters.genderFilter !== '' ||
    filters.registrationFilter !== '' ||
    filters.ageFilter !== '' ||
    filters.quickFilter !== '';
  const activeFilterCount = [
    searchQuery,
    filters.breedFilter,
    filters.genderFilter,
    filters.registrationFilter,
    filters.ageFilter,
    filters.quickFilter,
  ].filter(v => v !== '').length;

  // Get suggestions for current query
  const currentSuggestions = getSuggestions(searchQuery, 5);
  const frequentSearches = getFrequentSearches(3);

  const handleSearchSelect = (query: string) => {
    updateSearchQuery(query);
    setShowSuggestions(false);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search Input */}
      <Popover
        modal={false}
        open={
          showSuggestions &&
          (currentSuggestions.length > 0 || (!searchQuery && frequentSearches.length > 0))
        }
        onOpenChange={setShowSuggestions}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <PopoverTrigger asChild>
            <Input
              ref={searchInputRef}
              placeholder={placeholder}
              value={searchQuery}
              onChange={e => {
                const newQuery = e.target.value;
                updateSearchQuery(newQuery);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onClick={() => setShowSuggestions(true)}
              role="combobox"
              aria-expanded={showSuggestions}
              aria-controls="dog-search-suggestions"
              aria-autocomplete="list"
              className="pl-10 pr-10 border border-border"
            />
          </PopoverTrigger>
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
              aria-label="Clear dog search"
              onClick={() => {
                updateSearchQuery('');
                setShowSuggestions(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          {/* Search Suggestions */}
          {showSuggestions &&
            (currentSuggestions.length > 0 || (!searchQuery && frequentSearches.length > 0)) && (
              <PopoverContent
                id="dog-search-suggestions"
                align="start"
                initialFocus={() => false}
                className="w-[var(--anchor-width)] max-h-[min(24rem,var(--available-height))] overflow-y-auto p-0"
                role="listbox"
              >
                <SearchSuggestions
                  suggestions={currentSuggestions}
                  currentQuery={searchQuery}
                  onSuggestionSelect={handleSearchSelect}
                  frequentSearches={frequentSearches}
                />
              </PopoverContent>
            )}
        </div>
      </Popover>

      <DogSearchFilters
        filters={isSearchControlled ? { ...filters, searchQuery } : filters}
        setFilters={setFilters}
        quickFilters={quickFilters}
        filterOptions={filterOptions}
        showQuickFilters={showQuickFilters}
        showAdvancedFilters={showAdvancedFilters}
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
        activeFilterCount={activeFilterCount}
        hasActiveFilters={hasActiveFilters}
        clearAllFilters={clearAllFilters}
        onSearchQueryChange={updateSearchQuery}
      />
    </div>
  );
};
