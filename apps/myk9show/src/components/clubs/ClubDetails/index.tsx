import React, { useCallback, useRef } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Breadcrumb from '@/components/common/Breadcrumb';
import { logger } from '@/services/LoggingService';
import type { ClubDetailsProps, ClubTab } from './types';
import { ClubHeader } from './ClubHeader';
import { ClubStatistics } from './ClubStatistics';
import { UpcomingShowsTab } from './UpcomingShowsTab';
import { PastShowsTab } from './PastShowsTab';
import { AboutTab } from './AboutTab';
import { MembersTab } from './MembersTab';
import { ClubDialogs } from './ClubDialogs';
import { useClubDetailsState } from './useClubDetailsState';

export type { ClubDetailsProps };

/**
 * ClubDetails component displays information about a club.
 * This component should be used within the following hierarchy:
 * <EntityPageLayout>
 *   <EntityCardContainer>
 *     <ClubDetails selectedClub={selectedClub} />
 *   </EntityCardContainer>
 * </EntityPageLayout>
 *
 * CACHE_BUST_2025_01_08_20_05 - Fixed undefined array access
 */
const ClubDetails: React.FC<ClubDetailsProps> = ({ selectedClub, breadcrumbItems }) => {
  logger.debug('ClubDetails render start', 'clubs', {
    selectedClub,
    selectedClubType: typeof selectedClub,
    selectedClubKeys: selectedClub ? Object.keys(selectedClub) : null,
  });

  const state = useClubDetailsState(selectedClub);
  const tabsRef = useRef<HTMLDivElement>(null);
  const handleStatCardClick = useCallback(
    (tab: ClubTab) => {
      state.setActiveTab(tab);
      tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [state]
  );

  if (!selectedClub) {
    return <div className="flex items-center justify-center text-gray-500">No club selected.</div>;
  }

  // Additional safety check for club data integrity
  if (!selectedClub.id || !selectedClub.name) {
    logger.error('Invalid club data', 'clubs', { selectedClub });
    return <div className="flex items-center justify-center text-gray-500">Invalid club data.</div>;
  }

  const { upcomingShows, pastShows } = state;

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-20">
      {/* Breadcrumb Navigation */}
      <Breadcrumb items={breadcrumbItems} showHomeIcon={true} className="mb-6" />

      {/* Enhanced Header with logo and club info */}
      <ClubHeader
        club={selectedClub}
        onEditClub={state.handleEditClub}
        onEditPhoto={state.handleEditPhoto}
        onDeleteClub={state.handleDeleteClub}
      />

      {/* Statistics Cards */}
      <ClubStatistics stats={state.stats} onTabChange={handleStatCardClick} />

      {/* Tabs Section */}
      <div ref={tabsRef} className="mb-6">
        <Tabs
          value={state.activeTab}
          onValueChange={value => state.setActiveTab(value as ClubTab)}
          className="w-full"
        >
          <div className="flex items-center justify-between border-b border-border">
            <TabsList className="bg-transparent border-0 rounded-none p-0 h-auto gap-6 justify-start">
              <TabsTrigger
                value="upcoming"
                className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors"
              >
                Upcoming Shows ({upcomingShows.length})
              </TabsTrigger>
              <TabsTrigger
                value="past"
                className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors"
              >
                Past Shows ({pastShows.length})
              </TabsTrigger>
              <TabsTrigger
                value="about"
                className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors"
              >
                About
              </TabsTrigger>
              <TabsTrigger
                value="members"
                className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors"
              >
                Members ({selectedClub.memberIds?.length || 0})
              </TabsTrigger>
            </TabsList>

            {/* Add Show Button - only shown on upcoming shows tab when shows exist */}
            {state.activeTab === 'upcoming' && upcomingShows.length > 0 && (
              <Button onClick={state.handleAddShow} className="mb-3 min-h-[44px]">
                <Plus className="w-5 h-5 mr-2" />
                Add Show
              </Button>
            )}
          </div>

          <TabsContent value="upcoming" className="pt-6">
            <div>
              <UpcomingShowsTab
                shows={upcomingShows}
                onViewShowDetails={state.handleViewShowDetails}
                onRegisterForShow={state.handleRegisterForShow}
                onAddShow={state.handleAddShow}
              />
            </div>
          </TabsContent>

          <TabsContent value="past" className="pt-6">
            <div>
              <PastShowsTab shows={pastShows} onViewShowDetails={state.handleViewShowDetails} />
            </div>
          </TabsContent>

          <TabsContent value="about" className="pt-6">
            <AboutTab club={selectedClub} />
          </TabsContent>

          <TabsContent value="members" className="pt-6">
            <MembersTab
              club={selectedClub}
              canManageMembers={state.canManageMembers}
              onAddMember={state.handleAddMember}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* All Dialogs and Panels */}
      <ClubDialogs
        club={selectedClub}
        showEditPanel={state.showEditPanel}
        onCloseEditPanel={() => state.setShowEditPanel(false)}
        onSaveEdit={state.handleClubEditComplete}
        showPhotoDialog={state.showPhotoDialog}
        onPhotoDialogChange={state.setShowPhotoDialog}
        previewImage={state.previewImage}
        isDragging={state.isDragging}
        onPhotoDrop={state.handlePhotoDrop}
        onPhotoDragOver={state.handlePhotoDragOver}
        onPhotoDragLeave={state.handlePhotoDragLeave}
        onPhotoFileInput={state.handlePhotoFileInput}
        onPhotoCancel={state.handlePhotoCancel}
        onPhotoSave={state.handlePhotoSave}
        showDeleteDialog={state.showDeleteDialog}
        onDeleteDialogChange={state.setShowDeleteDialog}
        onConfirmDelete={state.handleConfirmDelete}
        isDeleting={state.isDeleting}
        showAddMemberDialog={state.showAddMemberDialog}
        onAddMemberDialogChange={state.setShowAddMemberDialog}
      />
    </div>
  );
};

export { ClubDetails };
