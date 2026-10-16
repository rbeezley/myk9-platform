import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Building2 } from 'lucide-react';
import { ClubEditPanel } from '@/components/panels/edit/ClubEditPanel';
import type { EditPanelSaveContext } from '@/components/panels/edit/EditPanelWrapper';
import { useClubStore } from '@/store/clubStore';
import { useBrowseClubsData } from '@/hooks/useBrowseClubsData';
import { ClubsCompactList, ClubsGridView, ClubsListView } from '@/components/clubs/browse';
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout';
import { ClubsOfflineState } from '@/components/clubs/ClubsOfflineState';
import { BrowseClubsSkeleton } from '@/components/common/SkeletonLoaders';
import { logger } from '@/services/LoggingService';
import type { Club } from '@/types/club-types';
import { useViewPreference } from '@/hooks/useViewPreference';
import { defaultListView } from '@/utils/defaultListView';
import { useAuthContext } from '@/hooks/useAuthContext';
import { refreshScopesAfterClubUpload } from '@/components/clubs/refreshScopesAfterClubUpload';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { BrowseTabs } from '@/components/layout/BrowseTabs';
import { PageHeader } from '@/components/common/PageHeader';
import {
  ListEmptyState,
  ListFilterBar,
  ListResultLine,
  ListViewToggle,
} from '@/components/list-toolkit';
import { ErrorState } from '@/components/common/ErrorState';
import { resolveCreateGates } from '@/features/actions/createGates';

const CLUB_NOUN = ['club', 'clubs'] as const;

interface BrowseClubsPageProps {
  /**
   * What fills the right pane (the open club, or a "select a club" prompt). Only passed on a wide
   * screen (see `ClubsMasterDetailPage`); the list then narrows to a compact one.
   */
  detail?: React.ReactNode;
}

const BrowseClubsPage: React.FC<BrowseClubsPageProps> = ({ detail = null }) => {
  const routerNavigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: selectedId } = useParams<{ id: string }>();

  const { user, refreshPermissions, hasRole, hasPermission } = useAuthContext();
  const isAuthenticated = !!user;

  // Keep the affordance aligned with migration 160's clubs_insert policy.
  // Secretaries need this complete surface when a host club does not yet exist;
  // the show wizard links here instead of maintaining a partial club creator.
  const { canCreateClubs: canCreateClub } = resolveCreateGates({ hasRole, hasPermission });

  const [viewMode, setViewMode] = useViewPreference('clubs', defaultListView(true));
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

  // An empty directory has nothing to put beside a list, unless a club is already open.
  const splitOpen = detail !== null && (clubs.length > 0 || Boolean(selectedId));

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
      } catch (error) {
        logger.error('Failed to create club', 'clubs', {}, error as Error);
        // Reject so the Add Club panel stays open with the form and reports it.
        throw error;
      }
    },
    [addClub, selectClub, routerNavigate, searchParams, refreshPermissions]
  );

  const actionButton = useMemo(
    () =>
      canCreateClub ? (
        <Button onClick={() => setCreatePanelRequested(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Club
        </Button>
      ) : null,
    [canCreateClub]
  );

  const renderContent = () => {
    if (splitOpen && filteredClubs.length > 0) {
      return (
        <ClubsCompactList
          clubs={filteredClubs}
          selectedId={selectedId}
          clubShowCounts={clubShowCounts}
        />
      );
    }
    if (filteredClubs.length === 0) {
      return (
        <ListEmptyState
          icon={Building2}
          noun={CLUB_NOUN}
          filtered={hasActiveFilters}
          onShowAll={clearAllFilters}
          description={
            canCreateClub
              ? 'Get started by creating your first club to manage organizations and events.'
              : isAuthenticated
                ? 'No clubs are listed yet.'
                : 'No clubs are listed yet. Sign in to add one.'
          }
          action={
            canCreateClub
              ? { label: 'Add Club', onClick: () => setCreatePanelRequested(true), icon: Plus }
              : null
          }
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
    <PageShell ContentWrapper={BrowseTabs} {...(splitOpen ? { maxWidth: 'max-w-[110rem]' } : {})}>
      {/* Loading state */}
      {isLoading && clubs.length === 0 && (
        <BrowseClubsSkeleton viewMode={viewMode === 'cards' ? 'grid' : 'list'} />
      )}

      {/* Error state */}
      {/* A list that fails to load leaves an open club readable below it. */}
      {hasError && !isLoading && (
        <>
          <ErrorState message="We couldn't load your clubs." onRetry={handleRetry} />
          {selectedId && detail}
        </>
      )}

      {/* Offline guest: the signed-out directory is online-only (MYK9-747) */}
      {isOffline && !isLoading && !hasError && (
        <>
          <PageHeader breadcrumbs={breadcrumbs} title="Clubs" actions={actionButton} showTitle />
          <ClubsOfflineState
            description="Connect to the internet to browse clubs."
            onRetry={handleRetry}
          />
        </>
      )}

      {/* Normal content */}
      {!isLoading && !hasError && !isOffline && (
        <>
          <PageHeader breadcrumbs={breadcrumbs} title="Clubs" actions={actionButton} showTitle />

          <MasterDetailLayout
            id="clubs"
            listLabel="Clubs list"
            detailLabel="Club details"
            detail={splitOpen ? detail : null}
            listHeader={
              <div className="flex flex-col gap-3">
                <ListFilterBar
                  searchValue={filters.search}
                  onSearchChange={value => setFilters(prev => ({ ...prev, search: value }))}
                  searchPlaceholder={
                    splitOpen ? 'Search clubs' : 'Search clubs by name, city, or state...'
                  }
                  fields={[]}
                />
                <ListResultLine
                  shown={filteredClubs.length}
                  total={clubs.length}
                  noun={CLUB_NOUN}
                  filtered={hasActiveFilters}
                  onShowAll={clearAllFilters}
                  showAllInEmptyState={filteredClubs.length === 0}
                >
                  {/* Beside a club the list is always compact, so there is no view to pick. */}
                  {!splitOpen && <ListViewToggle active={viewMode} onChange={setViewMode} />}
                </ListResultLine>
              </div>
            }
            list={renderContent()}
          />
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
