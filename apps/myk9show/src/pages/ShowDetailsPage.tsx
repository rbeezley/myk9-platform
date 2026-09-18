import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, useMatch, useLocation } from 'react-router-dom';
import { readEntryDogId, withEntryDogContext } from '@/features/registration/entryDogContext';
import { type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useUrlTab } from '@/hooks/useUrlTab';
import { resolveOverviewJudgesWithRoster } from '@/components/shows/overview/overviewJudges';
import { type TrialStats } from '@/components/shows/tabs/TrialsTab';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useShowLandingData } from '@/hooks/useShowLandingData';
import { useNavigationPerformance } from '@/hooks/useNavigationPerformance';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowManageGate } from './ShowDetailsPage.viewer';
import { hasScopedClubRole } from '@/utils/roleScopes';
import { UserRole } from '@/types/auth-types';
import { useTrialStore } from '@/store/trialStore';
import { resolveEntryClassInventory } from './ShowDetailsPage.entryInventory';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import { CLASS_STATUS, normalizeClassStatus } from '@myk9/core';
import {
  useEntriesByShowQuery,
  useSecretaryShowEntriesQuery,
} from '@/hooks/queries/useEntriesDatabase';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { ShowPublicLanding } from '@/components/shows/ShowDetails/ShowPublicLanding';
import { ShowManagementShell } from '@/components/shows/ShowDetails/ShowManagementShell';
import { ShowExhibitorView } from '@/components/shows/ShowDetails/ShowExhibitorView';
import { type ShowDetailTabsProps } from '@/components/shows/ShowDetails/ShowDetailTabs';
import { resolveShowAudience } from './ShowDetailsPage.audience';
import {
  buildShowDetailTabDefs,
  buildShowManagementTabDefs,
  resolveResultsTabCount,
} from './ShowDetailsPage.tabDefs';
import { useShowResults } from '@/hooks/queries/useShowResults';
import { getEntryStatus } from '@/utils/entryStatusUtils';
import { useArmbandCount } from '@/hooks/queries/useArmbandLookup';
import { features } from '@/config/features';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { NotFoundState } from '@/components/common/NotFoundState';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { countCatalogEntries } from '@/features/show-map/entryCounts';
import type { ShowMapEntryInput } from '@/features/show-map/showMapTypes';
import { ShowPresenceProvider } from '@/features/show-presence/ShowPresenceProvider';
import {
  SHOW_MANAGEMENT_SECTIONS,
  LEGACY_SHOW_SECTION_REDIRECTS,
  LEGACY_SHOW_TAB_PARAM_REDIRECTS,
} from '@/routes/showManagementSections';
import { useSubmittedEntryProjection } from '@/features/exhibitor-entry/useSubmittedEntryProjection';
import { markCurrentUserEntryClasses } from './ShowDetailsPage.publicClasses';
import { isValidUUID } from '@/utils/validation';

/** Loads `/shows/:id` once and delegates to the public, exhibitor, or management surface. */
const ShowDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hash } = useLocation();
  const managementSectionMatch = useMatch('/shows/:id/:section/*');
  const { endNavigation } = useNavigationPerformance();
  const {
    user,
    loading: authLoading,
    userWithRoles,
    isSecretary,
    isAdmin,
    rbacLoading,
  } = useAuthContext();
  const canReadEntryRows = Boolean(user && user.is_anonymous !== true);
  const trials = useTrialStore(s => s.trials);
  const trialClasses = useTrialStore(s => s.trialClasses);
  const trialClassesReadStatus = useTrialStore(s => s.trialClassesReadStatus);
  const loadTrials = useTrialStore(s => s.loadTrials);
  const loadTrialClasses = useTrialStore(s => s.loadTrialClasses);
  const {
    data: showEntries = [],
    isLoading: showEntriesLoading,
    isError: showEntriesIsError,
  } = useEntriesByShowQuery(id || '', Boolean(id && isValidUUID(id) && canReadEntryRows));
  const { dogs } = useDogStoreCompat();

  // Use fast show details loading with cache optimization
  const {
    showId,
    show: currentShow,
    isLoading: fastLoading,
    isError: fastError,
    refetch: refetchShow,
    isFromCache,
    refreshFailed,
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
  const canManageShow = useShowManageGate(actualCurrentShow?.clubId);
  const {
    data: secretaryEntries,
    isSuccess: secretaryEntriesLoaded,
    isError: secretaryEntriesIsError,
    refetch: refetchSecretaryEntries,
  } = useSecretaryShowEntriesQuery(id ?? '', Boolean(id && canManageShow));
  const entryDataState: 'ready' | 'loading' | 'error' = !canManageShow
    ? 'ready'
    : secretaryEntriesLoaded
      ? 'ready'
      : secretaryEntriesIsError
        ? 'error'
        : 'loading';
  const managerEntryDataUnavailable = canManageShow && entryDataState !== 'ready';
  const classEntryCountsUnavailable = canManageShow
    ? managerEntryDataUnavailable
    : showEntriesIsError;
  const effectiveShowEntries = useMemo(
    () => (canManageShow ? (secretaryEntries ?? []) : showEntries),
    [canManageShow, secretaryEntries, showEntries]
  );
  const effectiveShowMapEntries = effectiveShowEntries as unknown as ShowMapEntryInput[];
  const catalogEntryCount = countCatalogEntries(effectiveShowEntries);
  const canonicalShowHref = actualCurrentShow?.id ? `/shows/${actualCurrentShow.id}` : '';
  const activeManagementSection = managementSectionMatch?.params.section;
  const isManagementSection = Boolean(
    activeManagementSection &&
    (SHOW_MANAGEMENT_SECTIONS.some(item => item.path === activeManagementSection) ||
      activeManagementSection in LEGACY_SHOW_SECTION_REDIRECTS ||
      activeManagementSection === 'classes')
  );
  const isScopedSecretary =
    isSecretary && hasScopedClubRole(userWithRoles, UserRole.SECRETARY, actualCurrentShow?.clubId);

  useEffect(() => {
    if (!id || !isValidUUID(id)) return;
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
  const { landingTrials, publicShowClasses, publicTrialStats, publicClassInventoryResolved } =
    useShowLandingData(
      showId_,
      associatedTrials,
      canReadEntryRows && !showEntriesIsError ? showEntries : null,
      !canReadEntryRows && !authLoading
    );
  // For tabs/counts/derivations, treat landingTrials as the effective trial
  // list: it IS associatedTrials when the store is warm, and the anon-safe
  // public rows when the store is cold. (Lane 3.7)
  const effectiveTrials = landingTrials;

  const {
    projection: submittedEntryProjection,
    ownedEntryRows: exhibitorEntryRows,
    state: exhibitorEntryDataState,
  } = useSubmittedEntryProjection({
    entries: showEntries,
    dogs,
    databaseUserId: userWithRoles?.databaseUserId,
    isLoading: showEntriesLoading,
    isError: showEntriesIsError,
  });
  const userEntryClassIds = submittedEntryProjection.activeClassIds;
  const hasUserEntries = submittedEntryProjection.hasActiveEntries;
  const hasOwnedEntryHistory = submittedEntryProjection.historyCount > 0;
  const isAuthenticated = !!user;
  const requestedTab = searchParams.get('tab');
  const entryDogId = readEntryDogId(searchParams);
  const isWaitingForExhibitorEntryDefault =
    isAuthenticated && !canManageShow && !requestedTab && exhibitorEntryDataState === 'loading';

  // ONE notion of "we do not yet know who this viewer is": RBAC is still
  // loading AND no roles have arrived. `!rbacLoading` alone is NOT it --
  // `useRbacLifecycle` flips `isLoading` back to true on its 5-minute refresh
  // and on every `online` event while PRESERVING `userWithRoles`, so a narrower
  // predicate would drop an exhibitor's My Entries tab (and flip the body back
  // to Overview) mid-session, every five minutes. Same predicate the audience
  // gate uses, and the same shape as `areRolesResolved` in App.tsx.
  const viewerRolesUnresolved = rbacLoading && !userWithRoles;

  // Decide which surface this visitor sees. Staff (secretary / admin / club_admin)
  // and management-section URLs reach the tabbed/management UI; non-staff visitors
  // with no entries get the styled marketing landing; an authenticated visitor whose
  // entries are still loading is held ('pending') to avoid flashing the landing.
  const audience = resolveShowAudience({
    isManagementSection,
    forcePublicPreview: searchParams.get('preview') === 'public',
    canManageShow,
    isManagementStaff: isAdmin || isScopedSecretary,
    rbacLoading: viewerRolesUnresolved,
    isAuthenticated,
    userEntriesLoading: exhibitorEntryDataState === 'loading',
    hasUserEntries: hasOwnedEntryHistory,
  });

  // The Results badge counts what the Results tab renders: result groups from
  // view_public_entry_results, which withholds unreleased placements (MYK9-419).
  // Only the two tabbed surfaces have a Results tab — a 'public' landing or a
  // still-'pending' visitor (who may yet land on it) pays nothing; the Results
  // tab itself reuses the same query key.
  const hasResultsTab = audience === 'exhibitor' || audience === 'management';
  const showResultsQuery = useShowResults(hasResultsTab && id && isValidUUID(id) ? id : undefined);
  const resultsCount = resolveResultsTabCount(showResultsQuery);

  // Tab state — URL-synced with dynamic allowed tabs
  const canShowMap = features.showMap && canManageShow;
  // MYK9-630 phase 2 removed the hazard MYK9-634 was filed against: the
  // exhibitor "My Entries" tab and the manager "Entries" tab shared the id
  // `my-entries`, and `useShowManageGate` cannot tell "not a manager" from "not
  // resolved yet", so one id could resolve to two different bodies across a
  // single load. A manager has no `?tab=` strip at all now and
  // `?tab=my-entries` redirects to `/shows/:id/entries`, so the id is no longer
  // shared by anyone.
  //
  // NOT a claim that this was the observed production crash: on `origin/main`
  // the `pending` audience already held the page while roles were cold, and no
  // test reproduces that failure. See the PR body and MYK9-634.
  //
  // There is deliberately NO second "roles resolved" filter on this list. Round
  // 1 added one and round 2 found it unreachable: `viewerRolesUnresolved` is
  // exactly what makes the audience `'pending'`, and the page early-returns a
  // skeleton on `'pending'` before a tab is ever built. One gate, one place.
  const allowedTabs = useMemo(() => {
    if (!isAuthenticated) return ['overview', 'trials', 'classes', 'results'];
    return [
      'overview',
      ...(canShowMap ? ['map'] : []),
      'trials',
      'my-entries',
      'classes',
      'results',
    ];
  }, [isAuthenticated, canShowMap]);
  const defaultTab =
    isAuthenticated && !canManageShow && !isWaitingForExhibitorEntryDefault && hasUserEntries
      ? 'my-entries'
      : 'overview';
  const [activeTab, setTab] = useUrlTab(allowedTabs, defaultTab);

  // Count entries per class once (O(entries)) instead of re-filtering the full
  // effectiveShowEntries array per class below (was O(classes × entries) per recompute).
  const entryCountByClassId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of effectiveShowEntries) {
      const classId = typeof entry.class_id === 'string' ? entry.class_id : undefined;
      if (!classId) continue;
      counts.set(classId, (counts.get(classId) ?? 0) + 1);
    }
    return counts;
  }, [effectiveShowEntries]);

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
        entryCount: classEntryCountsUnavailable ? null : (entryCountByClassId.get(cls.id) ?? 0),
        scoredCount: cls.completedEntries ?? 0,
        reopenedAfterCloseoutAt: cls.reopenedAfterCloseoutAt ?? null,
        userHasEntry: userEntryClassIds.has(cls.id),
        trialDate: trial.trialDate || '',
        trialNumber: trial.trialNumber || '',
        trialName: trial.name || '',
      }));
    });
  }, [
    associatedTrials,
    trialClasses,
    userEntryClassIds,
    entryCountByClassId,
    classEntryCountsUnavailable,
  ]);

  // When the store has trials we keep the store-derived `showClasses` verbatim
  // (warm session, no behavior change); only a cold guest swaps in the public
  // PostgREST reshape from useShowLandingData.
  const effectiveShowClasses = useMemo(
    () =>
      showClasses.length > 0
        ? showClasses
        : markCurrentUserEntryClasses(publicShowClasses, userEntryClassIds),
    [showClasses, publicShowClasses, userEntryClassIds]
  );

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
      const trialEntryCount = classEntryCountsUnavailable
        ? null
        : classes.reduce((sum, c) => sum + (entryCountByClassId.get(c.id) ?? 0), 0);
      stats[trial.id] = {
        classCount: classes.length,
        entryCount: trialEntryCount,
        completedClasses: classes.filter(
          cls => normalizeClassStatus(cls.status) === CLASS_STATUS.COMPLETED
        ).length,
        hasStarted: classes.some(
          cls => normalizeClassStatus(cls.status) === CLASS_STATUS.IN_PROGRESS
        ),
      };
    }
    return stats;
  }, [associatedTrials, trialClasses, entryCountByClassId, classEntryCountsUnavailable]);

  // Same cold-store fallback for the Trials tab's per-trial stat cards
  // (publicTrialStats from useShowLandingData).
  const effectiveTrialStats = associatedTrials.length > 0 ? trialStats : publicTrialStats;

  const hasEntryClassInventory = resolveEntryClassInventory({
    storeTrialCount: associatedTrials.length,
    effectiveTrialCount: effectiveTrials.length,
    effectiveClassCount: effectiveShowClasses.length,
    trialClassesReadStatus,
    publicClassInventoryResolved,
  });

  // Redirect if no show ID
  useEffect(() => {
    if (!id) {
      navigate('/shows', { replace: true });
    }
  }, [id, navigate]);

  // A manager's `?tab=` is now a PAGE (MYK9-630 phase 2), so a bookmark, a
  // shared link or a reload on one lands on the tab it names instead of a
  // `?tab=` the manager's strip no longer has. This is also the honest fix for
  // the `?tab=my-entries` cold-load failure (MYK9-634): the manager's tab set
  // no longer changes shape underneath the URL half-way through the load,
  // because the manager has no `?tab=` tab set at all.
  //
  // Exhibitors keep their `?tab=` strip untouched — the guard is
  // `audience === 'management'`, which is also false under `?preview=public`.
  const legacyTabTarget =
    audience === 'management' && !activeManagementSection && requestedTab
      ? LEGACY_SHOW_TAB_PARAM_REDIRECTS[requestedTab]
      : undefined;
  useEffect(() => {
    if (!id || !legacyTabTarget) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('tab');
    for (const [key, value] of Object.entries(legacyTabTarget.search ?? {})) {
      nextParams.set(key, value);
    }
    const query = nextParams.toString();
    // The hash rides along, exactly as `LegacyShowSectionRedirect` does it: a
    // bookmark is as likely to carry `#…` as `?…`, and two redirect paths that
    // disagree about it is a bug waiting for whichever one is untested.
    navigate(
      `/shows/${id}${legacyTabTarget.path ? `/${legacyTabTarget.path}` : ''}${query ? `?${query}` : ''}${hash}`,
      { replace: true }
    );
  }, [hash, id, legacyTabTarget, navigate, searchParams]);

  function handleRegisterForShow(): void {
    if (showId) {
      // Preserve any `?dogId=` the exhibitor arrived with so the wizard can
      // preselect the dog they pressed "Enter a show" on (MYK9-519).
      navigate(withEntryDogContext(`/shows/${showId}/register`, entryDogId));
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
    () =>
      buildShowDetailTabDefs({
        isAuthenticated,
        canShowMap,
        trialCount: effectiveTrials.length,
        classCount: effectiveShowClasses.length,
        submittedEntryHistoryCount: submittedEntryProjection.historyCount,
        submittedEntryProjectionIsReady: submittedEntryProjection.isReady,
        resultsCount,
      }),
    [
      isAuthenticated,
      canShowMap,
      effectiveTrials.length,
      effectiveShowClasses.length,
      submittedEntryProjection.historyCount,
      submittedEntryProjection.isReady,
      resultsCount,
    ]
  );

  // The secretary's six tabs. Built here because every badge reads data this
  // page already loaded -- the Entries badge in particular counts the SAME
  // `secretaryEntries` read the Entries tab renders from (MYK9-630 AC3).
  const sectionTabDefs: PrimaryTabDef[] = useMemo(
    () =>
      buildShowManagementTabDefs({
        catalogEntryCount,
        managerEntryDataUnavailable,
        resultsCount,
      }),
    [catalogEntryCount, managerEntryDataUnavailable, resultsCount]
  );

  // Loading state
  if (fastLoading) {
    return (
      <PageShell>
        <LoadingSkeleton variant="cards" count={3} heading="Loading show" />
      </PageShell>
    );
  }

  // Error state — fetch failed
  if (fastError) {
    return (
      <PageShell>
        <ErrorState
          message="We couldn't load this show. Please try again."
          onRetry={refetchShow}
          headingLevel={1}
        />
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

  if (audience === 'pending') {
    return (
      <PageShell>
        <LoadingSkeleton variant="cards" heading="Loading show" />
      </PageShell>
    );
  }

  // Before the public branch: getEntryStatus always handled `not_yet_open`.
  const entryStatus = getEntryStatus(actualCurrentShow, hasUserEntries, {
    hasEntryClassInventory,
  });

  if (audience === 'public') {
    return (
      <ShowPublicLanding
        show={actualCurrentShow}
        landingTrials={landingTrials}
        offeredClasses={publicShowClasses}
        hasEntryClassInventory={hasEntryClassInventory}
        entryNotYetOpen={entryStatus.status === 'not_yet_open'}
        refreshFailed={refreshFailed}
        onRetry={() => void refetchShow()}
      />
    );
  }

  // The tab body is identical across both authed surfaces — build it once.
  const tabsProps: ShowDetailTabsProps = {
    show: actualCurrentShow,
    tabs: tabDefs,
    activeTab,
    onTabChange: setTab,
    canManageShow,
    canShowMap,
    isAuthenticated,
    hasUserEntries,
    judges: effectiveJudges,
    classes: effectiveShowClasses,
    trials: effectiveTrials,
    trialStats: effectiveTrialStats,
    mapTrials: associatedTrials,
    mapClasses: showClasses,
    mapEntries: effectiveShowMapEntries,
    entryDataState,
    onRetryEntryData: () => void refetchSecretaryEntries(),
    exhibitorEntryRows,
    exhibitorEntryDataState,
  };

  // ShowPresenceProvider wraps only the authed surfaces (matching the prior
  // behavior where the public landing rendered outside it). Presence UI lives
  // in the management shell, which relies on this provider as an ancestor.
  return (
    <ShowPresenceProvider showId={id}>
      {audience === 'management' ? (
        <ShowManagementShell
          show={actualCurrentShow}
          showId={showId}
          breadcrumbs={breadcrumbs}
          armbandCount={armbandCount}
          catalogEntryCount={catalogEntryCount}
          canonicalShowHref={canonicalShowHref}
          activeManagementSection={activeManagementSection}
          tabs={tabsProps}
          sectionTabs={sectionTabDefs}
          entryDataState={entryDataState}
          onRetryEntryData={() => void refetchSecretaryEntries()}
        />
      ) : (
        <ShowExhibitorView
          show={actualCurrentShow}
          breadcrumbs={breadcrumbs}
          catalogEntryCount={classEntryCountsUnavailable ? null : catalogEntryCount}
          entryStatus={entryStatus}
          hasUserEntries={hasUserEntries}
          onRegister={handleRegisterForShow}
          isManagementSection={isManagementSection}
          isWaitingForEntryDefault={isWaitingForExhibitorEntryDefault}
          tabs={tabsProps}
        />
      )}
    </ShowPresenceProvider>
  );
};

export default ShowDetailsPage;
