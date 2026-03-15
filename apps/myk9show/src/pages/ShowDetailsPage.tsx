import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MapPin, Users as UsersIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShowEditPanel } from '@/components/panels/edit/ShowEditPanel';
import DeleteShowDialog from '@/components/shows/ShowDetails/dialogs/DeleteShowDialog';
import ShowDetailsMain from '@/components/shows/ShowDetailsMain';
import { PublicShowView } from '@/components/shows/PublicShowView';
import type { ShowInput } from '@/store/showStore';
import type { Show } from '@/types/show-types';
import { useShowsQuery, useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useNavigationPerformance } from '@/hooks/useNavigationPerformance';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useTrialStore } from '@/store/trialStore';
import { useMyEntries } from '@/hooks/useMyEntries';
import { MyEntriesTab } from '@/components/shows/tabs/MyEntriesTab';
import { ClassesTab } from '@/components/shows/tabs/ClassesTab';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { NotFoundState } from '@/components/common/NotFoundState';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';

const ShowDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { endNavigation } = useNavigationPerformance();
  const { user, isSecretary, isAdmin } = useAuthContext();
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

  // Get cached shows data from React Query cache
  const queryClient = useQueryClient();
  const cachedShows = queryClient.getQueryData<Show[]>(['shows', 'list']) || [];
  const { data: shows = cachedShows } = useShowsQuery();

  const updateShowMutation = useUpdateShowMutation();

  // Panel state
  const [showEditPanel, setShowEditPanel] = useState(
    () => new URLSearchParams(window.location.search).get('edit') === 'true'
  );
  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      searchParams.delete('edit');
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fallback: Find current show from database
  const actualCurrentShow = useMemo(() => {
    if (currentShow) return currentShow;
    if (id && shows.length > 0) {
      return shows.find(show => show.id === id) || null;
    }
    return null;
  }, [currentShow, id, shows]);

  const canManageShow = isSecretary || isAdmin;
  const actualHasData = hasData || actualCurrentShow !== null;

  // Get associated trials for secretary view
  const showId_ = actualCurrentShow?.id;
  const associatedTrials = useMemo(
    () => (showId_ ? getTrialsByShow(showId_) : []),
    [showId_, getTrialsByShow]
  );

  // Check if user has entries in this show (determines default tab)
  const { entries: userEntries } = useMyEntries(showId_);
  const hasUserEntries = userEntries.length > 0;

  // Tab management via URL search params
  const defaultTab = hasUserEntries ? 'my-entries' : 'overview';
  const activeTab = searchParams.get('tab') || defaultTab;

  const handleTabChange = (tab: string) => {
    const params = new URLSearchParams(searchParams);
    if (tab === defaultTab) {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    setSearchParams(params, { replace: true });
  };

  // Redirect if no show ID
  useEffect(() => {
    if (!id) {
      navigate('/shows', { replace: true });
    }
  }, [id, navigate]);

  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    queryClient.invalidateQueries({ queryKey: ['shows'] });
    setTimeout(() => navigate('/shows'), 100);
  };

  function handleRegisterForShow(): void {
    if (showId) {
      navigate(`/shows/${showId}/register`);
    }
  }

  // Breadcrumbs for PageHeader
  const breadcrumbs = useMemo(
    () => [
      { label: 'Shows', href: '/shows' },
      { label: actualCurrentShow?.name || 'Show Details', href: `/shows/${id}` },
    ],
    [actualCurrentShow?.name, id]
  );

  // DetailHero metadata
  const heroMetadata = useMemo(() => {
    if (!actualCurrentShow) return [];
    const items = [];
    if (actualCurrentShow.startDate) {
      const start = new Date(actualCurrentShow.startDate).toLocaleDateString();
      const end = actualCurrentShow.endDate
        ? new Date(actualCurrentShow.endDate).toLocaleDateString()
        : null;
      items.push({
        label: end && end !== start ? `${start} - ${end}` : start,
        icon: <CalendarDays className="h-4 w-4" />,
      });
    }
    if (actualCurrentShow.location) {
      items.push({
        label: actualCurrentShow.location,
        icon: <MapPin className="h-4 w-4" />,
      });
    }
    if (actualCurrentShow.clubName) {
      items.push({
        label: actualCurrentShow.clubName,
        icon: <UsersIcon className="h-4 w-4" />,
      });
    }
    return items;
  }, [actualCurrentShow]);

  // Loading state
  if (fastLoading) {
    return (
      <PageShell>
        <LoadingSkeleton variant="cards" count={3} />
      </PageShell>
    );
  }

  // Not found state
  if (id && !actualHasData && !actualCurrentShow) {
    return (
      <PageShell>
        <NotFoundState entityName="Show" backTo="/shows" backLabel="Back to Shows" />
      </PageShell>
    );
  }

  // No shows at all
  if (!actualCurrentShow) {
    return (
      <PageShell>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <h1 className="text-xl font-medium text-foreground">Loading...</h1>
          </div>
        </div>
      </PageShell>
    );
  }

  // Define available tabs
  const isAuthenticated = !!user;
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'classes', label: 'Classes' },
    ...(isAuthenticated ? [{ id: 'my-entries', label: 'My Entries' }] : []),
    ...(isAuthenticated ? [{ id: 'results', label: 'Results' }] : []),
  ];

  return (
    <>
      <PageShell>
        <PageHeader
          breadcrumbs={breadcrumbs}
          title={actualCurrentShow.name || 'Show Details'}
          actions={
            canManageShow ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowEditPanel(true)}
                  className="h-10 px-4 text-sm font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors"
                >
                  Edit
                </button>
              </div>
            ) : undefined
          }
        />

        <DetailHero
          name={actualCurrentShow.name || 'Untitled Show'}
          metadata={heroMetadata}
          primaryAction={{
            label: 'Register',
            onClick: handleRegisterForShow,
          }}
        />

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList
            className="grid w-full bg-muted/50 border border-border/30 rounded-xl p-1 h-auto"
            style={{
              gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
            }}
          >
            {tabs.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview">
            {canManageShow ? (
              <ShowDetailsMain
                showData={actualCurrentShow}
                associatedTrials={associatedTrials}
                onEditShow={() => setShowEditPanel(true)}
                onDeleteShow={() => setShowDeleteDialog(true)}
                onRegisterForShow={handleRegisterForShow}
              />
            ) : (
              <PublicShowView show={actualCurrentShow} onRegister={handleRegisterForShow} />
            )}
          </TabsContent>

          <TabsContent value="classes">
            <ClassesTab classes={[]} userHasEntries={hasUserEntries} />
          </TabsContent>

          {isAuthenticated && (
            <TabsContent value="my-entries">
              <MyEntriesTab showId={actualCurrentShow.id} />
            </TabsContent>
          )}

          {isAuthenticated && (
            <TabsContent value="results">
              <div className="py-12 text-center text-muted-foreground">
                <p className="text-lg font-medium">Results</p>
                <p className="text-sm mt-1">Results will appear here after classes are scored.</p>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </PageShell>

      {/* Dialogs */}
      <ShowEditPanel
        open={showEditPanel}
        onClose={() => setShowEditPanel(false)}
        showId={actualCurrentShow.id || ''}
        showName={actualCurrentShow.name || ''}
        initialShowData={actualCurrentShow || {}}
        onSave={async showData => {
          if (actualCurrentShow.id) {
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
