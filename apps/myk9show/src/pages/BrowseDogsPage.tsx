import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Grid3X3, List, Plus, X, Dog } from 'lucide-react';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { FilterBar } from '@/components/common/FilterBar';
import type {
  FilterDefinition,
  FilterBarState,
  SortDefinition,
} from '@/components/common/FilterBar';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useRBAC } from '@/hooks/useRBAC';
import { useBrowseDogsData } from '@/hooks/useBrowseDogsData';
import { DogsGridView, DogsListView } from '@/components/dogs/browse';
import { BrowseDogsSkeleton } from '@/components/common/SkeletonLoaders';
import { AddDogPanel } from '@/components/panels/edit';
import type { Dog as DogType } from '@/types/dog-types';
import '@/styles/myk9-show-details.css';

type ViewMode = 'grid' | 'list';

const SORT_DEFS: SortDefinition[] = [
  { key: 'name', label: 'Name' },
  { key: 'breed', label: 'Breed' },
];

const BrowseDogsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialViewMode = (searchParams.get('view') as ViewMode) || 'grid';
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [showCreateDogPanel, setShowCreateDogPanel] = useState(
    () => searchParams.get('add') === 'true'
  );

  const { getUserRoles } = useAuthContext();
  const currentUserPersonId = useCurrentUserPersonId();
  const { hasPermission, isLoading: rbacLoading } = useRBAC();

  const {
    dogs,
    filteredDogs,
    isLoading,
    filters,
    setFilters,
    hasActiveFilters,
    clearAllFilters,
    availableBreeds,
  } = useBrowseDogsData();

  const canCreateDogs = !rbacLoading && hasPermission('dog:create');

  // Build filter definitions from available data
  const filterDefs: FilterDefinition[] = useMemo(
    () => [
      {
        key: 'breed',
        label: 'Breed',
        type: 'select',
        icon: Dog,
        options: availableBreeds.map(b => ({ label: b, value: b })),
      },
      {
        key: 'sex',
        label: 'Sex',
        type: 'select',
        options: [
          { label: 'Male', value: 'male' },
          { label: 'Female', value: 'female' },
        ],
      },
    ],
    [availableBreeds]
  );

  // Bridge FilterBar state to useBrowseDogsData filters
  const filterBarState: FilterBarState = useMemo(() => {
    const filterState: Record<string, string | string[] | boolean> = {};
    if (filters.breed !== 'all') filterState.breed = filters.breed;
    if (filters.sex !== 'all') filterState.sex = filters.sex;
    return { filters: filterState, sortKey: null, sortDirection: 'asc' };
  }, [filters.breed, filters.sex]);

  const handleFilterBarChange = useCallback(
    (newState: FilterBarState) => {
      setFilters(prev => ({
        ...prev,
        breed: (newState.filters.breed as string) || 'all',
        sex: (newState.filters.sex as string) || 'all',
      }));
    },
    [setFilters]
  );

  // Update URL when view mode changes
  const handleViewModeChange = useCallback(
    (newViewMode: ViewMode) => {
      if (newViewMode === viewMode) return;
      setViewMode(newViewMode);
      const params = new URLSearchParams(searchParams);
      if (newViewMode === 'grid') {
        params.delete('view');
      } else {
        params.set('view', newViewMode);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams, viewMode]
  );

  const breadcrumbItems = useMemo(() => [{ label: 'Dogs' }], []);

  const handleDogCreated = useCallback(
    (newDog: DogType) => {
      setShowCreateDogPanel(false);
      navigate(`/dogs/${newDog.id}`, { replace: true });
    },
    [navigate]
  );

  const renderContent = () => {
    if (filteredDogs.length === 0 && !hasActiveFilters) {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No dogs yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Add your first dog to track health records, registrations, and competitions.
            </p>
            {canCreateDogs && (
              <Button onClick={() => setShowCreateDogPanel(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Dog
              </Button>
            )}
          </CardContent>
        </Card>
      );
    }

    if (filteredDogs.length === 0 && hasActiveFilters) {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No dogs match your filters</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Try adjusting your search or filter criteria.
            </p>
            <Button variant="outline" onClick={clearAllFilters}>
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      );
    }

    switch (viewMode) {
      case 'list':
        return <DogsListView dogs={filteredDogs} />;
      case 'grid':
      default:
        return <DogsGridView dogs={filteredDogs} />;
    }
  };

  return (
    <div className="bg-background">
      <div className="container mx-auto px-6 py-6 max-w-7xl">
        <div className="space-y-6">
          {/* Loading state */}
          {isLoading && dogs.length === 0 && <BrowseDogsSkeleton viewMode={viewMode} />}

          {/* Normal content */}
          {(!isLoading || dogs.length > 0) && (
            <>
              <h1 className="sr-only">Dogs</h1>
              <div className="flex items-center justify-between">
                <Breadcrumb
                  items={breadcrumbItems}
                  showHomeIcon={true}
                  className="text-sm text-muted-foreground"
                />

                {canCreateDogs && (
                  <Button onClick={() => setShowCreateDogPanel(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Dog
                  </Button>
                )}
              </div>

              {/* Search + Filter Bar */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search dogs by name, breed, or owner..."
                    value={filters.search}
                    onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-9 h-10 bg-background border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-lg transition-all duration-200"
                  />
                </div>

                <FilterBar
                  filterDefs={filterDefs}
                  sortDefs={SORT_DEFS}
                  state={filterBarState}
                  onStateChange={handleFilterBarChange}
                />
              </div>

              {/* View Mode Toggle + Result Count */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">View:</span>
                  <div className="flex bg-muted/50 rounded-lg p-1">
                    {(['grid', 'list'] as const).map(mode => {
                      const Icon = { grid: Grid3X3, list: List }[mode];
                      const label = mode.charAt(0).toUpperCase() + mode.slice(1);
                      return (
                        <Button
                          key={mode}
                          variant={viewMode === mode ? 'default' : 'ghost'}
                          size="default"
                          onClick={() => handleViewModeChange(mode)}
                          className="h-10 px-3 transition-all duration-200"
                        >
                          <Icon className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">{label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <span className="text-sm text-muted-foreground">
                  {filteredDogs.length} of {dogs.length} dog{dogs.length !== 1 ? 's' : ''}
                  {hasActiveFilters && ' (filtered)'}
                </span>
              </div>

              {/* Dog Cards */}
              {renderContent()}
            </>
          )}
        </div>
      </div>

      {/* Create Dog Panel */}
      <AddDogPanel
        open={showCreateDogPanel}
        onClose={() => setShowCreateDogPanel(false)}
        onDogCreated={handleDogCreated}
        userRole={getUserRoles()[0]}
        currentUserPersonId={currentUserPersonId || undefined}
      />
    </div>
  );
};

export default BrowseDogsPage;
