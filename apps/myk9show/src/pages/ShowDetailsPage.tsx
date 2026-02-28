import React, { useState, useEffect, Suspense, startTransition } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import ShowDetailsMain from '@/components/shows/ShowDetailsMain';
import { ShowEditPanel } from '@/components/panels/edit/ShowEditPanel';
import DeleteShowDialog from '@/components/shows/ShowDetails/dialogs/DeleteShowDialog';
import AddTrialDialog from '@/components/trials/AddTrialDialog';
import StandardDialog from '@/components/common/StandardDialog';
import { TrialEditPanel } from '@/components/panels/edit/TrialEditPanel';
import { RegistrationWorkflow } from '@/components/shows/RegistrationWorkflow';
import { RegistrationProvider } from '@/context/RegistrationContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTrialStore, type TrialInput } from '@/store/trialStore';
import { useShowStore } from '@/store/showStore';
import { replicatedShowsTable, type ReplicatedShow } from '@/services/replication';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCompleteShowData } from '@/hooks/useShowScopedData';
import { useShowsQuery, showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useNavigationPerformance } from '@/hooks/useNavigationPerformance';
import type { Trial } from '@/components/trials/types/trial.types';
import type { Show } from '@/types/show-types';
import type { RegistrationFormData } from '@/types/show-registration-types';
import { buildClasses } from '@/utils/designTokens';

const ShowDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { endNavigation } = useNavigationPerformance();

  // Use fast show details loading with cache optimization
  const {
    showId,
    show: currentShow,
    isLoading: fastLoading,
    hasData,
    isFromCache,
  } = useFastShowDetails(id);

  // Track navigation performance when data loads
  useEffect(() => {
    if (currentShow && !fastLoading) {
      endNavigation(isFromCache);
    }
  }, [currentShow, fastLoading, isFromCache, endNavigation]);

  // Get trials from complete show data (only if needed)
  const { trials: showTrials, isLoading: trialsLoading } = useCompleteShowData(id, {
    needsEntries: false,
    needsClasses: false,
  });

  // Get cached shows data from React Query cache (already loaded in BrowseShows)
  const queryClient = useQueryClient();
  const cachedShows = queryClient.getQueryData<Show[]>(['shows', 'list']) || [];
  const { data: shows = cachedShows } = useShowsQuery();

  // Get trials and actions from the store
  const {
    trials,
    addTrial: addTrialToStore,
    updateTrial: updateTrialInStore,
    deleteTrial: deleteTrialFromStore,
  } = useTrialStore();
  const { user } = useAuthContext();

  // Auto-open edit panel when redirected from /secretary/shows/:id/edit
  const [searchParams, setSearchParams] = useSearchParams();
  // Panel state - lazy init from URL so we don't call setState inside a useEffect
  const [showEditPanel, setShowEditPanel] = useState(
    () => new URLSearchParams(window.location.search).get('edit') === 'true'
  );

  // Clean up the ?edit param from the URL after using it on mount
  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      searchParams.delete('edit');
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAddTrialDialog, setShowAddTrialDialog] = useState(false);
  const [showDeleteTrialDialog, setShowDeleteTrialDialog] = useState(false);
  const [showEditTrialPanel, setShowEditTrialPanel] = useState(false);
  const [selectedTrial, setSelectedTrial] = useState<Trial | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);

  // Fallback: Find current show from database if scoped data doesn't have it
  const actualCurrentShow = React.useMemo(() => {
    if (currentShow) return currentShow;
    if (id && shows.length > 0) {
      return shows.find(show => show.id === id) || null;
    }
    return null;
  }, [currentShow, id, shows]);

  // Override hasData to be true if we found the show in database
  const actualHasData = React.useMemo(() => {
    return hasData || actualCurrentShow !== null;
  }, [hasData, actualCurrentShow]);

  // Redirect to browse page if no show ID provided
  useEffect(() => {
    if (!id) {
      navigate('/shows', { replace: true });
    }
  }, [id, navigate]);

  // Enhanced trials data combining store and scoped data
  const combinedTrials = React.useMemo(() => {
    const storeTrials = trials.filter(trial => trial.showId === showId);
    const scopedTrialsFromShow = showTrials.map(trial => ({
      ...trial,
      showId: showId || '',
      showName: actualCurrentShow?.name || '',
      trialDate: trial.date,
      type: trial.name || 'Standard',
      status: trial.status as 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled',
      eventNumber: trial.trialNumber,
      plannedStartTime: '09:00 AM',
      order: trial.trialNumber,
    }));

    return storeTrials.length > 0 ? storeTrials : scopedTrialsFromShow;
  }, [trials, showId, showTrials, actualCurrentShow]);

  // Handler for adding a new trial
  const handleAddTrial = (newTrialDialogData: {
    name: string;
    date: string;
    trialNumber: string;
    status: string;
    eventNumber: string;
    plannedStartTime: string;
    order: string;
    showName: string;
    description?: string;
  }) => {
    const validStatus = newTrialDialogData.status as
      | 'Upcoming'
      | 'In Progress'
      | 'Completed'
      | 'Cancelled';

    const newTrialForStore: TrialInput = {
      showId: showId || '',
      showName: newTrialDialogData.showName || actualCurrentShow?.name || 'Default Show Name',
      name: newTrialDialogData.name,
      trialDate: newTrialDialogData.date,
      trialNumber: newTrialDialogData.trialNumber,
      status: validStatus,
      type: newTrialDialogData.name,
      eventNumber: newTrialDialogData.eventNumber,
      plannedStartTime: newTrialDialogData.plannedStartTime,
      order: newTrialDialogData.order,
    };
    addTrialToStore(newTrialForStore, user?.id || 'unknown');
    setShowAddTrialDialog(false);
  };

  // Handler for editing a trial
  const handleEditTrial = (trial: Trial) => {
    const associatedShow = shows.find(show => show.id === trial.showId);
    const enrichedTrial = {
      ...trial,
      showName: associatedShow?.name || trial.showName || 'Unknown Show',
    };

    setSelectedTrial(enrichedTrial);
    setShowEditTrialPanel(true);
  };

  // Handler for deleting a trial
  const handleDeleteTrial = (trial: Trial) => {
    setSelectedTrial(trial);
    setShowDeleteTrialDialog(true);
  };

  const handleConfirmDeleteTrial = async () => {
    if (selectedTrial) {
      await deleteTrialFromStore(selectedTrial.id);
      if (selectedTrial.showId) {
        navigate(`/shows/${selectedTrial.showId}`);
      }
    }
    setShowDeleteTrialDialog(false);
    setSelectedTrial(null);
  };

  const handleCancelDeleteTrial = () => {
    setShowDeleteTrialDialog(false);
    setSelectedTrial(null);
  };

  // Handler to open Edit panel
  const handleEditShow = () => {
    setShowEditPanel(true);
  };

  // Handler to open Delete dialog
  const handleDeleteShow = () => {
    setShowDeleteDialog(true);
  };

  // Handler for confirming show delete
  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    // Invalidate React Query cache so deleted show disappears from browse
    queryClient.invalidateQueries({ queryKey: ['shows'] });
    setTimeout(() => {
      navigate('/shows');
    }, 100);
  };

  // Handler for registering for show
  function handleRegisterForShow(): void {
    setShowRegistration(true);
  }

  // Handler for registration completion
  function handleRegistrationComplete(_registrationData: RegistrationFormData): void {
    setShowRegistration(false);
  }

  // Render main content based on loading/data state
  const renderContent = () => {
    if (fastLoading || trialsLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <h1 className="text-xl font-medium text-foreground">Loading show data...</h1>
          </div>
        </div>
      );
    }

    if (id && !actualHasData && !actualCurrentShow && shows.length > 0) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">Show Not Found</h1>
            <p className="text-muted-foreground mb-4">The show you're looking for doesn't exist.</p>
            <button
              onClick={() => startTransition(() => navigate('/shows'))}
              className={`${buildClasses.button.primary} px-4 py-2 rounded-lg transition-colors`}
            >
              Back to Shows
            </button>
          </div>
        </div>
      );
    }

    if (actualHasData && actualCurrentShow) {
      return (
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <h1 className="text-xl font-medium text-foreground">Loading show details...</h1>
              </div>
            </div>
          }
        >
          <ShowDetailsMain
            showData={actualCurrentShow}
            associatedTrials={combinedTrials}
            onEditShow={handleEditShow}
            onDeleteShow={handleDeleteShow}
            onEditTrial={handleEditTrial}
            onDeleteTrial={handleDeleteTrial}
            onRegisterForShow={handleRegisterForShow}
          />
        </Suspense>
      );
    }

    if (shows.length === 0) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">No Shows Available</h1>
            <p className="text-muted-foreground mb-6">
              Get started by creating your first show to manage competitions and events.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/secretary/create-show/wizard')}
                className={`${buildClasses.button.primary} px-4 py-2 rounded-lg transition-colors`}
              >
                Create Your First Show
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h1 className="text-xl font-medium text-foreground">Loading...</h1>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderContent()}

      {/* Dialogs */}
      <AddTrialDialog
        open={showAddTrialDialog}
        onOpenChange={setShowAddTrialDialog}
        onSave={handleAddTrial}
        currentShowName={actualCurrentShow?.name}
      />
      <StandardDialog
        open={showDeleteTrialDialog}
        onClose={handleCancelDeleteTrial}
        onSave={handleConfirmDeleteTrial}
        title="Delete Trial"
        description={null}
        saveLabel="Delete"
        cancelLabel="Cancel"
        saveButtonProps={{
          variant: 'destructive',
          className: '!rounded-button whitespace-nowrap',
        }}
        hideSave={false}
      >
        <div className="py-2 text-foreground">
          <p>
            Are you sure you want to delete{' '}
            <b>{selectedTrial?.type || selectedTrial?.trialNumber}</b>?
          </p>
          <p className="mt-2 text-destructive">This action cannot be undone.</p>
        </div>
      </StandardDialog>
      <TrialEditPanel
        open={showEditTrialPanel}
        onClose={() => setShowEditTrialPanel(false)}
        trialId={selectedTrial?.id || ''}
        trialName={selectedTrial?.name || selectedTrial?.type || ''}
        initialTrialData={selectedTrial || {}}
        onSave={async trialData => {
          if (selectedTrial?.id) {
            const updatedTrial = { ...selectedTrial, ...trialData };
            updateTrialInStore(
              selectedTrial.id,
              updatedTrial as Partial<TrialInput>,
              user?.id || 'unknown'
            );
            setShowEditTrialPanel(false);
            setSelectedTrial(null);
          }
        }}
      />
      <ShowEditPanel
        open={showEditPanel}
        onClose={() => setShowEditPanel(false)}
        showId={actualCurrentShow?.id || ''}
        showName={actualCurrentShow?.name || ''}
        initialShowData={actualCurrentShow || {}}
        onSave={async showData => {
          if (actualCurrentShow?.id) {
            // Build replication-layer update from form data
            const replicatedUpdates: Partial<ReplicatedShow> = {};
            const d = showData as Partial<Show>;
            if (d.name !== undefined) replicatedUpdates.name = d.name;
            if (d.type !== undefined) replicatedUpdates.type = d.type;
            if (d.startDate !== undefined) replicatedUpdates.startDate = d.startDate;
            if (d.endDate !== undefined) replicatedUpdates.endDate = d.endDate;
            if (d.location !== undefined) replicatedUpdates.location = d.location;
            if (d.status !== undefined) replicatedUpdates.status = d.status;
            if (d.entryOpenDate !== undefined) replicatedUpdates.entryOpenDate = d.entryOpenDate;
            if (d.entryCloseDate !== undefined) replicatedUpdates.entryCloseDate = d.entryCloseDate;
            if (d.preEntryFee !== undefined)
              replicatedUpdates.preEntryFee = parseFloat(d.preEntryFee);
            if (d.dayOfShowFee !== undefined)
              replicatedUpdates.dayOfShowFee = parseFloat(d.dayOfShowFee);
            if (d.clubId !== undefined) replicatedUpdates.clubId = d.clubId;
            if (d.chairman !== undefined) replicatedUpdates.chairman = d.chairman;
            if (d.secretary !== undefined) replicatedUpdates.secretary = d.secretary;
            if (d.chiefSteward !== undefined) replicatedUpdates.chiefSteward = d.chiefSteward;

            // Save directly via replication layer (reads from IndexedDB, not Zustand)
            await replicatedShowsTable.updateShow(actualCurrentShow.id, replicatedUpdates);

            // Sync React Query cache so the details page reflects changes immediately
            const updatedShow: Show = {
              ...actualCurrentShow,
              ...d,
              _version: actualCurrentShow._version ? actualCurrentShow._version + 1 : 1,
              _lastModified: new Date(),
              _syncStatus: 'pending' as const,
            };
            queryClient.setQueryData(showQueryKeys.detail(actualCurrentShow.id), updatedShow);
            queryClient.setQueryData<Show[]>(showQueryKeys.lists(), old =>
              old ? old.map(s => (s.id === updatedShow.id ? updatedShow : s)) : [updatedShow]
            );

            // Also update Zustand store if it has the show (for other consumers)
            const storeShows = useShowStore.getState().shows;
            if (storeShows.some(s => s.id === actualCurrentShow.id)) {
              useShowStore.setState(state => ({
                shows: state.shows.map(s => (s.id === actualCurrentShow.id ? updatedShow : s)),
              }));
            }
          }
          setShowEditPanel(false);
        }}
      />
      {showDeleteDialog && showId && actualCurrentShow && (
        <DeleteShowDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          showId={showId}
          onDelete={handleConfirmDelete}
          showName={actualCurrentShow.name || 'Unknown Show'}
        />
      )}

      {/* Registration Dialog */}
      <Dialog open={showRegistration} onOpenChange={setShowRegistration}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-background border border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Show Registration</DialogTitle>
          </DialogHeader>
          <RegistrationProvider>
            <Suspense
              fallback={
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="ml-3 text-muted-foreground">Loading registration...</span>
                </div>
              }
            >
              <RegistrationWorkflow
                showId={showId || ''}
                onComplete={data => handleRegistrationComplete(data as RegistrationFormData)}
                onCancel={() => setShowRegistration(false)}
              />
            </Suspense>
          </RegistrationProvider>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ShowDetailsPage;
