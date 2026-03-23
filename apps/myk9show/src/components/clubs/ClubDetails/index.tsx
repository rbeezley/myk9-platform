import React, { useCallback, useMemo, useRef } from 'react';
import { Plus, Calendar, History, Info, Users, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { logger } from '@/services/LoggingService';
import type { ClubDetailsProps, ClubTab } from './types';
import { ClubHeader } from './ClubHeader';
import { ClubStatistics } from './ClubStatistics';
import { UpcomingShowsTab } from './UpcomingShowsTab';
import { PastShowsTab } from './PastShowsTab';
import { AboutTab } from './AboutTab';
import { MembersTab } from './MembersTab';
import { BrandingTab } from './BrandingTab';
import { ClubDialogs } from './ClubDialogs';
import { useClubDetailsState } from './useClubDetailsState';

export type { ClubDetailsProps };

const ClubDetails: React.FC<ClubDetailsProps> = ({ selectedClub }) => {
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

  // Build tab definitions — must be before early returns (rules of hooks)
  const { upcomingShows, pastShows } = state;
  const tabDefs: PrimaryTabDef[] = useMemo(() => {
    const tabs: PrimaryTabDef[] = [
      { id: 'upcoming', label: 'Upcoming Shows', icon: Calendar, count: upcomingShows.length },
      { id: 'past', label: 'Past Shows', icon: History, count: pastShows.length },
      { id: 'about', label: 'About', icon: Info },
      {
        id: 'members',
        label: 'Members',
        icon: Users,
        count: selectedClub?.memberIds?.length || 0,
      },
    ];
    if (state.canEditBranding) {
      tabs.push({ id: 'branding', label: 'Branding', icon: Palette });
    }
    return tabs;
  }, [
    upcomingShows.length,
    pastShows.length,
    selectedClub?.memberIds?.length,
    state.canEditBranding,
  ]);

  if (!selectedClub) {
    return <div className="flex items-center justify-center text-gray-500">No club selected.</div>;
  }

  if (!selectedClub.id || !selectedClub.name) {
    logger.error('Invalid club data', 'clubs', { selectedClub });
    return <div className="flex items-center justify-center text-gray-500">Invalid club data.</div>;
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-20">
      {/* Enhanced Header with logo and club info */}
      <ClubHeader
        club={selectedClub}
        onEditClub={state.handleEditClub}
        onEditPhoto={state.handleEditPhoto}
        onDeleteClub={state.handleDeleteClub}
        onCoverUpload={state.handleCoverUpload}
        onCoverRemove={state.handleCoverRemove}
        isUploadingCover={state.isUploadingCover}
        canEditBranding={state.canEditBranding}
      />

      {/* Statistics Cards */}
      <ClubStatistics stats={state.stats} onTabChange={handleStatCardClick} />

      {/* Tabs Section */}
      <div ref={tabsRef} className="mb-6">
        <PrimaryTabs
          tabs={tabDefs}
          value={state.activeTab}
          onValueChange={value => state.setActiveTab(value as ClubTab)}
        >
          <TabsContent value="upcoming" className="pt-6">
            <div className="flex justify-end mb-4">
              {upcomingShows.length > 0 && (
                <Button onClick={state.handleAddShow} className="min-h-[44px]">
                  <Plus className="w-5 h-5 mr-2" />
                  Add Show
                </Button>
              )}
            </div>
            <UpcomingShowsTab
              shows={upcomingShows}
              onViewShowDetails={state.handleViewShowDetails}
              onRegisterForShow={state.handleRegisterForShow}
              onAddShow={state.handleAddShow}
            />
          </TabsContent>

          <TabsContent value="past" className="pt-6">
            <PastShowsTab shows={pastShows} onViewShowDetails={state.handleViewShowDetails} />
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

          {state.canEditBranding && (
            <TabsContent value="branding" className="pt-6">
              <BrandingTab
                club={selectedClub}
                onSaveAccentColor={state.handleSaveAccentColor}
                onEditPhoto={state.handleEditPhoto}
                onCoverUpload={state.handleCoverUpload}
                onCoverRemove={state.handleCoverRemove}
                isUploadingCover={state.isUploadingCover}
              />
            </TabsContent>
          )}
        </PrimaryTabs>
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
