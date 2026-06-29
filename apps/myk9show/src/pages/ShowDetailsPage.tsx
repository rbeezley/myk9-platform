import React, { useState, useEffect, useMemo } from 'react';
import { getShowStyle } from '@/features/registries';
import { publishExperience } from '@/features/experience/publishExperience';
import { Link, Outlet, useParams, useNavigate, useSearchParams, useMatch } from 'react-router-dom';
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
  ListTree,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useUrlTab } from '@/hooks/useUrlTab';
import { ShowEditPanel } from '@/components/panels/edit/ShowEditPanel';
import DeleteShowDialog from '@/components/shows/ShowDetails/dialogs/DeleteShowDialog';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { resolveOverviewJudgesWithRoster } from '@/components/shows/overview/overviewJudges';
import { type TrialStats } from '@/components/shows/tabs/TrialsTab';
import type { ShowInput } from '@/store/showStore';
import type { Show } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { GeneratedPremium } from '@/types/premium-types';
import { useShowsQuery, showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { useShowStore } from '@/store/showStore';
import { persistShowJudgeAssignments } from '@/services/database/judges';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useShowLandingData } from '@/hooks/useShowLandingData';
import { useNavigationPerformance } from '@/hooks/useNavigationPerformance';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import { CLASS_STATUS } from '@myk9/core';
import { useMyEntries } from '@/hooks/useMyEntries';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { ShowPublicLanding } from '@/components/shows/ShowDetails/ShowPublicLanding';
import { ShowDetailTabs } from '@/components/shows/ShowDetails/ShowDetailTabs';
import { resolveShowAudience } from './ShowDetailsPage.audience';
import { getEntryStatus, type EntryStatus } from '@/utils/entryStatusUtils';
import { ArmbandLookup } from '@/components/shows/ArmbandLookup';
import { useArmbandCount } from '@/hooks/queries/useArmbandLookup';
import { PremiumDownloadCard } from '@/features/premium/PremiumDownloadCard';
import { LandingPageCard } from '@/features/premium/LandingPageCard';
import { notifications } from '@/lib/notifications';
import { features } from '@/config/features';
import { cn } from '@/lib/utils';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { NotFoundState } from '@/components/common/NotFoundState';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { ShowDateBlock } from '@/components/shows/ShowDateBlock';
import { ShowStatusPill } from '@/components/shows/ShowStatusPill';
import { countCatalogEntries } from '@/features/show-map/entryCounts';
import { ShowPresenceProvider } from '@/features/show-presence/ShowPresenceProvider';
import { ShowPresenceStack } from '@/features/show-presence/ShowPresenceStack';
import { LiveUpdateIndicator } from '@/features/show-live-sync/LiveUpdateIndicator';
import { SHOW_MANAGEMENT_SECTIONS } from '@/routes/showManagementSections';
import { SETUP_PUBLISH_ANCHOR } from '@/features/show-workbench/setupReadinessSignals';
import { selectOwnedDogIds } from '@/utils/dogOwnership';

const ENTRY_STATUS_HERO_VARIANT: Record<
  EntryStatus,
  'success' | 'warning' | 'destructive' | 'default'
> = {
  accepting: 'success',
  closing_soon: 'warning',
  closed: 'destructive',
  submitted: 'default',
  not_yet_open: 'default',
  setup_incomplete: 'default',
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

function parseOptionalCurrency(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function applyShowFormDataToPremium(
  premium: GeneratedPremium,
  formData: Partial<ShowInput>
): GeneratedPremium {
  const preEntryFee = parseOptionalCurrency(formData.preEntryFee);
  const dayOfFee = parseOptionalCurrency(formData.dayOfShowFee);

  return {
    ...premium,
    style: (formData.style ?? premium.style) as GeneratedPremium['style'],
    show: {
      ...premium.show,
      name: formData.name ?? premium.show.name,
      startDate: formData.startDate ?? premium.show.startDate,
      endDate: formData.endDate ?? premium.show.endDate,
      venue: formData.location ?? premium.show.venue,
      entryOpenDate: formData.entryOpenDate ?? premium.show.entryOpenDate,
      entryCloseDate: formData.entryCloseDate ?? premium.show.entryCloseDate,
      preEntryFee: preEntryFee ?? premium.show.preEntryFee,
      dayOfFee: dayOfFee ?? premium.show.dayOfFee,
      acceptChecks: formData.acceptCheckPayments ?? premium.show.acceptChecks,
      acceptCash: formData.acceptCashPayments ?? premium.show.acceptCash,
    },
    trials: premium.trials.map(trial => ({
      ...trial,
      judges:
        formData.assignedJudges?.map(judge => ({
          name: judge.judgeName,
          elements: judge.assignedClasses ?? [],
        })) ?? trial.judges,
    })),
  };
}

const ShowDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const managementSectionMatch = useMatch('/shows/:id/:section');
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

  const queryClient = useQueryClient();
  const { data: shows = [] } = useShowsQuery();

  const updateShowLocally = useShowStore(s => s.updateShow);

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
  const canonicalShowHref = actualCurrentShow?.id ? `/shows/${actualCurrentShow.id}` : '';
  const activeManagementSection = managementSectionMatch?.params.section;
  const isManagementSection = Boolean(
    activeManagementSection &&
    SHOW_MANAGEMENT_SECTIONS.some(item => item.path === activeManagementSection)
  );

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

  // Anon / cold-store fallback data layer for the public read path: trials,
  // classes, and per-trial stats fetched via anon-safe PostgREST when the
  // replicated store is cold (guest session). See useShowLandingData.
  const { landingTrials, publicShowClasses, publicTrialStats } = useShowLandingData(
    showId_,
    associatedTrials,
    showEntries
  );
  // For tabs/counts/derivations, treat landingTrials as the effective trial
  // list: it IS associatedTrials when the store is warm, and the anon-safe
  // public rows when the store is cold. (Lane 3.7)
  const effectiveTrials = landingTrials;

  // Check if user has entries in this show (determines default tab)
  // Only enable polling when the My Entries tab is active (fix #3)
  const { entries: userEntries, isLoading: userEntriesLoading } = useMyEntries(showId_);
  const userDogIds = useMemo(() => {
    const databaseUserId = userWithRoles?.databaseUserId;
    return selectOwnedDogIds(dogs, databaseUserId);
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

  // Count entries per class once (O(entries)) instead of re-filtering the full
  // showEntries array per class below (was O(classes × entries) per recompute).
  const entryCountByClassId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of showEntries) {
      const classId = typeof entry.class_id === 'string' ? entry.class_id : undefined;
      if (!classId) continue;
      counts.set(classId, (counts.get(classId) ?? 0) + 1);
    }
    return counts;
  }, [showEntries]);

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
        entryCount: entryCountByClassId.get(cls.id) ?? 0,
        scoredCount: cls.completedEntries ?? 0,
        userHasEntry: userEntryClassIds.has(cls.id),
        trialDate: trial.trialDate || '',
        trialNumber: trial.trialNumber || '',
        trialName: trial.name || '',
      }));
    });
  }, [associatedTrials, trialClasses, userEntryClassIds, entryCountByClassId]);

  // When the store has trials we keep the store-derived `showClasses` verbatim
  // (warm session, no behavior change); only a cold guest swaps in the public
  // PostgREST reshape from useShowLandingData.
  const effectiveShowClasses = showClasses.length > 0 ? showClasses : publicShowClasses;

  const effectiveJudges = useMemo((): ShowJudgeAssignment[] => {
    return resolveOverviewJudgesWithRoster(
      actualCurrentShow?.assignedJudges,
      showJudgeRoster,
      effectiveShowClasses
    );
  }, [actualCurrentShow, showJudgeRoster, effectiveShowClasses]);

  // Trial statistics for card display (class counts, entry counts, scoring progress)
  const trialStats = useMemo(() => {
    const stats: Record<string, TrialStats> = {};
    for (const trial of associatedTrials) {
      const classes = trialClasses[trial.id] || [];
      const trialEntryCount = classes.reduce(
        (sum, c) => sum + (entryCountByClassId.get(c.id) ?? 0),
        0
      );
      stats[trial.id] = {
        classCount: classes.length,
        entryCount: trialEntryCount,
        completedClasses: classes.filter(cls => cls.status === CLASS_STATUS.COMPLETED).length,
      };
    }
    return stats;
  }, [associatedTrials, trialClasses, entryCountByClassId]);

  // Same cold-store fallback for the Trials tab's per-trial stat cards
  // (publicTrialStats from useShowLandingData).
  const effectiveTrialStats = associatedTrials.length > 0 ? trialStats : publicTrialStats;

  const hasEntryClassInventory =
    effectiveTrials.length > 0 ? effectiveShowClasses.length > 0 : null;

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
      ...(canShowMap ? [{ id: 'map', label: 'Show Map', icon: ListTree }] : []),
      { id: 'trials', label: 'Trials', icon: Trophy, count: effectiveTrials.length },
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
      { id: 'classes', label: 'Classes', icon: ListChecks, count: effectiveShowClasses.length },
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
      effectiveTrials.length,
      effectiveShowClasses.length,
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

  // Decide which surface this visitor sees. Staff (secretary / admin / club_admin)
  // and management-section URLs reach the tabbed/management UI; non-staff visitors
  // with no entries get the styled marketing landing; an authenticated visitor whose
  // entries are still loading is held ('pending') to avoid flashing the landing.
  const audience = resolveShowAudience({
    isManagementSection,
    isSecretary,
    isAdmin,
    isClubAdmin: hasRole('club_admin'),
    isAuthenticated,
    userEntriesLoading,
    hasUserEntries,
  });

  if (audience === 'pending') {
    return (
      <PageShell>
        <LoadingSkeleton variant="cards" />
      </PageShell>
    );
  }

  if (audience === 'public') {
    return (
      <ShowPublicLanding
        show={actualCurrentShow}
        landingTrials={landingTrials}
        hasEntryClassInventory={hasEntryClassInventory}
      />
    );
  }

  const entryStatus = getEntryStatus(actualCurrentShow, hasUserEntries, {
    hasEntryClassInventory,
  });

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
          headerActions={
            canManageShow ? (
              <>
                <LiveUpdateIndicator />
                <ShowPresenceStack />
                <ShowStatusPill showId={actualCurrentShow.id} status={actualCurrentShow.status} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="More show actions"
                      className="h-10 w-10 sm:h-9 sm:w-9"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowEditPanel(true)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : undefined
          }
          secondaryActions={
            !canManageShow ? (
              <div className="flex flex-wrap items-center justify-end gap-3">
                {/* INTENT: let an exhibitor confirm their dog fits the offered
                    classes/levels BEFORE committing to registration. Deep-links
                    the existing Classes tab — no new eligibility surface
                    (UX-P2-04). */}
                {effectiveShowClasses.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] sm:min-h-8"
                    onClick={() => setTab('classes')}
                  >
                    See classes
                  </Button>
                )}
                {entryStatus.canEnter ? (
                  // Primary entry CTA: the shared Button (default = filled
                  // var(--primary)) so it honors the user's accent and the
                  // semantic focus ring, instead of a hardcoded Clay hex that
                  // broke under Grove/Dusk/Heather. Filled vs the outline
                  // siblings keeps it the dominant action.
                  <Button
                    size="sm"
                    className="min-h-[44px] sm:min-h-8"
                    onClick={handleRegisterForShow}
                  >
                    {hasUserEntries ? 'Manage Entry' : 'Enter This Show'}
                  </Button>
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
            ) : undefined
          }
          footer={
            <QuickInfoCards
              show={actualCurrentShow}
              canManageShow={canManageShow}
              entryCount={catalogEntryCount}
            />
          }
        />

        {/* INTENT: The publish row renders once, above the section tabs —
            it is show-level state the secretary needs on every tab. The
            Setup tab's readiness chip deep-links here via #setup-publish;
            the target: ring makes the jump visibly land somewhere. */}
        {canManageShow && (
          <div
            id={SETUP_PUBLISH_ANCHOR}
            className="mt-4 grid scroll-mt-20 grid-cols-1 gap-3 rounded-md sm:grid-cols-2 target:ring-2 target:ring-ring target:ring-offset-4 target:ring-offset-background"
          >
            <PremiumDownloadCard showId={actualCurrentShow.id} showStaleBadge={canManageShow} />
            <LandingPageCard
              showId={actualCurrentShow.id}
              showStyle={getShowStyle(actualCurrentShow)}
            />
          </div>
        )}

        {canManageShow && actualCurrentShow?.id && (
          <nav
            className="border-b border-border bg-background"
            aria-label="Show management sections"
            data-testid="canonical-show-management-nav"
          >
            <div className="flex max-w-full overflow-x-auto no-scrollbar px-4 sm:px-6">
              {SHOW_MANAGEMENT_SECTIONS.map(({ label, path }) => {
                const href = `${canonicalShowHref}/${path}`;
                const isActive = activeManagementSection === path;
                return (
                  <Link
                    key={path}
                    to={href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'min-h-11 shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        {isManagementSection ? (
          <Outlet />
        ) : isWaitingForExhibitorEntryDefault ? (
          <div className="mt-6">
            <LoadingSkeleton variant="cards" count={2} />
          </div>
        ) : (
          <ShowDetailTabs
            show={actualCurrentShow}
            tabs={tabDefs}
            activeTab={activeTab}
            onTabChange={setTab}
            canManageShow={canManageShow}
            canShowMap={canShowMap}
            isAuthenticated={isAuthenticated}
            hasUserEntries={hasUserEntries}
            judges={effectiveJudges}
            classes={effectiveShowClasses}
            trials={effectiveTrials}
            trialStats={effectiveTrialStats}
            mapTrials={associatedTrials}
            mapClasses={showClasses}
            mapEntries={showEntries}
          />
        )}
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
            const publishableShowData = showData as Partial<ShowInput> & {
              publishExperience?: boolean;
              generatedPremium?: GeneratedPremium;
              inkSaver?: boolean;
            };
            const localShow = await updateShowLocally(showId, showData as Partial<ShowInput>);
            if (!localShow) {
              throw new Error('Show was not available in the local store.');
            }
            // Persist judge assignments to judge_assignments table
            await persistShowJudgeAssignments(showId, showData.assignedJudges || []);
            queryClient.setQueryData<Show>(showQueryKeys.detail(showId), localShow);
            queryClient.setQueryData<Show[]>(showQueryKeys.lists(), current =>
              current?.map(show => (show.id === showId ? localShow : show))
            );

            if (publishableShowData.publishExperience && publishableShowData.generatedPremium) {
              await publishExperience({
                showId,
                premium: applyShowFormDataToPremium(
                  publishableShowData.generatedPremium,
                  showData as Partial<ShowInput>
                ),
                inkSaver: Boolean(publishableShowData.inkSaver),
              });
              queryClient.invalidateQueries({ queryKey: ['shows', showId, 'publish-info'] });
              queryClient.invalidateQueries({
                queryKey: ['shows', showId, 'published-experience-content'],
              });
              queryClient.invalidateQueries({ queryKey: showQueryKeys.detail(showId) });
              queryClient.invalidateQueries({ queryKey: showQueryKeys.lists() });
            }
          }
          notifications.success('Show changes saved');
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
    </ShowPresenceProvider>
  );
};

export default ShowDetailsPage;
