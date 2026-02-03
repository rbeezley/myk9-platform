import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { 
  Search, 
  Filter, 
  X, 
  Dog, 
  Users, 
  Loader2,
  AlertCircle,
  CheckCircle,
  Grid3X3,
  List,
  ArrowUp
} from 'lucide-react';
import { LazyDogCard } from '../../dogs/LazyDogCard';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import { InfiniteScrollTrigger } from '../../common/InfiniteScrollTrigger';
import { useDebounce } from '@myk9/scoring-ui';
import { useDogStore } from '../../../store/dogStore';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../../lib/utils';

interface InfiniteDogSelectionStepProps {
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

type ViewMode = 'grid' | 'list';

export function InfiniteDogSelectionStep({
  selectedDogs,
  onSelectionChange,
  maxSelections = 50,
  allowBulkOperations = false
}: InfiniteDogSelectionStepProps) {
  const [filters, setFilters] = useState<DogFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showBackToTop, setShowBackToTop] = useState(false);

  const { dogs: allDogs } = useDogStore();
  const debouncedSearchQuery = useDebounce(filters.searchQuery || '', 300);

  // Create filtered dataset for pagination
  const filteredDogs = useMemo(() => {
    let result = allDogs;

    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter(dog =>
        dog.callName?.toLowerCase().includes(query) ||
        dog.name.toLowerCase().includes(query) ||
        dog.registrations?.[0]?.breed?.toLowerCase().includes(query)
      );
    }

    if (filters.breed) {
      result = result.filter(dog => dog.registrations?.[0]?.breed === filters.breed);
    }

    if (filters.gender) {
      result = result.filter(dog => dog.gender === filters.gender);
    }

    if (filters.ageGroup) {
      const today = new Date();
      result = result.filter(dog => {
        const age = today.getFullYear() - new Date(dog.dateOfBirth || '1990-01-01').getFullYear();
        switch (filters.ageGroup) {
          case 'puppy': return age < 2;
          case 'adult': return age >= 2 && age < 8;
          case 'senior': return age >= 8;
          default: return true;
        }
      });
    }

    return result;
  }, [allDogs, debouncedSearchQuery, filters]);

  // Infinite scroll load function
  const loadDogPage = useCallback(async (page: number, pageSize: number) => {
    // Simulate API delay for demonstration
    await new Promise(resolve => setTimeout(resolve, 300));

    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredDogs.length);
    const items = filteredDogs.slice(startIndex, endIndex);

    const totalPages = Math.ceil(filteredDogs.length / pageSize);

    return {
      items,
      page,
      totalPages,
      totalCount: filteredDogs.length,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    };
  }, [filteredDogs]);

  // Use infinite scroll hook
  const {
    items: paginatedDogs,
    loading,
    error,
    hasMore,
    loadMore,
    reset,
    goToPage,
    retry,
    isEmpty,
    isInitialLoad,
    currentPage,
    totalPages,
    totalCount,
    loadedPages,
    getCacheStats
  } = useInfiniteScroll(loadDogPage, {
    pageSize: 100,
    prefetch: true,
    enableCache: true,
    maxCachedPages: 5,
    debug: process.env.NODE_ENV === 'development'
  });

  // Get unique filter options
  const filterOptions = useMemo(() => {
    const breeds = [...new Set(allDogs.map(dog => dog.registrations?.[0]?.breed).filter((breed): breed is string => Boolean(breed)))].sort();
    const genders = [...new Set(allDogs.map(dog => dog.gender).filter((gender): gender is 'Male' | 'Female' => Boolean(gender) && gender !== ''))].sort();
    
    return { breeds, genders };
  }, [allDogs]);

  // Handle dog selection
  const handleDogSelect = useCallback((dogId: string) => {
    if (selectedDogs.length >= maxSelections) {
      return;
    }
    onSelectionChange([...selectedDogs, dogId]);
  }, [selectedDogs, maxSelections, onSelectionChange]);

  const handleDogDeselect = useCallback((dogId: string) => {
    onSelectionChange(selectedDogs.filter(id => id !== dogId));
  }, [selectedDogs, onSelectionChange]);

  // Bulk operations
  const handleSelectAllVisible = () => {
    const visibleDogIds = paginatedDogs.map(dog => dog.id);
    const newSelections = [...new Set([...selectedDogs, ...visibleDogIds])]
      .slice(0, maxSelections);
    onSelectionChange(newSelections);
  };

  const handleDeselectAllVisible = () => {
    const visibleDogIds = new Set(paginatedDogs.map(dog => dog.id));
    const remainingSelections = selectedDogs.filter(id => !visibleDogIds.has(id));
    onSelectionChange(remainingSelections);
  };

  // Filter changes trigger reset
  const handleFilterChange = (key: keyof DogFilters, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  // Reset infinite scroll when filters change
  React.useEffect(() => {
    reset();
  }, [filters, reset]);

  // Scroll to top functionality
  React.useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 500);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectedCount = selectedDogs.length;
  const hasFilters = Object.values(filters).some(value => value);
  const cacheStats = getCacheStats();

  return (
    <div className="space-y-6">
      {/* Header with stats and view controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Select Dogs</h2>
          <p className="text-muted-foreground">
            Choose dogs to register for this show ({selectedCount}/{maxSelections} selected)
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Performance stats */}
          {process.env.NODE_ENV === 'development' && (
            <Badge variant="outline" className="text-xs">
              Pages: {loadedPages} | Cache: {cacheStats.cachedPages}
            </Badge>
          )}
          
          {/* View mode toggle */}
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none border-0"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-l-none border-0"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Results count */}
          {totalCount > 0 && (
            <Badge variant="outline">
              {paginatedDogs.length} of {totalCount} loaded
            </Badge>
          )}
          
          {allowBulkOperations && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkSelectMode(!bulkSelectMode)}
            >
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
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
              onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
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
                      onValueChange={(value) => handleFilterChange('breed', value || undefined)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any breed" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any breed</SelectItem>
                        {filterOptions.breeds.map(breed => (
                          <SelectItem key={breed} value={breed}>{breed}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1 block">Gender</label>
                    <Select
                      value={filters.gender || ''}
                      onValueChange={(value) => handleFilterChange('gender', value || undefined)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any gender</SelectItem>
                        {filterOptions.genders.map(gender => (
                          <SelectItem key={gender} value={gender || 'Unknown'}>{gender}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1 block">Age Group</label>
                    <Select
                      value={filters.ageGroup || ''}
                      onValueChange={(value) => handleFilterChange('ageGroup', value || undefined)}
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
      {allowBulkOperations && bulkSelectMode && paginatedDogs.length > 0 && (
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
                  onClick={handleSelectAllVisible}
                  disabled={selectedCount >= maxSelections}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Select Visible ({paginatedDogs.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeselectAllVisible}
                >
                  <X className="h-4 w-4 mr-2" />
                  Deselect Visible
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination Summary */}
      {totalCount > 0 && (
        <Card className="border-muted/50">
          <CardContent className="py-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span>
                  Showing {paginatedDogs.length} of {totalCount} dogs
                </span>
                {currentPage > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(1)}
                  >
                    Go to First Page
                  </Button>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                {hasMore && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    disabled={loading}
                  >
                    Load Next Page
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dog List/Grid */}
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
              <Button
                variant="outline"
                size="sm"
                onClick={retry}
                className="mt-3"
              >
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
                    : 'No dogs are available for registration'
                  }
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

        {/* Dog Grid/List */}
        {paginatedDogs.length > 0 && (
          <div className={cn(
            viewMode === 'grid' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
              : 'space-y-3'
          )}>
            <AnimatePresence>
              {paginatedDogs.map((dog) => (
                <LazyDogCard
                  key={dog.id}
                  dogId={dog.id}
                  selected={selectedDogs.includes(dog.id)}
                  onSelect={handleDogSelect}
                  onDeselect={handleDogDeselect}
                  showDetails={true}
                  lazyMode={false} // Already paginated, no need for lazy loading
                  className={viewMode === 'list' ? 'max-w-none' : ''}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Infinite Scroll Trigger */}
        <InfiniteScrollTrigger
          onLoadMore={loadMore}
          hasMore={hasMore}
          loading={loading}
          error={error}
          onRetry={retry}
          totalCount={totalCount}
          loadedCount={paginatedDogs.length}
        />
      </div>

      {/* Selection Summary */}
      {selectedCount > 0 && (
        <Card className="border-primary/20 bg-primary/5 sticky bottom-4">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  {selectedCount} dog{selectedCount !== 1 ? 's' : ''} selected
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {selectedCount >= maxSelections && (
                  <Badge variant="secondary">
                    Maximum reached
                  </Badge>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectionChange([])}
                >
                  Clear All
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Back to Top Button */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Button
              onClick={scrollToTop}
              className="rounded-full p-3 shadow-lg"
              size="sm"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}