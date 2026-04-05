import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Trophy,
  ListChecks,
  ClipboardList,
  Medal,
  BarChart3,
  Trash2,
  Pencil,
} from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useUrlTab } from '@/hooks/useUrlTab';
import { ShowEditPanel } from '@/components/panels/edit/ShowEditPanel';
import DeleteShowDialog from '@/components/shows/ShowDetails/dialogs/DeleteShowDialog';
import { ShowOverviewTab } from '@/components/shows/tabs/ShowOverviewTab';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { ShowResultsTab } from '@/components/results/ShowResultsTab';
import { TrialsTab, type TrialStats } from '@/components/shows/tabs/TrialsTab';
import type { ShowInput } from '@/store/showStore';
import type { Show } from '@/types/show-types';
import {
  useShowsQuery,
  useUpdateShowMutation,
  showQueryKeys,
} from '@/hooks/queries/useShowsDatabase';
import { persistShowJudgeAssignments } from '@/services/database/queries/judgeQueries';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useNavigationPerformance } from '@/hooks/useNavigationPerformance';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import { CLASS_STATUS } from '@myk9/core';
import { useMyEntries } from '@/hooks/useMyEntries';
import { MyEntriesTab } from '@/components/shows/tabs/MyEntriesTab';
import { getEntryStatus, type EntryStatus } from '@/utils/entryStatusUtils';
import { MyShowStatsTab } from '@/components/analytics/MyShowStatsTab';
import { ClassesTab } from '@/components/shows/tabs/ClassesTab';
import { ArmbandLookup } from '@/components/shows/ArmbandLookup';
import { useArmbandCount } from '@/hooks/queries/useArmbandLookup';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { NotFoundState } from '@/components/common/NotFoundState';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ErrorState } from '@/components/common/ErrorState';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu/ThreeDotMenu';

const ENTRY_STATUS_HERO_VARIANT: Record<
  EntryStatus,
  'success' | 'warning' | 'destructive' | 'default'
> = {
  accepting: 'success',
  closing_soon: 'warning',
  closed: 'destructive',
  submitted: 'default',
  not_yet_open: 'default',
};

const ShowDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { endNavigation } = useNavigationPerformance();
  const { user, isSecretary, isAdmin } = useAuthContext();
  const trials = useTrialStore(s => s.trials);
  const trialClasses = useTrialStore(s => s.trialClasses);

  // Use fast show details loading with cache optimization
  const {
    showId,
    show: currentShow,
    isLoading: fastLoading,
    isError: fastError,
    refetch: refetchShow,
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

  const { data: armbandCount } = useArmbandCount(actualCurrentShow?.id);
  const canManageShow = isSecretary || isAdmin;

  // Get associated trials for secretary view
  const showId_ = actualCurrentShow?.id;
  const associatedTrials = useMemo(
    () =>
      showId_
        ? trials
            .filter(t => t.showId === showId_)
            .sort((a, b) => {
              const orderA = a.order ? parseInt(a.order, 10) : Infinity;
              const orderB = b.order ? parseInt(b.order, 10) : Infinity;
              if (orderA !== orderB) return orderA - orderB;
              return (a.trialDate || '').localeCompare(b.trialDate || '');
            })
        : [],
    [showId_, trials]
  );

  // Check if user has entries in this show (determines default tab)
  // Only enable polling when the My Entries tab is active (fix #3)
  const { entries: userEntries } = useMyEntries(showId_);
  const hasUserEntries = userEntries.length > 0;

  // Tab state — URL-synced with dynamic allowed tabs
  const isAuthenticated = !!user;
  const allowedTabs = useMemo(
    () =>
      isAuthenticated
        ? ['overview', 'trials', 'classes', 'my-entries', 'my-stats', 'results']
        : ['overview', 'trials', 'classes', 'results'],
    [isAuthenticated]
  );
  const [activeTab, setTab] = useUrlTab(allowedTabs, 'overview');

  // Flatten trial classes into ClassInfo for ClassesTab
  const showClasses = useMemo(() => {
    const userEntryClassIds = new Set(userEntries.map(e => e.id));
    return associatedTrials.flatMap(trial => {
      const classes: SyncableTrialClass[] = trialClasses[trial.id] || [];
      return classes.map(cls => ({
        id: cls.id,
        name: `${cls.element} ${cls.level}`,
        element: cls.element,
        level: cls.level,
        section: cls.section || '',
        judgeName: cls.judgeName || '',
        trialId: trial.id,
        time: cls.startTime || '',
        ring: 0,
        status: cls.status || CLASS_STATUS.SCHEDULED,
        entryCount: cls.entries || 0,
        scoredCount: cls.completedEntries ?? 0,
        userHasEntry: userEntryClassIds.has(cls.id),
        trialDate: trial.trialDate || '',
        trialNumber: trial.trialNumber || '',
        trialName: trial.name || '',
      }));
    });
  }, [associatedTrials, trialClasses, userEntries]);

  // Trial statistics for card display (class counts, entry counts, scoring progress)
  const trialStats = useMemo(() => {
    const stats: Record<string, TrialStats> = {};
    for (const trial of associatedTrials) {
      const classes = trialClasses[trial.id] || [];
      stats[trial.id] = {
        classCount: classes.length,
        entryCount: classes.reduce((sum, cls) => sum + (cls.entries ?? 0), 0),
        completedClasses: classes.filter(cls => cls.status === CLASS_STATUS.COMPLETED).length,
      };
    }
    return stats;
  }, [associatedTrials, trialClasses]);

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

  // Tab definitions for PrimaryTabs (must be before early returns — rules of hooks)
  const tabDefs: PrimaryTabDef[] = useMemo(
    () => [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'trials', label: 'Trials', icon: Trophy, count: associatedTrials.length },
      { id: 'classes', label: 'Classes', icon: ListChecks, count: showClasses.length },
      ...(isAuthenticated
        ? [
            { id: 'my-entries', label: 'Entries', icon: ClipboardList, count: userEntries.length },
            { id: 'my-stats', label: 'My Stats', icon: BarChart3 },
          ]
        : []),
      { id: 'results', label: 'Results', icon: Medal, count: 0 },
    ],
    [isAuthenticated, associatedTrials.length, showClasses.length, userEntries.length]
  );

  // Loading state
  if (fastLoading) {
    return (
      <PageShell>
        <LoadingSkeleton variant="cards" count={3} />
      </PageShell>
    );
  }

  // Error state — fetch failed
  if (fastError) {
    return (
      <PageShell>
        <ErrorState message="We couldn't load this show. Please try again." onRetry={refetchShow} />
      </PageShell>
    );
  }

  // Not found / no data
  if (!actualCurrentShow) {
    return (
      <PageShell>
        <NotFoundState entityName="Show" backTo="/shows" backLabel="Back to Shows" />
      </PageShell>
    );
  }

  const entryStatus = getEntryStatus(actualCurrentShow, hasUserEntries);

  return (
    <>
      <PageShell>
        <PageHeader
          breadcrumbs={breadcrumbs}
          title={actualCurrentShow.name || 'Show Details'}
          actions={
            (armbandCount ?? 0) > 0 && actualCurrentShow?.id ? (
              <ArmbandLookup showId={actualCurrentShow.id} />
            ) : undefined
          }
        />

        <DetailHero
          name={actualCurrentShow.name || 'Untitled Show'}
          subtitle={actualCurrentShow.clubName || undefined}
          badge={
            actualCurrentShow.organization
              ? { label: actualCurrentShow.organization, variant: 'default' }
              : undefined
          }
          entryStatusBadge={{
            label: entryStatus.label,
            variant: ENTRY_STATUS_HERO_VARIANT[entryStatus.status],
          }}
          metadata={[]}
          closedMessage={!entryStatus.canEnter ? entryStatus.description : undefined}
          {...(entryStatus.canEnter
            ? { primaryAction: { label: 'Register', onClick: handleRegisterForShow } }
            : {})}
          secondaryActions={
            canManageShow && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setShowEditPanel(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <ThreeDotMenu
                  items={[
                    {
                      label: 'Delete Show',
                      icon: <Trash2 className="h-4 w-4" />,
                      onClick: () => setShowDeleteDialog(true),
                      className: 'text-destructive',
                    },
                  ]}
                />
              </div>
            )
          }
          footer={<QuickInfoCards show={actualCurrentShow} />}
        />

        <PrimaryTabs tabs={tabDefs} value={activeTab} onValueChange={setTab}>
          <TabsContent value="overview">
            <ShowOverviewTab show={actualCurrentShow} />
          </TabsContent>

          <TabsContent value="trials">
            <TrialsTab
              trials={associatedTrials}
              showId={actualCurrentShow.id}
              trialStats={trialStats}
            />
          </TabsContent>

          <TabsContent value="classes">
            <ClassesTab
              classes={showClasses}
              showId={actualCurrentShow.id}
              userHasEntries={hasUserEntries}
              hideRing={associatedTrials.some(
                t =>
                  t.trialType === 'Scent Work' ||
                  t.trialType === 'Nosework' ||
                  t.trialType === 'Scent Detection'
              )}
            />
          </TabsContent>

          {isAuthenticated && (
            <TabsContent value="my-entries">
              <MyEntriesTab showId={actualCurrentShow.id} />
            </TabsContent>
          )}

          {isAuthenticated && (
            <TabsContent value="my-stats">
              <MyShowStatsTab showId={actualCurrentShow.id} />
            </TabsContent>
          )}

          <TabsContent value="results">
            <ShowResultsTab showId={actualCurrentShow.id} />
          </TabsContent>
        </PrimaryTabs>
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
            const showId = actualCurrentShow.id;
            await updateShowMutation.mutateAsync({
              id: showId,
              updates: showData as Partial<ShowInput>,
            });

            // Persist judge assignments to judge_assignments table
            await persistShowJudgeAssignments(showId, showData.assignedJudges || []);

            // Re-invalidate show cache after judge assignments are saved
            queryClient.invalidateQueries({ queryKey: showQueryKeys.detail(showId) });
            queryClient.invalidateQueries({ queryKey: showQueryKeys.lists() });
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
