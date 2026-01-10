import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ClubSidebar from '@/components/clubs/ClubSidebar';
import ClubDetails from '@/components/clubs/ClubDetails';
import { PanelProvider, PanelStack } from '@/components/panels';
import { ClubEditPanel } from '@/components/panels/edit/ClubEditPanel';
import { Club } from '@/types/club-types';
import { useClubStore } from '@/store/clubStore';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { buildClasses } from '@/utils/designTokens';
import { useAuthContext } from '@/hooks/useAuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

/**
 * ClubsPage is responsible for displaying club details with a sidebar for navigation.
 * Uses standard pattern with empty state handling like other entity pages.
 */
const ClubsPage: React.FC = () => {
  const { id: clubIdFromUrl } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const clubs = useClubStore(state => state.clubs);
  const selectedClubId = useClubStore(state => state.selectedClubId);
  const selectClub = useClubStore(state => state.selectClub);
  const addClub = useClubStore(state => state.addClub);
  const loadClubs = useClubStore(state => state.loadClubs);
  const syncClubs = useClubStore(state => state.syncClubs);
  const isLoading = useClubStore(state => state.isLoading);
  const isSyncing = useClubStore(state => state.isSyncing);
  const subscribeToChanges = useClubStore(state => state.subscribeToChanges);

  // Load clubs from local cache on mount, then sync with server
  useEffect(() => {
    // Load from local cache first (instant, works offline)
    loadClubs();

    // Then sync with server in background (when online)
    syncClubs();

    // Subscribe to real-time changes
    const unsubscribe = subscribeToChanges();
    return unsubscribe;
  }, [loadClubs, syncClubs, subscribeToChanges]);

  // Ensure selected club has safe arrays
  const rawSelectedClub = clubs.find(club => club.id === selectedClubId) || clubs[0] || null;
  const selectedClub = rawSelectedClub ? {
    ...rawSelectedClub,
    upcomingShows: Array.isArray(rawSelectedClub.upcomingShows) ? rawSelectedClub.upcomingShows : [],
    pastShows: Array.isArray(rawSelectedClub.pastShows) ? rawSelectedClub.pastShows : []
  } : null;

  // Removed auto-initialization - stores should remain empty until user adds data

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

  // Handle club selection from sidebar
  const handleSelectClub = (clubId: string) => {
    selectClub(clubId);
    navigate(`/clubs/${clubId}`);
  };

  const [showCreateClubPanel, setShowCreateClubPanel] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Get current user for RBAC role assignment
  const { userWithRoles } = useAuthContext();

  // Generate breadcrumb items for the current club
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'club',
    club: selectedClub ? { id: selectedClub.id, name: selectedClub.name } : undefined
  });

  // Handler for creating a club (moved to panel)
  const handleClubCreated = (entity: Record<string, unknown>) => {
    const newClub = entity as unknown as Club;
    // The panel already handles creation, we just need to update UI state
    addClub(newClub);
    selectClub(newClub.id);
    navigate(`/clubs/${newClub.id}`);
    setShowCreateClubPanel(false);
  };

  const handleOpenCreatePanel = () => {
    setShowCreateClubPanel(true);
  };

  // Sidebar width constants matching UnifiedSidebar tokens
  const SIDEBAR_WIDTH_EXPANDED = 320; // 20rem
  const SIDEBAR_WIDTH_COLLAPSED = 80; // 5rem
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Fixed sidebar with responsive transform and dynamic width */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-[60] bg-card border-r border-border",
          "transform transition-all duration-300 ease-in-out md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ width: sidebarWidth }}
      >
        <ClubSidebar
          clubs={clubs}
          selectedClubId={selectedClubId}
          onSelectClub={(clubId) => {
            handleSelectClub(clubId);
            setSidebarOpen(false);
          }}
          onAddClub={handleOpenCreatePanel}
          onCloseMobile={() => setSidebarOpen(false)}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main content area with responsive left margin - only on md+ */}
      <main
        className={cn(
          "flex-1 overflow-auto pt-16 transition-all duration-300 ease-in-out",
          "md:ml-[var(--sidebar-width)]"
        )}
        style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      >
        {/* Mobile menu button */}
        <div className="md:hidden p-4 border-b border-border bg-background/95 backdrop-blur-sm sticky top-16 z-30">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4 w-4 mr-2" />
            Clubs Menu
          </Button>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading clubs...</p>
            </div>
          </div>
        ) : clubs.length === 0 && isSyncing ? (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Syncing clubs from server...</p>
            </div>
          </div>
        ) : clubs.length === 0 ? (
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
        ) : (
          <ClubDetails selectedClub={selectedClub as Club | null} breadcrumbItems={breadcrumbItems} />
        )}
      </main>
      
      {/* Create Club Panel */}
      {showCreateClubPanel && (
        <PanelProvider
          onEntityCreated={handleClubCreated}
        >
          <ClubEditPanel
            open={showCreateClubPanel}
            onClose={() => setShowCreateClubPanel(false)}
            clubId=""
            clubName=""
            initialClubData={{}}
            onSave={async (clubData) => {
              if (userWithRoles) {
                const newId = `club-${Date.now()}`;
                const newClub: Club = {
                  id: newId,
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
                    country: clubData.address?.country || 'US'
                  },
                  logo: clubData.logo || '',
                  founded: clubData.founded instanceof Date ? clubData.founded : undefined,
                  clubType: clubData.clubType as 'specialty' | 'all-breed' | 'local' | 'regional' | 'national' | undefined,
                  memberIds: [userWithRoles.id],
                  upcomingShows: [],
                  pastShows: []
                };
                
                addClub(newClub);
                selectClub(newId);
                navigate(`/clubs/${newId}`);
                setShowCreateClubPanel(false);
              }
            }}
          />
          <PanelStack maxPanels={3} />
        </PanelProvider>
      )}
    </div>
  );
};

export default ClubsPage;