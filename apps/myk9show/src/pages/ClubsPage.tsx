import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ClubSidebar from '@/components/clubs/ClubSidebar';
import { ClubDetails } from '@/components/clubs/ClubDetails';
import { PanelProvider, PanelStack } from '@/components/panels';
import { ClubEditPanel } from '@/components/panels/edit/ClubEditPanel';
import { Club } from '@/types/club-types';
import { useClubStore } from '@/store/clubStore';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { buildClasses } from '@/utils/designTokens';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { useSidebarLayoutState } from '@/hooks/useSidebarLayoutState';
import { ClubsPageSkeleton } from '@/components/common/SkeletonLoaders';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';

// Sidebar width constant
const SIDEBAR_WIDTH = 320; // 20rem

/**
 * ClubsPage is responsible for displaying club details with a sidebar for navigation.
 * Uses SidebarLayout for consistent sidebar behavior across the app.
 */
const ClubsPage: React.FC = () => {
  const { id: clubIdFromUrl } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const clubs = useClubStore(state => state.clubs);
  const selectedClubId = useClubStore(state => state.selectedClubId);
  const selectClub = useClubStore(state => state.selectClub);
  const addClub = useClubStore(state => state.addClub);
  const isLoading = useClubStore(state => state.isLoading);
  const isSyncing = useClubStore(state => state.isSyncing);

  // Sidebar state management using the shared hook (mobile only, no collapse)
  const {
    mobileOpen: sidebarOpen,
    setMobileOpen: setSidebarOpen,
    closeMobile,
  } = useSidebarLayoutState();

  // Club loading and subscriptions handled globally by useStoreSubscriptions

  // Memoize selected club to prevent unnecessary re-renders
  // Only recalculate when clubs array or selectedClubId changes
  const selectedClub = useMemo(() => {
    const rawSelectedClub = clubs.find(club => club.id === selectedClubId) || clubs[0] || null;
    if (!rawSelectedClub) return null;

    return {
      ...rawSelectedClub,
      upcomingShows: Array.isArray(rawSelectedClub.upcomingShows)
        ? rawSelectedClub.upcomingShows
        : [],
      pastShows: Array.isArray(rawSelectedClub.pastShows) ? rawSelectedClub.pastShows : [],
    };
  }, [clubs, selectedClubId]);

  // Handle URL parameter changes and sync with store
  useEffect(() => {
    if (clubs.length > 0) {
      if (clubIdFromUrl) {
        // If URL has club ID, select that club
        const clubExists = clubs.find(club => club.id === clubIdFromUrl);
        if (clubExists && selectedClubId !== clubIdFromUrl) {
          selectClub(clubIdFromUrl);
        } else if (!clubExists) {
          // Club ID in URL doesn't exist, redirect to first club
          navigate(`/clubs/${clubs[0].id}`, { replace: true });
        }
      } else {
        // No club ID in URL, redirect to first club or selected club
        const targetClubId = selectedClubId || clubs[0].id;
        navigate(`/clubs/${targetClubId}`, { replace: true });
      }
    }
  }, [clubIdFromUrl, clubs, selectedClubId, selectClub, navigate]);

  const [showCreateClubPanel, setShowCreateClubPanel] = useState(false);

  // Memoize callbacks to prevent ClubSidebar re-renders
  const handleSelectClub = useCallback(
    (clubId: string) => {
      selectClub(clubId);
      navigate(`/clubs/${clubId}`);
      closeMobile(); // Close mobile sidebar after selection
    },
    [selectClub, navigate, closeMobile]
  );

  const handleOpenCreatePanel = useCallback(() => {
    setShowCreateClubPanel(true);
  }, []);

  // Generate breadcrumb items for the current club
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'club',
    club: selectedClub ? { id: selectedClub.id, name: selectedClub.name } : undefined,
  });

  function handleClubCreated(entity: Record<string, unknown>): void {
    const newClub = entity as unknown as Club;
    // The club has already been added via addClub in the onSave handler;
    // just select and navigate.
    selectClub(newClub.id);
    navigate(`/clubs/${newClub.id}`);
    setShowCreateClubPanel(false);
  }

  // Memoize sidebar content to prevent unnecessary re-renders
  const sidebarContent = useMemo(
    () => (
      <ClubSidebar
        clubs={clubs}
        selectedClubId={selectedClubId}
        onSelectClub={handleSelectClub}
        onAddClub={handleOpenCreatePanel}
      />
    ),
    [clubs, selectedClubId, handleSelectClub, handleOpenCreatePanel]
  );

  // Render main content based on loading/data state
  const renderContent = () => {
    if (isLoading || (clubs.length === 0 && isSyncing)) {
      return <ClubsPageSkeleton />;
    }

    if (clubs.length === 0) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">No Clubs Available</h1>
            <p className="text-muted-foreground mb-6">
              Get started by creating your first club to manage organizations and events.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleOpenCreatePanel}
                className={`${buildClasses.button.primary} px-4 py-2 rounded-lg transition-colors`}
              >
                Add Club
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <ClubDetails selectedClub={selectedClub as Club | null} breadcrumbItems={breadcrumbItems} />
    );
  };

  return (
    <>
      <SidebarLayout
        sidebar={sidebarContent}
        sidebarWidth={SIDEBAR_WIDTH}
        mobileMenuLabel="Clubs Menu"
        mobileOpen={sidebarOpen}
        onMobileOpenChange={setSidebarOpen}
      >
        {renderContent()}
      </SidebarLayout>

      {/* Create Club Panel */}
      {showCreateClubPanel && (
        <PanelProvider onEntityCreated={handleClubCreated}>
          <ClubEditPanel
            open={showCreateClubPanel}
            onClose={() => setShowCreateClubPanel(false)}
            clubId=""
            clubName=""
            initialClubData={{}}
            mode="create"
            onSave={async clubData => {
              try {
                const newClub: Club = {
                  id: '', // Will be assigned by the replication layer
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
                  clubType: clubData.clubType as
                    | 'specialty'
                    | 'all-breed'
                    | 'local'
                    | 'regional'
                    | 'national'
                    | undefined,
                  upcomingShows: [],
                  pastShows: [],
                };

                await addClub(newClub);

                // After addClub + loadClubs, the new club is in the store.
                // Find it by name since the ID was assigned by the replication layer.
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
            }}
          />
          <PanelStack maxPanels={3} />
        </PanelProvider>
      )}
    </>
  );
};

export default ClubsPage;
