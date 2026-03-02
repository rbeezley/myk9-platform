import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, Grid3X3, List, Plus, ChevronDown, X } from 'lucide-react';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useRBAC } from '@/hooks/useRBAC';
import { useBrowseDogsData } from '@/hooks/useBrowseDogsData';
import { DogsGridView, DogsListView } from '@/components/dogs/browse';
import { BrowseDogsSkeleton } from '@/components/common/SkeletonLoaders';
import { AddDogPanel } from '@/components/panels/edit';
import type { Dog } from '@/types/dog-types';
import '@/styles/myk9-show-details.css';

type ViewMode = 'grid' | 'list';

const BrowseDogsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialViewMode = (searchParams.get('view') as ViewMode) || 'grid';
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [showCreateDogPanel, setShowCreateDogPanel] = useState(false);

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

  // Handle dog creation
  const handleDogCreated = useCallback(
    (newDog: Dog) => {
      setShowCreateDogPanel(false);
      navigate(`/dogs/${newDog.id}`, { replace: true });
    },
    [navigate]
  );

  // Count active filters (excluding search)
  const activeFilterCount = (filters.breed !== 'all' ? 1 : 0) + (filters.sex !== 'all' ? 1 : 0);

  // Render view content
  const renderContent = () => {
    if (filteredDogs.length === 0 && !hasActiveFilters) {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No dogs yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Get started by adding your first dog to track health records, registrations, and
              competitions.
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-20 max-w-7xl">
        <div className="space-y-8">
          {/* Loading state */}
          {isLoading && dogs.length === 0 && <BrowseDogsSkeleton viewMode={viewMode} />}

          {/* Normal content */}
          {(!isLoading || dogs.length > 0) && (
            <>
              <Breadcrumb
                items={breadcrumbItems}
                showHomeIcon={true}
                className="text-sm text-muted-foreground"
              />

              {/* Header */}
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="space-y-2 flex-1">
                  <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Dogs</h1>
                  <p className="text-muted-foreground text-base lg:text-lg">
                    Browse dogs, view their profiles, and manage registrations
                  </p>
                </div>

                {canCreateDogs && (
                  <Button onClick={() => setShowCreateDogPanel(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Dog
                  </Button>
                )}
              </div>

              {/* Search & Filters */}
              <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:border-primary/30">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search dogs by name, breed, or owner..."
                        value={filters.search}
                        onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        className="pl-9 h-10 bg-background border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-lg transition-all duration-200"
                      />
                    </div>
                    <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="outline"
                          className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200 gap-2"
                        >
                          <Filter className="h-4 w-4" />
                          <span>Filters</span>
                          {activeFilterCount > 0 && (
                            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                              {activeFilterCount}
                            </Badge>
                          )}
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform duration-200',
                              isFiltersOpen && 'rotate-180'
                            )}
                          />
                        </Button>
                      </CollapsibleTrigger>
                    </Collapsible>
                  </div>

                  {/* Active filter chips */}
                  {hasActiveFilters && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {filters.breed !== 'all' && (
                        <Badge
                          variant="secondary"
                          className="pl-2 pr-1 py-1 flex items-center gap-1 cursor-pointer hover:bg-destructive/10 transition-colors"
                          onClick={() => setFilters(prev => ({ ...prev, breed: 'all' }))}
                        >
                          {filters.breed}
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      )}
                      {filters.sex !== 'all' && (
                        <Badge
                          variant="secondary"
                          className="pl-2 pr-1 py-1 flex items-center gap-1 cursor-pointer hover:bg-destructive/10 transition-colors"
                          onClick={() => setFilters(prev => ({ ...prev, sex: 'all' }))}
                        >
                          {filters.sex.charAt(0).toUpperCase() + filters.sex.slice(1)}
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      )}
                      {filters.search && (
                        <Badge
                          variant="secondary"
                          className="pl-2 pr-1 py-1 flex items-center gap-1 cursor-pointer hover:bg-destructive/10 transition-colors"
                          onClick={() => setFilters(prev => ({ ...prev, search: '' }))}
                        >
                          &quot;{filters.search}&quot;
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllFilters}
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-primary"
                      >
                        Clear all
                      </Button>
                    </div>
                  )}

                  {/* Filter dropdowns */}
                  <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                    <CollapsibleContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 mt-4 border-t border-border/50">
                        <Select
                          value={filters.breed}
                          onValueChange={value => setFilters(prev => ({ ...prev, breed: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Breed" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Breeds</SelectItem>
                            {availableBreeds.map(breed => (
                              <SelectItem key={breed} value={breed}>
                                {breed}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={filters.sex}
                          onValueChange={value => setFilters(prev => ({ ...prev, sex: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sex" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>

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
                          size="sm"
                          onClick={() => handleViewModeChange(mode)}
                          className="h-8 px-3 transition-all duration-200"
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
