import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Filter, X, Users, Calendar, Award } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dog } from '@/types/dog-types';
import { useDebounce } from '@myk9/scoring-ui';
import { useRecentSearches } from '@/hooks/useRecentSearches';
import { SearchSuggestions, RecentSearches } from '@/components/common/RecentSearches';
import { SearchPerformanceIndicator } from '@/components/common/SearchPerformanceMonitor';

interface DogSearchInterfaceProps {
  dogs: Dog[];
  onDogsFiltered: (filteredDogs: Dog[]) => void;
  onSearchQueryChange?: (query: string) => void;
  placeholder?: string;
  showQuickFilters?: boolean;
  showAdvancedFilters?: boolean;
  enablePersistence?: boolean;
  className?: string;
}

interface SearchFilters {
  searchQuery: string;
  breedFilter: string;
  genderFilter: string;
  registrationFilter: string;
  ageFilter: string;
  quickFilter: string;
}

interface QuickFilter {
  id: string;
  label: string;
  icon: React.ReactNode;
  filter: (dogs: Dog[]) => Dog[];
  description: string;
}

export const DogSearchInterface: React.FC<DogSearchInterfaceProps> = ({
  dogs,
  onDogsFiltered,
  onSearchQueryChange,
  placeholder = 'Search by name, registered name, breed, or registration number...',
  showQuickFilters = true,
  showAdvancedFilters = true,
  enablePersistence = true,
  className = '',
}) => {
  // Recent searches hook
  const {
    recentSearches,
    addSearch,
    removeSearch,
    clearSearches,
    getSuggestions,
    getFrequentSearches,
  } = useRecentSearches({ context: 'dogs' });

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
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Performance tracking
  const searchStartTimeRef = useRef(0);
  const [searchResponseTime, setSearchResponseTime] = useState(0);

  // Debounced search query for performance
  const debouncedSearchQuery = useDebounce(filters.searchQuery, 300);

  // Derive isSearching from query state - searching when there's a pending debounced query
  const isSearching =
    filters.searchQuery.trim() !== '' && filters.searchQuery !== debouncedSearchQuery;

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
        description: 'Dogs with active registrations',
        filter: dogs => dogs.filter(dog => dog.registrations?.some(reg => reg.status === 'Active')),
      },
      {
        id: 'puppies',
        label: 'Puppies',
        icon: <Users className="h-4 w-4" />,
        description: 'Dogs under 18 months old',
        filter: dogs =>
          dogs.filter(dog => {
            if (!dog.dateOfBirth) return false;
            const ageInMonths =
              (new Date().getTime() - new Date(dog.dateOfBirth).getTime()) /
              (1000 * 60 * 60 * 24 * 30);
            return ageInMonths < 18;
          }),
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
            .map(dog => dog.registrations?.[0]?.breed)
            .filter((breed): breed is string => Boolean(breed))
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
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(dog => {
        return (
          dog.callName?.toLowerCase().includes(query) ||
          dog.name?.toLowerCase().includes(query) ||
          dog.registrations?.some(
            reg =>
              reg.registeredName?.toLowerCase().includes(query) ||
              reg.registrationNumber?.toLowerCase().includes(query)
          ) ||
          dog.registrations?.[0]?.breed?.toLowerCase().includes(query) ||
          (dog.microchip && dog.microchip.toLowerCase().includes(query))
        );
      });
    }

    // Apply breed filter
    if (filters.breedFilter) {
      filtered = filtered.filter(dog => dog.registrations?.[0]?.breed === filters.breedFilter);
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
  }, [dogs, debouncedSearchQuery, filters, quickFilters]);

  // Notify parent component when filtered dogs change
  React.useEffect(() => {
    onDogsFiltered(filteredDogs);
  }, [filteredDogs, onDogsFiltered]);

  // Track search start time using ref (no setState needed)
  useEffect(() => {
    if (debouncedSearchQuery.trim()) {
      searchStartTimeRef.current = Date.now();
    }
  }, [debouncedSearchQuery]);

  // Track search completion and add to recent searches
  const searchKey = `${debouncedSearchQuery}-${filteredDogs.length}`;
  const prevSearchKeyRef = useRef(searchKey);
  useEffect(() => {
    if (
      searchKey !== prevSearchKeyRef.current &&
      debouncedSearchQuery.trim() &&
      enablePersistence
    ) {
      prevSearchKeyRef.current = searchKey;
      const endTime = Date.now();
      const responseTime =
        searchStartTimeRef.current > 0 ? endTime - searchStartTimeRef.current : 0;

      // Use queueMicrotask to defer state update (avoids synchronous setState in effect)
      queueMicrotask(() => {
        setSearchResponseTime(responseTime);
      });

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

  const clearAllFilters = () => {
    setFilters({
      searchQuery: '',
      breedFilter: '',
      genderFilter: '',
      registrationFilter: '',
      ageFilter: '',
      quickFilter: '',
    });
    onSearchQueryChange?.('');
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== '');
  const activeFilterCount = Object.values(filters).filter(value => value !== '').length;

  // Get suggestions for current query
  const currentSuggestions = getSuggestions(filters.searchQuery, 5);
  const frequentSearches = getFrequentSearches(3);

  const handleSearchSelect = (query: string) => {
    setFilters(prev => ({ ...prev, searchQuery: query }));
    onSearchQueryChange?.(query);
    setShowSuggestions(false);
  };

  return (
    <Card className={`${className}`}>
      <CardContent className="p-4 space-y-4">
        {/* Search Input */}
        <div className="relative" ref={searchInputRef}>
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder={placeholder}
            value={filters.searchQuery}
            onChange={e => {
              const newQuery = e.target.value;
              setFilters(prev => ({ ...prev, searchQuery: newQuery }));
              onSearchQueryChange?.(newQuery);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            className="pl-10 pr-10"
          />
          {filters.searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
              onClick={() => {
                setFilters(prev => ({ ...prev, searchQuery: '' }));
                onSearchQueryChange?.('');
                setShowSuggestions(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          {/* Search Suggestions */}
          {showSuggestions &&
            (currentSuggestions.length > 0 ||
              (!filters.searchQuery && frequentSearches.length > 0)) && (
              <SearchSuggestions
                suggestions={currentSuggestions}
                currentQuery={filters.searchQuery}
                onSuggestionSelect={handleSearchSelect}
                frequentSearches={frequentSearches}
              />
            )}
        </div>

        {/* Quick Filters */}
        {showQuickFilters && (
          <div className="flex flex-wrap gap-2">
            {quickFilters.map(quickFilter => (
              <Button
                key={quickFilter.id}
                variant={filters.quickFilter === quickFilter.id ? 'default' : 'outline'}
                size="sm"
                onClick={() =>
                  setFilters(prev => ({
                    ...prev,
                    quickFilter: prev.quickFilter === quickFilter.id ? '' : quickFilter.id,
                  }))
                }
                className="flex items-center gap-2"
                title={quickFilter.description}
              >
                {quickFilter.icon}
                {quickFilter.label}
              </Button>
            ))}
          </div>
        )}

        {/* Advanced Filters Toggle */}
        {showAdvancedFilters && (
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              Advanced Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-red-600 hover:text-red-700"
              >
                Clear All
              </Button>
            )}
          </div>
        )}

        {/* Advanced Filter Controls */}
        {showAdvanced && showAdvancedFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
            {/* Breed Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Breed</label>
              <Select
                value={filters.breedFilter}
                onValueChange={value => setFilters(prev => ({ ...prev, breedFilter: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Breeds" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Breeds</SelectItem>
                  {filterOptions.breeds.map(breed => (
                    <SelectItem key={breed} value={breed}>
                      {breed}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Gender Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Gender</label>
              <Select
                value={filters.genderFilter}
                onValueChange={value => setFilters(prev => ({ ...prev, genderFilter: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Genders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Genders</SelectItem>
                  {filterOptions.genders.map(gender => (
                    <SelectItem key={gender} value={gender || ''}>
                      {gender}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Registration Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Registry</label>
              <Select
                value={filters.registrationFilter}
                onValueChange={value =>
                  setFilters(prev => ({ ...prev, registrationFilter: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Registries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Registries</SelectItem>
                  {filterOptions.organizations.map(org => (
                    <SelectItem key={org} value={org}>
                      {org}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Age Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Age Group</label>
              <Select
                value={filters.ageFilter}
                onValueChange={value => setFilters(prev => ({ ...prev, ageFilter: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Ages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Ages</SelectItem>
                  {filterOptions.ageGroups.map(ageGroup => (
                    <SelectItem key={ageGroup.value} value={ageGroup.value}>
                      {ageGroup.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2">
            {filters.searchQuery && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Search: "{filters.searchQuery}"
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => {
                    setFilters(prev => ({ ...prev, searchQuery: '' }));
                    onSearchQueryChange?.('');
                  }}
                />
              </Badge>
            )}
            {filters.quickFilter && (
              <Badge variant="secondary" className="flex items-center gap-1">
                {quickFilters.find(qf => qf.id === filters.quickFilter)?.label}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setFilters(prev => ({ ...prev, quickFilter: '' }))}
                />
              </Badge>
            )}
            {filters.breedFilter && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Breed: {filters.breedFilter}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setFilters(prev => ({ ...prev, breedFilter: '' }))}
                />
              </Badge>
            )}
            {filters.genderFilter && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Gender: {filters.genderFilter}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setFilters(prev => ({ ...prev, genderFilter: '' }))}
                />
              </Badge>
            )}
            {filters.registrationFilter && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Registry: {filters.registrationFilter}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setFilters(prev => ({ ...prev, registrationFilter: '' }))}
                />
              </Badge>
            )}
            {filters.ageFilter && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Age: {filterOptions.ageGroups.find(ag => ag.value === filters.ageFilter)?.label}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setFilters(prev => ({ ...prev, ageFilter: '' }))}
                />
              </Badge>
            )}
          </div>
        )}

        {/* Results Summary */}
        <div className="text-sm text-gray-600 flex items-center justify-between">
          <span>
            Showing {filteredDogs.length} of {dogs.length} dog{dogs.length !== 1 ? 's' : ''}
          </span>
          {enablePersistence && recentSearches.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setShowRecentSearches(!showRecentSearches)}
            >
              {showRecentSearches ? 'Hide' : 'Show'} Recent Searches
            </Button>
          )}
        </div>

        {/* Performance Indicator */}
        {debouncedSearchQuery.trim() && (
          <SearchPerformanceIndicator
            isSearching={isSearching}
            responseTime={searchResponseTime}
            cacheHit={false} // This would be true if we had actual caching
            resultCount={filteredDogs.length}
          />
        )}

        {/* Recent Searches Panel */}
        {enablePersistence && showRecentSearches && (
          <RecentSearches
            recentSearches={recentSearches}
            onSearchSelect={handleSearchSelect}
            onSearchRemove={removeSearch}
            onClearAll={clearSearches}
            maxItems={5}
            className="mt-4"
          />
        )}
      </CardContent>
    </Card>
  );
};
