import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Search, Filter, X, Dog, Users, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { LazyDogCard } from '../../dogs/LazyDogCard';
import { useLazyLoading } from '../../../hooks/useLazyLoading';
import { LazyLoadTrigger } from '../../common/LazyLoadTrigger';
import { useDebounce } from '@myk9/scoring-ui';
import { useDogStoreCompat } from '../../../hooks/useDogStoreCompat';
import { motion, AnimatePresence } from 'framer-motion';

interface LazyDogSelectionStepProps {
  selectedDogs: string[];
  onSelectionChange: (dogs: string[]) => void;
  showId: string;
  maxSelections?: number;
  allowBulkOperations?: boolean;
}

interface DogFilters {
  breed?: string;
  gender?: string;
  ageGroup?: string;
  registrationOrg?: string;
  searchQuery?: string;
}

export function LazyDogSelectionStep({
  selectedDogs,
  onSelectionChange,
  maxSelections = 10,
  allowBulkOperations = false,
}: LazyDogSelectionStepProps) {
  const [filters, setFilters] = useState<DogFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);

  const { dogs: allDogs } = useDogStoreCompat();
  const debouncedSearchQuery = useDebounce(filters.searchQuery || '', 300);

  // Create lazy loading data source
  const dogDataSource = useMemo(
    () => ({
      fetchBatch: async (offset: number, limit: number) => {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // Apply filters to all dogs
        let filteredDogs = allDogs.filter(dog => !dog.status || dog.status === 'active');

        if (debouncedSearchQuery) {
          const query = debouncedSearchQuery.toLowerCase();
          filteredDogs = filteredDogs.filter(
            dog =>
              dog.callName?.toLowerCase().includes(query) ||
              dog.name.toLowerCase().includes(query) ||
              dog.registrations?.[0]?.breed?.toLowerCase().includes(query)
          );
        }

        if (filters.breed) {
          filteredDogs = filteredDogs.filter(
            dog => dog.registrations?.[0]?.breed === filters.breed
          );
        }

        if (filters.gender) {
          filteredDogs = filteredDogs.filter(dog => dog.gender === filters.gender);
        }

        if (filters.ageGroup) {
          const today = new Date();
          filteredDogs = filteredDogs.filter(dog => {
            const age =
              today.getFullYear() - new Date(dog.dateOfBirth || '1990-01-01').getFullYear();
            switch (filters.ageGroup) {
              case 'puppy':
                return age < 2;
              case 'adult':
                return age >= 2 && age < 8;
              case 'senior':
                return age >= 8;
              default:
                return true;
            }
          });
        }

        // Simulate pagination
        const startIndex = offset;
        const endIndex = Math.min(offset + limit, filteredDogs.length);
        const items = filteredDogs.slice(startIndex, endIndex);

        return {
          items,
          totalCount: filteredDogs.length,
        };
      },
      getItemById: async (id: string) => {
        // Simulate API call for individual dog
        await new Promise(resolve => setTimeout(resolve, 200));
        return allDogs.find(dog => dog.id === id) || null;
      },
      cacheKey: `dogs-${JSON.stringify(filters)}`,
    }),
    [allDogs, filters, debouncedSearchQuery]
  );

  // Use lazy loading hook
  const {
    items: lazyDogs,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    isEmpty,
    isInitialLoad,
    totalCount,
    loadedCount,
  } = useLazyLoading(dogDataSource, {
    batchSize: 20,
    prefetch: true,
    enableCache: true,
    debug: process.env.NODE_ENV === 'development',
  });

  // Get unique filter options from all dogs
  const filterOptions = useMemo(() => {
    const breeds = [
      ...new Set(
        allDogs
          .map(dog => dog.registrations?.[0]?.breed)
          .filter((breed): breed is string => Boolean(breed))
      ),
    ].sort();
    const genders = [
      ...new Set(
        allDogs
          .map(dog => dog.gender)
          .filter((gender): gender is 'Male' | 'Female' => Boolean(gender) && gender !== '')
      ),
    ].sort();

    return { breeds, genders };
  }, [allDogs]);

  // Handle dog selection
  const handleDogSelect = useCallback(
    (dogId: string) => {
      if (selectedDogs.length >= maxSelections) {
        return; // Don't allow more selections
      }
      onSelectionChange([...selectedDogs, dogId]);
    },
    [selectedDogs, maxSelections, onSelectionChange]
  );

  const handleDogDeselect = useCallback(
    (dogId: string) => {
      onSelectionChange(selectedDogs.filter(id => id !== dogId));
    },
    [selectedDogs, onSelectionChange]
  );

  // Handle bulk operations
  const handleSelectAll = () => {
    const visibleDogIds = lazyDogs.map(dog => dog.id);
    const newSelections = [...new Set([...selectedDogs, ...visibleDogIds])].slice(0, maxSelections);
    onSelectionChange(newSelections);
  };

  const handleDeselectAll = () => {
    const visibleDogIds = new Set(lazyDogs.map(dog => dog.id));
    const remainingSelections = selectedDogs.filter(id => !visibleDogIds.has(id));
    onSelectionChange(remainingSelections);
  };

  // Handle filter changes
  const handleFilterChange = (key: keyof DogFilters, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  // Refresh when filters change
  React.useEffect(() => {
    refresh();
  }, [filters, refresh]);

  const selectedCount = selectedDogs.length;
  const hasFilters = Object.values(filters).some(value => value);

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Select Dogs</h2>
          <p className="text-muted-foreground">
            Choose dogs to register for this show ({selectedCount}/{maxSelections} selected)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {totalCount > 0 && (
            <Badge variant="outline">
              Showing {loadedCount} of {totalCount} dogs
            </Badge>
          )}

          {allowBulkOperations && (
            <Button variant="outline" size="sm" onClick={() => setBulkSelectMode(!bulkSelectMode)}>
              {bulkSelectMode ? 'Exit Bulk Mode' : 'Bulk Select'}
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Search & Filter</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-2" />
              Filters {hasFilters && `(${Object.values(filters).filter(Boolean).length})`}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, breed, or registration..."
              value={filters.searchQuery || ''}
              onChange={e => handleFilterChange('searchQuery', e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Expandable Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Breed</label>
                    <Select
                      value={filters.breed || ''}
                      onValueChange={value => handleFilterChange('breed', value || undefined)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any breed" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any breed</SelectItem>
                        {filterOptions.breeds.map(breed => (
                          <SelectItem key={breed} value={breed}>
                            {breed}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1 block">Gender</label>
                    <Select
                      value={filters.gender || ''}
                      onValueChange={value => handleFilterChange('gender', value || undefined)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any gender</SelectItem>
                        {filterOptions.genders.map(gender => (
                          <SelectItem key={gender} value={gender || 'Unknown'}>
                            {gender}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1 block">Age Group</label>
                    <Select
                      value={filters.ageGroup || ''}
                      onValueChange={value => handleFilterChange('ageGroup', value || undefined)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any age" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any age</SelectItem>
                        <SelectItem value="puppy">Puppy (under 2)</SelectItem>
                        <SelectItem value="adult">Adult (2-7)</SelectItem>
                        <SelectItem value="senior">Senior (8+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearFilters}
                      disabled={!hasFilters}
                      className="w-full"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Bulk Operations */}
      {allowBulkOperations && bulkSelectMode && lazyDogs.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge variant="secondary">Bulk Mode</Badge>
                <span className="text-sm">
                  {selectedCount} of {maxSelections} dogs selected
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={selectedCount >= maxSelections}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Select Visible
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                  <X className="h-4 w-4 mr-2" />
                  Deselect Visible
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dog List */}
      <div className="space-y-4">
        {/* Initial Loading */}
        {isInitialLoad && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Loading dogs...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="py-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">Failed to load dogs</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button variant="outline" size="sm" onClick={refresh} className="mt-3">
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {isEmpty && !loading && (
          <Card className="border-dashed">
            <CardContent className="py-12">
              <div className="text-center">
                <Dog className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-medium mb-2">No dogs found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {hasFilters
                    ? 'Try adjusting your search filters'
                    : 'No dogs are available for registration'}
                </p>
                {hasFilters && (
                  <Button variant="outline" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dog Grid */}
        {lazyDogs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {lazyDogs.map(dog => (
                <LazyDogCard
                  key={dog.id}
                  dogId={dog.id}
                  selected={selectedDogs.includes(dog.id)}
                  onSelect={handleDogSelect}
                  onDeselect={handleDogDeselect}
                  showDetails={true}
                  lazyMode={true}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Load More Trigger */}
        <LazyLoadTrigger onLoadMore={loadMore} hasMore={hasMore} loading={loading} />
      </div>

      {/* Selection Summary */}
      {selectedCount > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  {selectedCount} dog{selectedCount !== 1 ? 's' : ''} selected
                </span>
              </div>

              {selectedCount >= maxSelections && <Badge variant="secondary">Maximum reached</Badge>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
