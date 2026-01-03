import React, { useState, useEffect, Suspense, startTransition } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import ShowDetailsMain from '@/components/shows/ShowDetailsMain';
import { ShowGroupedSidebar } from '@/components/shows/ShowDetails/ShowGroupedSidebar';
import { ShowEditPanel } from '@/components/panels/edit/ShowEditPanel';
import DeleteShowDialog from '@/components/shows/ShowDetails/dialogs/DeleteShowDialog';
import { ShowCreationWizard } from '@/components/shows/wizard/ShowCreationWizard';
import AddTrialDialog from '@/components/trials/AddTrialDialog';
import StandardDialog from '@/components/common/StandardDialog';
import { TrialEditPanel } from '@/components/panels/edit/TrialEditPanel';
import { RegistrationWorkflow } from '@/components/shows/RegistrationWorkflow';
import { RegistrationProvider } from '@/context/RegistrationContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { useTrialStore, type TrialInput } from '@/store/trialStore';
import { useCompleteShowData } from '@/hooks/useShowScopedData';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
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
    isFromCache
    // loadTime - available but unused
  } = useFastShowDetails(id);
  
  // Track navigation performance when data loads
  useEffect(() => {
    if (currentShow && !fastLoading) {
      endNavigation(isFromCache);
    }
  }, [currentShow, fastLoading, isFromCache, endNavigation]);
  
  // Get trials from complete show data (only if needed)
  const {
    trials: showTrials,
    isLoading: trialsLoading
    // selectShow - available but unused
  } = useCompleteShowData(id, {
    needsEntries: false,
    needsClasses: false
  });
  
  // Get cached shows data from React Query cache (already loaded in BrowseShows)
  const queryClient = useQueryClient();
  const cachedShows = queryClient.getQueryData<Show[]>(['shows', 'list']) || [];
  const { data: shows = cachedShows } = useShowsQuery();
  
  // Get trials and actions from the store - moved to top to avoid conditional hooks
  const {
    trials,
    addTrial: addTrialToStore,
    updateTrial: updateTrialInStore,
    removeTrial: removeTrialFromStore,
  } = useTrialStore();
  
  // Panel state
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showWizardDialog, setShowWizardDialog] = useState(false);
  const [showAddTrialDialog, setShowAddTrialDialog] = useState(false);
  const [showDeleteTrialDialog, setShowDeleteTrialDialog] = useState(false);
  const [showEditTrialPanel, setShowEditTrialPanel] = useState(false);
  const [selectedTrial, setSelectedTrial] = useState<Trial | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);
  
  // State for sidebar and selection - moved to top level
  const [searchTerm, setSearchTerm] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    return hasData || (actualCurrentShow !== null);
  }, [hasData, actualCurrentShow]);

  // Handle navigation and fallback to first show if needed
  useEffect(() => {
    if (!id && shows.length > 0) {
      // If no ID in URL, redirect to first show
      startTransition(() => {
        navigate(`/shows/${shows[0].id}`, { replace: true });
      });
    }
  }, [id, shows, navigate]);

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
      order: trial.trialNumber
    }));
    
    // Combine both sources, preferring store trials if they exist
    return storeTrials.length > 0 ? storeTrials : scopedTrialsFromShow;
  }, [trials, showId, showTrials, actualCurrentShow]);

  // Handler for adding a new trial
  const handleAddTrial = (newTrialDialogData: { name: string; date: string; trialNumber: string; status: string; eventNumber: string; plannedStartTime: string; order: string; showName: string; description?: string; }) => { 
    // Assuming AddTrialDialog provides a status string that is one of the valid Trial statuses.
    // A more robust solution would be to validate this or have AddTrialDialog use a stricter type.
    const validStatus = newTrialDialogData.status as 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled';

    const newTrialForStore: TrialInput = {
      showId: showId || '', // Use the scoped show ID
      showName: newTrialDialogData.showName || actualCurrentShow?.name || 'Default Show Name', // Use provided or current show's name
      name: newTrialDialogData.name, // Add name field for TrialInput
      trialDate: newTrialDialogData.date,
      trialNumber: newTrialDialogData.trialNumber,
      status: validStatus, // Use the asserted status
      type: newTrialDialogData.name, // Map dialog's 'name' to store's 'type'
      eventNumber: newTrialDialogData.eventNumber,
      plannedStartTime: newTrialDialogData.plannedStartTime,
      order: newTrialDialogData.order
    };
    addTrialToStore(newTrialForStore);
    setShowAddTrialDialog(false);
  };

  // Handler for editing a trial
  const handleEditTrial = (trial: Trial) => {
    // Ensure the trial has the correct showName by looking it up from the show store
    const associatedShow = shows.find(show => show.id === trial.showId);
    const enrichedTrial = {
      ...trial,
      showName: associatedShow?.name || trial.showName || 'Unknown Show'
    };
    
    setSelectedTrial(enrichedTrial);
    setShowEditTrialPanel(true);
  };

  // Handler for deleting a trial
  const handleDeleteTrial = (trial: Trial) => {
    setSelectedTrial(trial);
    setShowDeleteTrialDialog(true);
  };
  const handleConfirmDeleteTrial = () => {
    if (selectedTrial) {
      removeTrialFromStore(selectedTrial.id);
      // Navigate back to parent show after trial deletion
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

  // Sidebar search term already defined above

  // Sidebar search and selection logic - removed unused filteredShows


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
    // Close dialog first to avoid rendering issues
    setShowDeleteDialog(false);
    
    // Small delay to ensure state is updated before navigation
    setTimeout(() => {
      // Navigate to shows list after successful delete
      navigate('/shows');
    }, 100);
  };


  // Handler for registering for show
  const handleRegisterForShow = () => {
    console.log('Register for show:', actualCurrentShow?.name);
    setShowRegistration(true);
  };

  // Handler for registration completion
  const handleRegistrationComplete = (registrationData: RegistrationFormData) => {
    console.log('Registration completed:', registrationData);
    setShowRegistration(false);
    // TODO: Handle registration success (show toast, update UI, etc.)
  };


  // Layout assembly only - match AdminLayout structure
  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Fixed sidebar that starts from top like AdminLayout */}
      <div className={`fixed inset-y-0 left-0 z-[60] w-72 bg-card border-r border-border transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <ShowGroupedSidebar
          shows={shows}
          selectedId={showId}
          onSelect={(id) => {
            // Navigate to the selected show instead of just updating store
            startTransition(() => {
              navigate(`/shows/${id}`);
            });
          }}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onCloseMobile={() => setSidebarOpen(false)}
          onAdd={() => setShowWizardDialog(true)}
        />
      </div>
      
      {/* Main content with left margin to account for fixed sidebar */}
      <main className="flex-1 overflow-auto md:ml-72 pt-16">
        {/* Mobile menu button */}
        <div className="md:hidden p-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            className="mb-4"
          >
            <Menu className="h-4 w-4 mr-2" />
            Shows Menu
          </Button>
        </div>
        
        {(fastLoading || trialsLoading) ? (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <h1 className="text-xl font-medium text-foreground">Loading show data...</h1>
            </div>
          </div>
        ) : id && !actualHasData && !actualCurrentShow && shows.length > 0 ? (
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
        ) : actualHasData && actualCurrentShow ? (
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <h1 className="text-xl font-medium text-foreground">Loading show details...</h1>
              </div>
            </div>
          }>
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
        ) : shows.length === 0 ? (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground mb-4">No Shows Available</h1>
              <p className="text-muted-foreground mb-6">
                Get started by creating your first show to manage competitions and events.
              </p>
              <div className="flex gap-3 justify-center">
                <button 
                  onClick={() => setShowWizardDialog(true)}
                  className={`${buildClasses.button.primary} px-4 py-2 rounded-lg transition-colors`}
                >
                  Create Your First Show
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <h1 className="text-xl font-medium text-foreground">Loading...</h1>
            </div>
          </div>
        )}
      </main>
      
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
          className: '!rounded-button whitespace-nowrap'
        }}
        hideSave={false}
      >
        <div className="py-2 text-foreground">
          <p>Are you sure you want to delete <b>{selectedTrial?.type || selectedTrial?.trialNumber}</b>?</p>
          <p className="mt-2 text-destructive">This action cannot be undone.</p>
        </div>
      </StandardDialog>
      <TrialEditPanel
        open={showEditTrialPanel}
        onClose={() => setShowEditTrialPanel(false)}
        trialId={selectedTrial?.id || ''}
        trialName={selectedTrial?.name || selectedTrial?.type || ''}
        initialTrialData={selectedTrial || {}}
        onSave={async (trialData) => {
          if (selectedTrial?.id && trialData.id) {
            const updatedTrial = { ...selectedTrial, ...trialData };
            updateTrialInStore(updatedTrial.id, updatedTrial);
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
        onSave={async () => {
          // The panel handles the actual saving, we just close it
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
      
      {/* Show Creation Wizard */}
      <ShowCreationWizard
        open={showWizardDialog}
        onOpenChange={setShowWizardDialog}
      />
      
      {/* Registration Dialog */}
      <Dialog open={showRegistration} onOpenChange={setShowRegistration}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-background border border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Show Registration</DialogTitle>
          </DialogHeader>
          <RegistrationProvider>
            <Suspense fallback={
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Loading registration...</span>
              </div>
            }>
              <RegistrationWorkflow
                showId={showId || ''}
                onComplete={(data) => handleRegistrationComplete(data as RegistrationFormData)}
                onCancel={() => setShowRegistration(false)}
              />
            </Suspense>
          </RegistrationProvider>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ShowDetailsPage;
