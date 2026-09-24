import React, { useState, useMemo, useEffect } from 'react';
import { Search, X, Calendar, Award, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dog, getDogBreedLabel } from '@/types/dog-types';

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
  className = '',
}) => {
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

  // The parent owns this value when the picker is backed by a server search.
  // Every search-facing surface reads this one value so the input, chip,
  // and visible rows cannot drift across query generations.
  const isSearchControlled = controlledSearchQuery !== undefined;
  const searchQuery = isSearchControlled ? controlledSearchQuery : filters.searchQuery;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const updateSearchQuery = (query: string) => {
    if (!isSearchControlled) {
      setFilters(prev => ({ ...prev, searchQuery: query }));
    }
    onSearchQueryChange?.(query);
  };

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
