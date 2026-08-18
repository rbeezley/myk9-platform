import React from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dog } from '@/types/dog-types';

export interface SearchFilters {
  searchQuery: string;
  breedFilter: string;
  genderFilter: string;
  registrationFilter: string;
  ageFilter: string;
  quickFilter: string;
}

export interface QuickFilter {
  id: string;
  label: string;
  icon: React.ReactNode;
  filter: (dogs: Dog[]) => Dog[];
  description: string;
}

export interface DogFilterOptions {
  breeds: string[];
  genders: Array<'Male' | 'Female'>;
  organizations: string[];
  ageGroups: Array<{ value: string; label: string }>;
}

interface DogSearchFiltersProps {
  filters: SearchFilters;
  setFilters: React.Dispatch<React.SetStateAction<SearchFilters>>;
  quickFilters: QuickFilter[];
  filterOptions: DogFilterOptions;
  showQuickFilters: boolean;
  showAdvancedFilters: boolean;
  showAdvanced: boolean;
  setShowAdvanced: React.Dispatch<React.SetStateAction<boolean>>;
  activeFilterCount: number;
  hasActiveFilters: boolean;
  clearAllFilters: () => void;
  onSearchQueryChange?: ((query: string) => void) | undefined;
}

export function DogSearchFilters({
  filters,
  setFilters,
  quickFilters,
  filterOptions,
  showQuickFilters,
  showAdvancedFilters,
  showAdvanced,
  setShowAdvanced,
  activeFilterCount,
  hasActiveFilters,
  clearAllFilters,
  onSearchQueryChange,
}: DogSearchFiltersProps) {
  return (
    <>
      {(showQuickFilters || showAdvancedFilters) && (
        <div className="flex flex-wrap items-center gap-2">
          {showQuickFilters &&
            quickFilters.map(quickFilter => (
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

          {showAdvancedFilters && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 ml-auto"
              >
                <Filter className="h-4 w-4" />
                Advanced Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="text-destructive "
                >
                  Clear All
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {showAdvanced && showAdvancedFilters && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg border border-border">
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

          <div className="space-y-2">
            <label className="text-sm font-medium">Registry</label>
            <Select
              value={filters.registrationFilter}
              onValueChange={value => setFilters(prev => ({ ...prev, registrationFilter: value }))}
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
    </>
  );
}
