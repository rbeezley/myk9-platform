import React, { useState, useEffect, useMemo, startTransition } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PublicShowView } from '@/components/shows/PublicShowView';
import ShowDetailsMain from '@/components/shows/ShowDetailsMain';
import { ShowEditPanel } from '@/components/panels/edit/ShowEditPanel';
import DeleteShowDialog from '@/components/shows/ShowDetails/dialogs/DeleteShowDialog';
import type { ShowInput } from '@/store/showStore';
import { useShowsQuery, useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useNavigationPerformance } from '@/hooks/useNavigationPerformance';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useTrialStore } from '@/store/trialStore';
import type { Show } from '@/types/show-types';
import { Button } from '@/components/ui/button';

const ShowDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { endNavigation } = useNavigationPerformance();
  const { isSecretary, isAdmin } = useAuthContext();
  const getTrialsByShow = useTrialStore(s => s.getTrialsByShow);

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

  // Get cached shows data from React Query cache (already loaded in BrowseShows)
  const queryClient = useQueryClient();
  const cachedShows = queryClient.getQueryData<Show[]>(['shows', 'list']) || [];
  const { data: shows = cachedShows } = useShowsQuery();

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

  // Whether the current user can manage this show (secretary or admin)
  const canManageShow = isSecretary || isAdmin;

  // Get associated trials for secretary view
  const associatedTrials = useMemo(
    () => (actualCurrentShow?.id ? getTrialsByShow(actualCurrentShow.id) : []),
    [actualCurrentShow?.id, getTrialsByShow]
  );

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
    if (fastLoading) {
      return (
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
          <div className="h-8 w-48 bg-muted/50 rounded-lg animate-pulse" />
          <div className="h-48 bg-muted/50 rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-muted/50 rounded-lg animate-pulse" />
        </div>
      );
    }

    if (id && !actualHasData && !actualCurrentShow && shows.length > 0) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">Show Not Found</h1>
            <p className="text-muted-foreground mb-4">The show you're looking for doesn't exist.</p>
            <Button onClick={() => startTransition(() => navigate('/shows'))}>Back to Shows</Button>
          </div>
        </div>
      );
    }

    if (actualHasData && actualCurrentShow) {
      if (canManageShow) {
        return (
          <ShowDetailsMain
            showData={actualCurrentShow}
            associatedTrials={associatedTrials}
            onEditShow={() => setShowEditPanel(true)}
            onDeleteShow={() => setShowDeleteDialog(true)}
            onRegisterForShow={handleRegisterForShow}
          />
        );
      }
      return <PublicShowView show={actualCurrentShow} onRegister={handleRegisterForShow} />;
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
              <Button onClick={() => navigate('/secretary/create-show/wizard')}>
                Create Your First Show
              </Button>
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
