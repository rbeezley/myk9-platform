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

  return (
    <div className="flex min-h-screen bg-background">
      {/* Fixed sidebar with proper z-index */}
      <div className="fixed inset-y-0 left-0 z-[60] w-72 bg-card border-r border-border">
        <ClubSidebar
          clubs={clubs}
          selectedClubId={selectedClubId}
          onSelectClub={handleSelectClub}
          onAddClub={handleOpenCreatePanel}
        />
      </div>
      
      {/* Main content area with proper left margin */}
      <main className="flex-1 overflow-auto ml-72 pt-16">
        {clubs.length === 0 ? (
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