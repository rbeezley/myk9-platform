import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Building2 } from 'lucide-react';
import { ClubEditPanel } from '@/components/panels/edit/ClubEditPanel';
import type { EditPanelSaveContext } from '@/components/panels/edit/EditPanelWrapper';
import { useClubStore } from '@/store/clubStore';
import { useBrowseClubsData } from '@/hooks/useBrowseClubsData';
import { ClubsCompactList, ClubsGridView, ClubsListView } from '@/components/clubs/browse';
import { CLUB_EXPORT_HEADERS, clubExportRows } from '@/components/clubs/browse/clubsExport';
import { clubsFilterQuery } from '@/components/clubs/browse/clubsFilterQuery';
import { usePageExportAction } from '@/features/actions/pageEditTarget';
import { exportRowsCsv } from '@/utils/downloadCsv';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { id: selectedId } = useParams<{ id: string }>();

  const { user, refreshPermissions, hasRole, hasPermission } = useAuthContext();
  const isAuthenticated = !!user;

  // Keep the affordance aligned with migration 160's clubs_insert policy.
  // Secretaries need this complete surface when a host club does not yet exist;
  // the show wizard links here instead of maintaining a partial club creator.
  const { canCreateClubs: canCreateClub } = resolveCreateGates({ hasRole, hasPermission });

  const [viewMode, setViewMode] = useViewPreference('clubs', defaultListView(true));
  // Open state is local, so closing never writes the URL: the panel closes after a successful
  // save too, and a URL write then would land on top of the save's own navigation (the new club,
  // or the show wizard's returnTo). `?create=true` (the show wizard's link, the header's Add Club)
  // opens it whenever it arrives, also on a page already showing (beside an open club this page
  // stays mounted), and is consumed as it opens, so the same request can arrive again.
  const createRequested = searchParams.get('create') === 'true';
  const [createPanelOpen, setCreatePanelOpen] = useState(createRequested);
  const [seenCreateRequest, setSeenCreateRequest] = useState(createRequested);
  if (createRequested !== seenCreateRequest) {
    setSeenCreateRequest(createRequested);
    if (createRequested) setCreatePanelOpen(true);
  }
  useEffect(() => {
    if (!createRequested) return;
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('create');
        return next;
      },
      { replace: true }
    );
  }, [createRequested, setSearchParams]);
  const showCreateClubPanel = canCreateClub && createPanelOpen;
  const openCreatePanel = useCallback(() => setCreatePanelOpen(true), []);
  const closeCreatePanel = useCallback(() => setCreatePanelOpen(false), []);

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

  const filterQuery = clubsFilterQuery(filters.search);

  // An empty directory has nothing to put beside a list, unless a club is already open.
  const splitOpen = detail !== null && (clubs.length > 0 || Boolean(selectedId));

  // The whole-list export the table's own button used to be (owner decision 4: header Actions
  // menu). Registered here, not in the table, so it survives the compact list beside a club.
  usePageExportAction({
    id: 'clubs',
    enabled: (viewMode === 'table' || splitOpen) && filteredClubs.length > 0,
    run: () =>
      exportRowsCsv('clubs', CLUB_EXPORT_HEADERS, clubExportRows(filteredClubs, clubShowCounts)),
  });

  // Handle club creation
  const handleClubCreated = useCallback(
    async (clubData: Partial<Club>, { runSelfNavigation }: EditPanelSaveContext) => {
      try {
        const newClub: Club = {
          id: '',
          name: clubData.name || '',
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

        closeCreatePanel();
      } catch (error) {
        logger.error('Failed to create club', 'clubs', {}, error as Error);
        // Reject so the Add Club panel stays open with the form and reports it.
        throw error;
      }
    },
    [addClub, selectClub, routerNavigate, searchParams, refreshPermissions, closeCreatePanel]
  );

  // The title and trail live in the detail column. Only with no detail beside it (an empty
  // directory, a phone) does the list carry the page's one h1.
  const pageTitle = <h1 className="sr-only">Clubs</h1>;

  const renderContent = () => {
    if (splitOpen && filteredClubs.length > 0) {
      return (
        <ClubsCompactList
          clubs={filteredClubs}
          selectedId={selectedId}
          clubShowCounts={clubShowCounts}
          filterQuery={filterQuery}
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
            canCreateClub ? { label: 'Add Club', onClick: openCreatePanel, icon: Plus } : null
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

  const listHeader = (
    <div className="flex flex-col gap-3">
      <ListFilterBar
        searchValue={filters.search}
        onSearchChange={value => setFilters(prev => ({ ...prev, search: value }))}
        searchPlaceholder={splitOpen ? 'Search clubs' : 'Search clubs by name, city, or state...'}
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
  );

  // Beside an open club, the list's own states (loading, failed, offline) fill the list pane and
  // never the detail: the split stays mounted whatever the directory is doing, so the open club
  // is never unmounted by, or remounted into, a list that is still settling.
  const splitListStatus =
    isLoading && clubs.length === 0 ? (
      <BrowseClubsSkeleton viewMode="list" />
    ) : hasError && !isLoading ? (
      <ErrorState message="We couldn't load your clubs." onRetry={handleRetry} />
    ) : isOffline && !isLoading ? (
      <ClubsOfflineState
        description="Connect to the internet to browse clubs."
        onRetry={handleRetry}
      />
    ) : null;

  return (
    <PageShell ContentWrapper={BrowseTabs} {...(splitOpen ? { maxWidth: 'max-w-[110rem]' } : {})}>
      {splitOpen ? (
        <>
          <MasterDetailLayout
            id="clubs"
            listLabel="Clubs list"
            detailLabel="Club details"
            detail={detail}
            listHeader={splitListStatus ? undefined : listHeader}
            list={splitListStatus ?? renderContent()}
          />
        </>
      ) : (
        <>
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
              {pageTitle}
              <ClubsOfflineState
                description="Connect to the internet to browse clubs."
                onRetry={handleRetry}
              />
            </>
          )}

          {/* Normal content */}
          {!isLoading && !hasError && !isOffline && (
            <>
              {pageTitle}
              <MasterDetailLayout
                id="clubs"
                listLabel="Clubs list"
                detailLabel="Club details"
                detail={null}
                listHeader={listHeader}
                list={renderContent()}
              />
            </>
          )}
        </>
      )}

      {/* Create Club Panel */}
      {showCreateClubPanel && (
        <ClubEditPanel
          open={showCreateClubPanel}
          onClose={closeCreatePanel}
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
