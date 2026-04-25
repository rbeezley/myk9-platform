import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Search, Building2 } from 'lucide-react';
import { PanelProvider, PanelStack } from '@/components/panels';
import { ClubEditPanel } from '@/components/panels/edit/ClubEditPanel';
import { useClubStore } from '@/store/clubStore';
import { useBrowseClubsData } from '@/hooks/useBrowseClubsData';
import { ClubsGridView, ClubsListView } from '@/components/clubs/browse';
import { BrowseClubsSkeleton } from '@/components/common/SkeletonLoaders';
import { CLUB_TYPES } from '@/types/club-types';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import type { Club } from '@/types/club-types';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { useAuthContext } from '@/hooks/useAuthContext';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { FilterChips } from '@/components/common/FilterChips';
import type { FilterDefinition as ChipFilterDefinition } from '@/components/common/FilterChips';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ResultsCount } from '@/components/common/ResultsCount';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';

const BrowseClubsPage: React.FC = () => {
  const navigate = useNavigate();

  const { user } = useAuthContext();
  const isAuthenticated = !!user;

  const [viewMode, setViewMode] = useViewPreference('clubs', 'cards');
  const [showCreateClubPanel, setShowCreateClubPanel] = useState(false);

  const addClub = useClubStore(state => state.addClub);
  const selectClub = useClubStore(state => state.selectClub);

  const {
    clubs,
    filteredClubs,
    isLoading,
    hasError,
    handleRetry,
    filters,
    setFilters,
    hasActiveFilters,
    clearAllFilters,
    clubShowCounts,
  } = useBrowseClubsData();

  // FilterChips definitions
  const chipFilters: ChipFilterDefinition[] = useMemo(
    () => [
      {
        key: 'clubType',
        label: 'Club Type',
        options: CLUB_TYPES.map(type => ({ label: type.label, value: type.value })),
      },
    ],
    []
  );

  // Bridge chip filter values from existing filters state
  const chipFilterValues = useMemo(() => {
    const values: Record<string, string> = {};
    if (filters.clubType !== 'all') values.clubType = filters.clubType;
    return values;
  }, [filters.clubType]);

  const handleChipFilterChange = useCallback(
    (key: string, value: string | null) => {
      setFilters(prev => ({ ...prev, [key]: value || 'all' }));
    },
    [setFilters]
  );

  // Breadcrumbs for PageHeader
  const breadcrumbs = useMemo(() => [{ label: 'Clubs', href: '/clubs' }], []);

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
          coverImage: clubData.coverImage || '',
          accentColor: clubData.accentColor || '',
          founded: clubData.founded instanceof Date ? clubData.founded : undefined,
          clubType: clubData.clubType,
          upcomingShows: [],
          pastShows: [],
        };

        const createdId = await addClub(newClub);

        if (createdId) {
          selectClub(createdId);
          navigate(`/clubs/${createdId}`);
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

  const actionButton = useMemo(
    () =>
      isAuthenticated ? (
        <Button onClick={() => setShowCreateClubPanel(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Club
        </Button>
      ) : null,
    [isAuthenticated]
  );

  const renderContent = () => {
    if (filteredClubs.length === 0 && !hasActiveFilters) {
      return (
        <EmptyState
          icon={Building2}
          title="No clubs yet"
          description={
            isAuthenticated
              ? 'Get started by creating your first club to manage organizations and events.'
              : 'No clubs are listed yet. Sign in to add one.'
          }
          action={
            isAuthenticated
              ? { label: 'Add Club', onClick: () => setShowCreateClubPanel(true), icon: Plus }
              : undefined
          }
        />
      );
    }

    if (filteredClubs.length === 0 && hasActiveFilters) {
      return (
        <EmptyState
          icon={Search}
          title="No clubs match your filters"
          description="Try adjusting your search or filter criteria."
          action={{ label: 'Clear Filters', onClick: clearAllFilters }}
        />
      );
    }

    switch (viewMode) {
      case 'table':
        return <ClubsListView clubs={filteredClubs} clubShowCounts={clubShowCounts} />;
      case 'cards':
      default:
        return <ClubsGridView clubs={filteredClubs} clubShowCounts={clubShowCounts} />;
    }
  };

  return (
    <PageShell>
      {/* Loading state */}
      {isLoading && clubs.length === 0 && (
        <BrowseClubsSkeleton viewMode={viewMode === 'cards' ? 'grid' : 'list'} />
      )}

      {/* Error state */}
      {hasError && !isLoading && (
        <ErrorState message="We couldn't load your clubs." onRetry={handleRetry} />
      )}

      {/* Normal content */}
      {!isLoading && !hasError && (
        <>
          <PageHeader breadcrumbs={breadcrumbs} title="Clubs" actions={actionButton} />

          {/* Filter toolbar */}
          <div className="bg-card/30 border border-border/40 rounded-2xl p-4 space-y-3 backdrop-blur-sm">
            <SearchBar
              value={filters.search}
              onChange={value => setFilters(prev => ({ ...prev, search: value }))}
              placeholder="Search clubs by name, city, or state..."
            />

            <div className="flex flex-wrap items-center gap-2">
              <FilterChips
                filters={chipFilters}
                values={chipFilterValues}
                onChange={handleChipFilterChange}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-border/20">
              <ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />

              <ResultsCount
                showing={filteredClubs.length}
                total={clubs.length}
                filtered={hasActiveFilters}
                entityName={clubs.length === 1 ? 'club' : 'clubs'}
              />
            </div>
          </div>

          {/* Club Cards / Table */}
          {renderContent()}
        </>
      )}

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
    </PageShell>
  );
};

export default BrowseClubsPage;
