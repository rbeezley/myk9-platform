import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Search, Building2 } from 'lucide-react';
import { ClubEditPanel } from '@/components/panels/edit/ClubEditPanel';
import type { EditPanelSaveContext } from '@/components/panels/edit/EditPanelWrapper';
import { useClubStore } from '@/store/clubStore';
import { useBrowseClubsData } from '@/hooks/useBrowseClubsData';
import { ClubsGridView, ClubsListView } from '@/components/clubs/browse';
import { ClubsOfflineState } from '@/components/clubs/ClubsOfflineState';
import { BrowseClubsSkeleton } from '@/components/common/SkeletonLoaders';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import type { Club } from '@/types/club-types';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { refreshScopesAfterClubUpload } from '@/components/clubs/refreshScopesAfterClubUpload';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ListFilterBar, ListResultLine } from '@/components/list-toolkit';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';

const BrowseClubsPage: React.FC = () => {
  const routerNavigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { user, userWithRoles, refreshPermissions } = useAuthContext();
  const isAuthenticated = !!user;

  // Keep the affordance aligned with migration 160's clubs_insert policy.
  // Secretaries need this complete surface when a host club does not yet exist;
  // the show wizard links here instead of maintaining a partial club creator.
  const canCreateClub = useMemo(() => {
    const roles = userWithRoles?.roles ?? [];
    return [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN].some(role =>
      roles.includes(role)
    );
  }, [userWithRoles]);

  const [viewMode, setViewMode] = useViewPreference('clubs', 'table');
  const [createPanelRequested, setCreatePanelRequested] = useState(
    () => searchParams.get('create') === 'true'
  );
  const showCreateClubPanel = canCreateClub && createPanelRequested;

  const addClub = useClubStore(state => state.addClub);
  const selectClub = useClubStore(state => state.selectClub);

  const {
    clubs,
    filteredClubs,
    isLoading,
    hasError,
    isOffline,
    handleRetry,
    filters,
    setFilters,
    hasActiveFilters,
    clearAllFilters,
    clubShowCounts,
  } = useBrowseClubsData();

  // Breadcrumbs for PageHeader
  const breadcrumbs = useMemo(() => [{ label: 'Clubs', href: '/clubs' }], []);

  // Handle club creation
  const handleClubCreated = useCallback(
    async (clubData: Partial<Club>, { runSelfNavigation }: EditPanelSaveContext) => {
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
          // MYK9-905: the creator's club_admin grant is issued server-side once the club
          // uploads; refresh role scopes then so Edit appears without a reload.
          void refreshScopesAfterClubUpload(createdId, refreshPermissions);
          // The club is saved, so leaving the panel is not losing work: route
          // through the panel's self-navigation so its unsaved-changes guard
          // stands down instead of offering to "discard" a saved club.
          const navigate = (to: string) => runSelfNavigation(() => routerNavigate(to));
          const returnTo = searchParams.get('returnTo');
          if (returnTo?.startsWith('/') && !returnTo.startsWith('//')) {
            const target = new URL(returnTo, window.location.origin);
            if (target.origin === window.location.origin) {
              target.searchParams.set('clubId', createdId);
              target.searchParams.set('clubCreated', '1');
              navigate(`${target.pathname}${target.search}${target.hash}`);
            } else {
              navigate(`/clubs/${createdId}`);
            }
          } else {
            navigate(`/clubs/${createdId}`);
          }
        }

        setCreatePanelRequested(false);
        notifications.success('Club created successfully');
      } catch (error) {
        logger.error('Failed to create club', 'clubs', {}, error as Error);
        notifications.error('Failed to create club');
      }
    },
    [addClub, selectClub, routerNavigate, searchParams, refreshPermissions]
  );

  const actionButton = useMemo(
    () =>
      canCreateClub ? (
        <Button onClick={() => setCreatePanelRequested(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Club
        </Button>
      ) : null,
    [canCreateClub]
  );

  const renderContent = () => {
    if (filteredClubs.length === 0 && !hasActiveFilters) {
      return (
        <EmptyState
          icon={Building2}
          title="No clubs yet"
          description={
            canCreateClub
              ? 'Get started by creating your first club to manage organizations and events.'
              : isAuthenticated
                ? 'No clubs are listed yet.'
                : 'No clubs are listed yet. Sign in to add one.'
          }
          action={
            canCreateClub
              ? { label: 'New Club', onClick: () => setCreatePanelRequested(true), icon: Plus }
              : null
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
          variant="filter"
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

      {/* Offline guest: the signed-out directory is online-only (MYK9-747) */}
      {isOffline && !isLoading && !hasError && (
        <>
          <PageHeader breadcrumbs={breadcrumbs} title="Clubs" actions={actionButton} />
          <ClubsOfflineState
            description="Connect to the internet to browse clubs."
            onRetry={handleRetry}
          />
        </>
      )}

      {/* Normal content */}
      {!isLoading && !hasError && !isOffline && (
        <>
          <PageHeader breadcrumbs={breadcrumbs} title="Clubs" actions={actionButton} />

          <div className="flex flex-col gap-3">
            <ListFilterBar
              searchValue={filters.search}
              onSearchChange={value => setFilters(prev => ({ ...prev, search: value }))}
              searchPlaceholder="Search clubs by name, city, or state..."
              fields={[]}
            />
            <ListResultLine
              shown={filteredClubs.length}
              total={clubs.length}
              noun={['club', 'clubs']}
              filtered={hasActiveFilters}
              onShowAll={clearAllFilters}
            >
              <ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />
            </ListResultLine>
          </div>

          {/* Club Cards / Table */}
          {renderContent()}
        </>
      )}

      {/* Create Club Panel */}
      {showCreateClubPanel && (
        <ClubEditPanel
          open={showCreateClubPanel}
          onClose={() => setCreatePanelRequested(false)}
          clubId=""
          clubName=""
          initialClubData={{}}
          mode="create"
          onSave={handleClubCreated}
        />
      )}
    </PageShell>
  );
};

export default BrowseClubsPage;
