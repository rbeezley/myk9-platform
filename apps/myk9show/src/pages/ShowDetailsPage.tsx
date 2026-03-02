import React, { useState, useEffect, Suspense, startTransition } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import ShowDetailsMain from '@/components/shows/ShowDetailsMain';
import { ShowEditPanel } from '@/components/panels/edit/ShowEditPanel';
import DeleteShowDialog from '@/components/shows/ShowDetails/dialogs/DeleteShowDialog';
import { useTrialStore } from '@/store/trialStore';
import type { ShowInput } from '@/store/showStore';
import { useCompleteShowData } from '@/hooks/useShowScopedData';
import { useShowsQuery, useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useNavigationPerformance } from '@/hooks/useNavigationPerformance';
import type { Show } from '@/types/show-types';
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

  // Get trials from the store
  const { trials } = useTrialStore();
  const updateShowMutation = useUpdateShowMutation();

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

  // Handler for registering for show — navigate to wizard page
  function handleRegisterForShow(): void {
    if (showId) {
      navigate(`/shows/${showId}/register`);
    }
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
      <ShowEditPanel
        open={showEditPanel}
        onClose={() => setShowEditPanel(false)}
        showId={actualCurrentShow?.id || ''}
        showName={actualCurrentShow?.name || ''}
        initialShowData={actualCurrentShow || {}}
        onSave={async showData => {
          if (actualCurrentShow?.id) {
            await updateShowMutation.mutateAsync({
              id: actualCurrentShow.id,
              updates: showData as Partial<ShowInput>,
            });
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
    </>
  );
};

export default ShowDetailsPage;
