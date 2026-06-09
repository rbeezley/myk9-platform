import React, { Suspense, useEffect, useMemo } from 'react';
import { getShowStyle } from '@/features/registries';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import { Navigate, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Trophy,
  ListChecks,
  ClipboardList,
  Medal,
  BarChart3,
  ListTree,
} from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useUrlTab } from '@/hooks/useUrlTab';
import { ShowOverviewTab } from '@/components/shows/tabs/ShowOverviewTab';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { resolveOverviewJudgesWithRoster } from '@/components/shows/overview/overviewJudges';
import { ShowResultsTab } from '@/components/results/ShowResultsTab';
import { TrialsTab, type TrialStats } from '@/components/shows/tabs/TrialsTab';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useNavigationPerformance } from '@/hooks/useNavigationPerformance';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import { CLASS_STATUS } from '@myk9/core';
import { useMyEntries } from '@/hooks/useMyEntries';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { MyEntriesTab } from '@/components/shows/tabs/MyEntriesTab';
import { EntriesTab } from '@/components/shows/ShowDetails/EntriesTab';
import { getEntryStatus, type EntryStatus } from '@/utils/entryStatusUtils';
import { MyShowStatsTab } from '@/components/analytics/MyShowStatsTab';
import { ClassesTab } from '@/components/shows/tabs/ClassesTab';
import { ArmbandLookup } from '@/components/shows/ArmbandLookup';
import { useArmbandCount } from '@/hooks/queries/useArmbandLookup';
import { features } from '@/config/features';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { NotFoundState } from '@/components/common/NotFoundState';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { ShowDateBlock } from '@/components/shows/ShowDateBlock';
import { countCatalogEntries } from '@/features/show-map/entryCounts';
import { ShowPresenceProvider } from '@/features/show-presence/ShowPresenceProvider';
import { ShowPresenceStack } from '@/features/show-presence/ShowPresenceStack';
import { LiveUpdateIndicator } from '@/features/show-live-sync/LiveUpdateIndicator';

const ShowMapTab = React.lazy(() => import('@/features/show-map/ShowMapTab'));

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

function isActiveEntryForMineFilter(entry: Record<string, unknown>): boolean {
  const entryStatus = typeof entry.entry_status === 'string' ? entry.entry_status : '';
  const checkInStatus = typeof entry.check_in_status === 'string' ? entry.check_in_status : '';
  const deletedAt = entry.deleted_at;

  return (
    !deletedAt &&
    entryStatus !== 'scratched' &&
    entryStatus !== 'withdrawn' &&
    checkInStatus !== 'pulled'
  );
}

const ShowDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { endNavigation } = useNavigationPerformance();
  const { user, userWithRoles, isSecretary, isAdmin, hasRole } = useAuthContext();
  const trials = useTrialStore(s => s.trials);
  const trialClasses = useTrialStore(s => s.trialClasses);
  const loadTrials = useTrialStore(s => s.loadTrials);
  const loadTrialClasses = useTrialStore(s => s.loadTrialClasses);
  const { data: showEntries = [], isLoading: showEntriesLoading } = useEntriesByShowQuery(
    id || '',
    !!id
  );
  const catalogEntryCount = countCatalogEntries(showEntries);
  const { dogs } = useDogStoreCompat();

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

  const { data: shows = [] } = useShowsQuery();


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

  useEffect(() => {
    if (!id) return;
    void loadTrials();
    void loadTrialClasses();
  }, [id, loadTrials, loadTrialClasses]);

  // Get associated trials for secretary view
  const showId_ = actualCurrentShow?.id;
  const { data: showJudgeRoster = [] } = useShowJudges(showId_);
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
  const { entries: userEntries, isLoading: userEntriesLoading } = useMyEntries(showId_);
  const userDogIds = useMemo(() => {
    const databaseUserId = userWithRoles?.databaseUserId;
    if (!databaseUserId) return new Set<string>();
    return new Set(dogs.filter(dog => dog.ownerId === databaseUserId).map(dog => dog.id));
  }, [dogs, userWithRoles?.databaseUserId]);

  const userEntryClassIds = useMemo(() => {
    const classIds = new Set<string>();
    for (const entry of showEntries) {
      if (!isActiveEntryForMineFilter(entry)) continue;
      const dogId = typeof entry.dog_id === 'string' ? entry.dog_id : undefined;
      const classId = typeof entry.class_id === 'string' ? entry.class_id : undefined;
      if (dogId && classId && userDogIds.has(dogId)) {
        classIds.add(classId);
      }
    }
    return classIds;
  }, [showEntries, userDogIds]);
  const hasUserEntries = userEntryClassIds.size > 0 || userEntries.length > 0;
  const isAuthenticated = !!user;
  const requestedTab = searchParams.get('tab');
  const isWaitingForExhibitorEntryDefault =
    isAuthenticated &&
    !canManageShow &&
    !requestedTab &&
    (showEntriesLoading || userEntriesLoading);

  // Tab state — URL-synced with dynamic allowed tabs
  const canShowMap = features.showMap && canManageShow;
  const allowedTabs = useMemo(() => {
    if (!isAuthenticated) return ['overview', 'trials', 'classes', 'results'];
    if (canManageShow) {
      return [
        'overview',
        ...(canShowMap ? ['map'] : []),
        'trials',
        'classes',
        'my-entries',
        'my-stats',
        'results',
      ];
    }
    return ['overview', 'trials', 'my-entries', 'classes', 'results'];
  }, [isAuthenticated, canManageShow, canShowMap]);
  const defaultTab =
    isAuthenticated && !canManageShow && !isWaitingForExhibitorEntryDefault && hasUserEntries
      ? 'my-entries'
      : 'overview';
  const [activeTab, setTab] = useUrlTab(allowedTabs, defaultTab);

  // Flatten trial classes for judge roster resolution and entry overlap detection
  const showClasses = useMemo(() => {
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
        entryCount: showEntries.filter((e: Record<string, unknown>) => e.class_id === cls.id)
          .length,
        scoredCount: cls.completedEntries ?? 0,
        userHasEntry: userEntryClassIds.has(cls.id),
        trialDate: trial.trialDate || '',
        trialNumber: trial.trialNumber || '',
        trialName: trial.name || '',
      }));
    });
  }, [associatedTrials, trialClasses, userEntryClassIds, showEntries]);

  const effectiveJudges = useMemo((): ShowJudgeAssignment[] => {
    return resolveOverviewJudgesWithRoster(
      actualCurrentShow?.assignedJudges,
      showJudgeRoster,
      showClasses
    );
  }, [actualCurrentShow, showJudgeRoster, showClasses]);

  // Trial statistics for card display (class counts, entry counts, scoring progress)
  const trialStats = useMemo(() => {
    const stats: Record<string, TrialStats> = {};
    for (const trial of associatedTrials) {
      const classes = trialClasses[trial.id] || [];
      const classIdSet = new Set(classes.map(c => c.id));
      const trialEntryCount = showEntries.filter((e: Record<string, unknown>) =>
        classIdSet.has(e.class_id as string)
      ).length;
      stats[trial.id] = {
        classCount: classes.length,
        entryCount: trialEntryCount,
        completedClasses: classes.filter(cls => cls.status === CLASS_STATUS.COMPLETED).length,
      };
    }
    return stats;
  }, [associatedTrials, trialClasses, showEntries]);

  // Redirect if no show ID
  useEffect(() => {
    if (!id) {
      navigate('/shows', { replace: true });
    }
  }, [id, navigate]);

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
      ...(canShowMap ? [{ id: 'map', label: 'Show Map', icon: ListTree }] : []),
      { id: 'trials', label: 'Trials', icon: Trophy, count: associatedTrials.length },
      ...(!canManageShow && isAuthenticated
        ? [
            {
              id: 'my-entries',
              label: 'My Entries',
              icon: ClipboardList,
              count: userEntries.length,
            },
          ]
        : []),
      { id: 'classes', label: 'Classes', icon: ListChecks, count: showClasses.length },
      ...(canManageShow && isAuthenticated
        ? [
            {
              id: 'my-entries',
              label: 'Entries',
              icon: ClipboardList,
              count: catalogEntryCount,
            },
            { id: 'my-stats', label: 'My Stats', icon: BarChart3 },
          ]
        : []),
      { id: 'results', label: 'Results', icon: Medal, count: 0 },
    ],
    [
      isAuthenticated,
      canShowMap,
      canManageShow,
      associatedTrials.length,
      showClasses.length,
      catalogEntryCount,
      userEntries.length,
    ]
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

  // Managers get the full workbench — replace so "back" returns to the shows list.
  if (canManageShow && showId) {
    return <Navigate to={`/secretary/shows/${showId}`} replace />;
  }

  const publicLandingShow =
    actualCurrentShow.experienceIsPublished && actualCurrentShow.experiencePublishedStyle
      ? { ...actualCurrentShow, style: actualCurrentShow.experiencePublishedStyle }
      : actualCurrentShow;

  // Styled public landing — renders for non-staff visitors who are NOT yet entered.
  // Staff (secretary / admin / club_admin) always reach the management UI.
  // Authenticated exhibitors with entries bypass the marketing landing and see
  // the tabbed details UI (classes, my entries, run order) instead.
  //
  // We gate on an *explicit* style being set, not the `getShowStyle()` fallback
  // value ('monogram'). Otherwise legacy shows with `style = null` would
  // unexpectedly render the Monogram landing — those shows historically
  // rendered the management UI and we preserve that behavior. Checks both
  // post-migration `style` and pre-migration `landing_style` columns.
  const rawShowStyle =
    publicLandingShow.style ??
    (publicLandingShow as { landing_style?: string | null }).landing_style;
  const hasExplicitStyle = !!rawShowStyle && rawShowStyle !== 'default';
  const publicShowStyle = getShowStyle(publicLandingShow);
  // The registry is exhaustive over every ShowStyle value (typecheck
  // enforces it), so any explicit style is guaranteed to resolve to a
  // component. The `hasExplicitStyle` gate skips the styled path
  // entirely when no style is set.
  if (hasExplicitStyle && !isSecretary && !isAdmin && !hasRole('club_admin')) {
    // For authenticated users, wait for entries to resolve before deciding
    // which experience to render — avoids flashing the landing page briefly.
    if (user && userEntriesLoading) {
      return (
        <PageShell>
          <LoadingSkeleton variant="cards" />
        </PageShell>
      );
    }
    if (!hasUserEntries) {
      const StyledLanding = STYLED_LANDING_BY_STYLE[publicShowStyle];
      return (
        <StyledLanding
          show={publicLandingShow}
          trial={associatedTrials[0] ?? null}
          allTrials={associatedTrials}
        />
      );
    }
  }

  const entryStatus = getEntryStatus(actualCurrentShow, hasUserEntries);

  return (
    <ShowPresenceProvider showId={id}>
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
          cover={
            actualCurrentShow.startDate ? (
              <ShowDateBlock
                startDate={actualCurrentShow.startDate}
                endDate={actualCurrentShow.endDate}
              />
            ) : undefined
          }
          name={actualCurrentShow.name || 'Untitled Show'}
          subtitle={actualCurrentShow.clubName || undefined}
          badges={[
            ...(actualCurrentShow.organization
              ? [{ label: actualCurrentShow.organization, variant: 'default' as const }]
              : []),
            ...(!canManageShow
              ? [
                  {
                    label: entryStatus.label,
                    variant: ENTRY_STATUS_HERO_VARIANT[entryStatus.status],
                  },
                ]
              : []),
          ]}
          metadata={[]}
          closedMessage={
            !canManageShow && !entryStatus.canEnter ? entryStatus.description : undefined
          }
          secondaryActions={
            <div className="flex flex-wrap items-center justify-end gap-3">
              <LiveUpdateIndicator />
              <ShowPresenceStack />
              {entryStatus.canEnter ? (
                <button
                  className="min-h-[44px] sm:h-9 px-5 text-sm font-medium rounded-md inline-flex items-center gap-2 transition-colors bg-[#c96442] hover:bg-[#b45a3a] text-[#faf9f5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3898ec] focus-visible:ring-offset-2"
                  onClick={handleRegisterForShow}
                >
                  {hasUserEntries ? 'Manage Entry' : 'Enter This Show'}
                </button>
              ) : hasUserEntries ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] sm:min-h-8"
                  onClick={handleRegisterForShow}
                >
                  View Entry
                </Button>
              ) : null}
            </div>
          }
          footer={
            <QuickInfoCards
              show={actualCurrentShow}
              canManageShow={canManageShow}
              entryCount={catalogEntryCount}
            />
          }
        />

        {isWaitingForExhibitorEntryDefault ? (
          <div className="mt-6">
            <LoadingSkeleton variant="cards" count={2} />
          </div>
        ) : (
          <PrimaryTabs tabs={tabDefs} value={activeTab} onValueChange={setTab}>
            <TabsContent value="overview">
              <ShowOverviewTab
                show={actualCurrentShow}
                canManageShow={canManageShow}
                judges={effectiveJudges}
              />
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
                {canManageShow ? (
                  <EntriesTab showId={actualCurrentShow.id} />
                ) : (
                  <MyEntriesTab showId={actualCurrentShow.id} />
                )}
              </TabsContent>
            )}

            {isAuthenticated && canManageShow && (
              <TabsContent value="my-stats">
                <MyShowStatsTab showId={actualCurrentShow.id} />
              </TabsContent>
            )}

            <TabsContent value="results">
              <ShowResultsTab showId={actualCurrentShow.id} />
            </TabsContent>

            {canShowMap && (
              <TabsContent value="map">
                <Suspense fallback={<LoadingSkeleton variant="cards" count={2} />}>
                  <ShowMapTab
                    show={actualCurrentShow}
                    trials={associatedTrials}
                    classes={showClasses}
                    entries={showEntries}
                    canManageShow={false}
                  />
                </Suspense>
              </TabsContent>
            )}
          </PrimaryTabs>
        )}
      </PageShell>
    </ShowPresenceProvider>
  );
};

export default ShowDetailsPage;
