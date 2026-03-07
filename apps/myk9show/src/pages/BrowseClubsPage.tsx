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
import { PanelProvider, PanelStack } from '@/components/panels';
import { ClubEditPanel } from '@/components/panels/edit/ClubEditPanel';
import { useClubStore } from '@/store/clubStore';
import '@/styles/myk9-show-details.css';
import { useBrowseClubsData } from '@/hooks/useBrowseClubsData';
import { ClubsGridView, ClubsListView } from '@/components/clubs/browse';
import { BrowseClubsSkeleton } from '@/components/common/SkeletonLoaders';
import { CLUB_TYPES } from '@/types/club-types';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import type { Club } from '@/types/club-types';

type ViewMode = 'grid' | 'list';

const BrowseClubsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialViewMode = (searchParams.get('view') as ViewMode) || 'grid';
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [showCreateClubPanel, setShowCreateClubPanel] = useState(false);

  const addClub = useClubStore(state => state.addClub);
  const selectClub = useClubStore(state => state.selectClub);

  const {
    clubs,
    filteredClubs,
    isLoading,
    filters,
    setFilters,
    hasActiveFilters,
    clearAllFilters,
    clubShowCounts,
  } = useBrowseClubsData();

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

  const breadcrumbItems = useMemo(() => [{ label: 'Clubs' }], []);

  // Handle club creation
  const handleClubCreated = useCallback(
    async (clubData: Partial<Club>) => {
      try {
        const newClub: Club = {
          id: '',
          name: clubData.name || '',
          clubNumber: clubData.clubNumber || '',
          email: clubData.email || '',
          phone: clubData.phone || '',
          website: clubData.website || '',
          description: clubData.description || '',
          address: {
            street: clubData.address?.street || '',
            city: clubData.address?.city || '',
            state: clubData.address?.state || '',
            zipCode: clubData.address?.zipCode || '',
            country: clubData.address?.country || 'US',
          },
          logo: clubData.logo || '',
          founded: clubData.founded instanceof Date ? clubData.founded : undefined,
          clubType: clubData.clubType,
          upcomingShows: [],
          pastShows: [],
        };

        await addClub(newClub);

        // Find the created club by name since ID was assigned by replication layer
        const currentClubs = useClubStore.getState().clubs;
        const created = currentClubs.find(c => c.name === newClub.name);
        if (created) {
          selectClub(created.id);
          navigate(`/clubs/${created.id}`);
        }

        setShowCreateClubPanel(false);
        notifications.success('Club created successfully');
      } catch (error) {
        logger.error('Failed to create club', 'clubs', {}, error as Error);
        notifications.error('Failed to create club');
      }
    },
    [addClub, selectClub, navigate]
  );

  // Count active filters (excluding search)
  const activeFilterCount = filters.clubType !== 'all' ? 1 : 0;

  // Render view content
  const renderContent = () => {
    if (filteredClubs.length === 0 && !hasActiveFilters) {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No clubs yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Get started by creating your first club to manage organizations and events.
            </p>
            <Button onClick={() => setShowCreateClubPanel(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Club
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (filteredClubs.length === 0 && hasActiveFilters) {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No clubs match your filters</h3>
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
        return <ClubsListView clubs={filteredClubs} clubShowCounts={clubShowCounts} />;
      case 'grid':
      default:
        return <ClubsGridView clubs={filteredClubs} clubShowCounts={clubShowCounts} />;
    }
  };

  return (
    <div className="bg-background">
      <div className="container mx-auto px-6 py-6 max-w-7xl">
        <div className="space-y-8">
          {/* Loading state */}
          {isLoading && clubs.length === 0 && <BrowseClubsSkeleton viewMode={viewMode} />}

          {/* Normal content */}
          {(!isLoading || clubs.length > 0) && (
            <>
              <h1 className="sr-only">Clubs</h1>
              <div className="flex items-center justify-between">
                <Breadcrumb
                  items={breadcrumbItems}
                  showHomeIcon={true}
                  className="text-sm text-muted-foreground"
                />

                <Button onClick={() => setShowCreateClubPanel(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Club
                </Button>
              </div>

              {/* Search & Filters */}
              <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:border-primary/30">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search clubs by name, city, or state..."
                        value={filters.search}
                        onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        className="pl-9 h-10 bg-background border border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-lg transition-all duration-200"
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
                      {filters.clubType !== 'all' && (
                        <Badge
                          variant="secondary"
                          className="pl-2 pr-1 py-1 flex items-center gap-1 cursor-pointer hover:bg-destructive/10 transition-colors"
                          onClick={() => setFilters(prev => ({ ...prev, clubType: 'all' }))}
                        >
                          {CLUB_TYPES.find(t => t.value === filters.clubType)?.label ||
                            filters.clubType}
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
                        size="default"
                        onClick={clearAllFilters}
                        className="h-10 px-3 text-sm text-muted-foreground hover:text-primary"
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
                          value={filters.clubType}
                          onValueChange={value =>
                            setFilters(prev => ({ ...prev, clubType: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Club Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            {CLUB_TYPES.map(type => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
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
                  {filteredClubs.length} of {clubs.length} club{clubs.length !== 1 ? 's' : ''}
                  {hasActiveFilters && ' (filtered)'}
                </span>
              </div>

              {/* Club Cards */}
              {renderContent()}
            </>
          )}
        </div>
      </div>

      {/* Create Club Panel */}
      {showCreateClubPanel && (
        <PanelProvider
          onEntityCreated={(entity: Record<string, unknown>) => {
            handleClubCreated(entity as unknown as Partial<Club>);
          }}
        >
          <ClubEditPanel
            open={showCreateClubPanel}
            onClose={() => setShowCreateClubPanel(false)}
            clubId=""
            clubName=""
            initialClubData={{}}
            mode="create"
            onSave={handleClubCreated}
          />
          <PanelStack maxPanels={3} />
        </PanelProvider>
      )}
    </div>
  );
};

export default BrowseClubsPage;
