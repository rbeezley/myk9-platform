/**
 * Waitlist Management Page
 *
 * Allows trial secretaries to view and manage class waitlists.
 * Features: class selection, waitlist viewing, promote to accepted, remove from waitlist.
 */

import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { useWaitlistManagementData } from './useWaitlistManagementData';
import { WaitlistPageHeader } from './WaitlistPageHeader';
import { ShowClassSelection } from './ShowClassSelection';
import { ClassStatsCards } from './ClassStatsCards';
import { WaitlistTable } from './WaitlistTable';
import { WaitlistActionDialog } from './WaitlistActionDialog';
import { AccessRestrictedState, NoShowSelectedState } from './EmptyStates';

const WaitlistManagementPage: React.FC = () => {
  const { hasRole } = useAuthContext();

  const {
    shows,
    selectedShowId,
    classes,
    selectedClassId,
    filteredEntries,
    selectedClass,
    isLoadingShows,
    isLoadingClasses,
    isLoadingWaitlist,
    isProcessing,
    error,
    searchTerm,
    actionDialog,
    setSelectedShowId,
    setSelectedClassId,
    setSearchTerm,
    setActionDialog,
    handleOfferSpot,
    handleRemoveFromWaitlist,
    handleRefresh,
  } = useWaitlistManagementData();

  // Verify secretary role access
  if (!hasRole(UserRole.SECRETARY) && !hasRole(UserRole.CLUB_ADMIN) && !hasRole(UserRole.SITE_ADMIN)) {
    return <AccessRestrictedState />;
  }

  const closeDialog = () => {
    setActionDialog({ open: false, action: null, entry: null });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <WaitlistPageHeader
        onRefresh={handleRefresh}
        isRefreshDisabled={!selectedShowId}
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ShowClassSelection
        shows={shows}
        selectedShowId={selectedShowId}
        onShowChange={setSelectedShowId}
        isLoadingShows={isLoadingShows}
        classes={classes}
        selectedClassId={selectedClassId}
        onClassChange={setSelectedClassId}
        isLoadingClasses={isLoadingClasses}
      />

      {selectedClass && <ClassStatsCards selectedClass={selectedClass} />}

      {selectedClassId && (
        <WaitlistTable
          entries={filteredEntries}
          selectedClass={selectedClass}
          isLoading={isLoadingWaitlist}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onSetActionDialog={setActionDialog}
        />
      )}

      {!selectedShowId && !isLoadingShows && <NoShowSelectedState />}

      <WaitlistActionDialog
        actionDialog={actionDialog}
        selectedClass={selectedClass}
        isProcessing={isProcessing}
        onClose={closeDialog}
        onOfferSpot={handleOfferSpot}
        onRemove={handleRemoveFromWaitlist}
      />
    </div>
  );
};

export default WaitlistManagementPage;
