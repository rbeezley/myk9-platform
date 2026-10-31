/**
 * At-show class picker: trial-grouped staff navigation, assignment-first judge
 * navigation, and owned-entry-first exhibitor navigation. Novice A/B sections
 * share one card and route to the combined entry list.
 */

import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getClassIds, type ClassEntry } from '@myk9/ringside';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { useOnlineStatus } from '@/lib/networkUtils';
import { areReplicationTablesPendingFirstSync } from '@/utils/replicationSyncEmptyState';
import { useAtShowClassList } from './useAtShowClassList';
import { useMyAtShowEntries } from './useMyAtShowEntries';
import { useMyAtShowEntryDetails } from './useMyAtShowEntryDetails';
import { AtShowMyEntriesToday } from './AtShowMyEntriesToday';
import {
  isExhibitorOnlyForAtShow,
  type AtShowClassSummary,
  type AtShowTrialSummary,
} from './myAtShowEntryDetails.helpers';
import { formatAtShowClassTime } from './atShowClassTiming';
import { getTrialTimezone } from '@/features/registries';
import { useSelfCheckinStateMap } from '@/hooks/queries/useSelfCheckinEnabled';
import { AtShowClassListSections } from './AtShowClassListSections';
import { AtShowClassListSkeleton } from './AtShowClassListSkeleton';
import { AtShowSetupSheetLink } from './AtShowSetupSheetLink';
import { AtShowDogsLink } from './AtShowDogsLink';
import { WIDE_COLUMN } from './atShowClassListLayout';
import { formatAtShowTrialHeading } from './atShowTrialHeading';
import { useNow } from '@/hooks/useNow';
import { useCollapsedTrials } from './useCollapsedTrials';
import { useAtShowPickerClasses } from './useAtShowPickerClasses';
import { useAtShowClassCards } from './useAtShowClassCards';
import { useAtShowClassRefresh } from './useAtShowClassRefresh';
import {
  AtShowClassListToolbar,
  AtShowClassRefreshButton,
  AtShowClassRefreshResult,
} from './AtShowClassListToolbar';
import {
  AtShowClassListEmptyScreen,
  AtShowClassListErrorScreen,
  AtShowClassListNoAssignmentsScreen,
} from './AtShowClassListScreens';
import {
  DEFAULT_CLASS_LIST_SORT,
  DEFAULT_CLASS_LIST_TAB,
  classMatchesSearch,
  classMatchesTab,
  countByTab,
  sortClassCards,
  sortYourRingCards,
} from './atShowClassListFilter';

/** The scopes the picker's own rows come from. */
const CLASS_DATA_TABLES = ['shows', 'trials', 'classes'] as const;
import { ClassListUpButton } from './ClassListUpButton';
import { RingsideMenu } from './menu/RingsideMenu';
import { selectNextUpForCard } from './atShowNextUpPreview';
import { useMyAtShowJudgeAssignments } from './useMyAtShowJudgeAssignments';
import { OfflineReadyBadge } from '@/features/offline-readiness/OfflineReadyBadge';
import { isJudgeOnlyAtShow } from './isJudgeOnlyAtShow';

/**
 * Staff-only readiness action. Rendered in EVERY branch of the page — the
 * moment the device most needs priming is precisely when classes or
 * assignments failed to load, so hiding it behind the happy path would
 * withhold the recovery action when it matters (MYK9-203).
 */
function AtShowOfflineReadySlot({
  showId,
  isExhibitorOnly,
}: {
  showId: string | undefined;
  isExhibitorOnly: boolean;
}) {
  if (isExhibitorOnly) return null;
  return (
    <div className="mb-4 flex justify-center">
      <OfflineReadyBadge showId={showId} />
    </div>
  );
}

export const AtShowClassListPage: React.FC = () => {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const {
    groups,
    nextUpByClassId,
    organization,
    showName,
    showDateLabel,
    showLocation,
    clubId,
    isLoading,
    error,
    classDataHydration,
    entryCountsAvailable,
    refresh,
  } = useAtShowClassList(showId);
  const { status: syncStatus } = useReplicationSync();
  const { hasRole, user } = useAuthContext();
  const {
    assignedClassIds,
    isUnknown: assignmentsUnknown,
    error: assignmentError,
    isLoading: assignmentsLoading,
    retry: retryAssignments,
  } = useMyAtShowJudgeAssignments(showId);
  const isOnline = useOnlineStatus();

  // For a judge-only account, keep the picker focused on assigned classes.
  // This is a UI scope; route guards, RLS, and canScore remain the security
  // gates. Broader staff roles still need the full picker for show-day
  // coordination, while anonymous passcode sessions are show-wide by design.
  const isJudgeOnly =
    Boolean(user) && isJudgeOnlyAtShow({ isAnonymous: Boolean(user?.is_anonymous), hasRole });

  // Narrowing the picker to "my classes" is only safe when we actually know
  // which classes are mine. When the assignment set is unknown (offline cold
  // boot, where roles are cached but identity is not), filtering by an empty
  // set would hide every class and then report the show as unassigned. Fail
  // OPEN to the full picker: showing a judge more than their ring is a mild
  // inconvenience; showing them nothing is a dead end at ringside.
  const scopeToAssignedClasses = isJudgeOnly && !assignmentsUnknown;

  // Minute clock so the Today/past split follows a midnight rollover (MYK9-1224).
  const nowMs = useNow(60_000);

  // Card extras (heart, details, options, upload indicator) and their dialogs.
  const { favoriteClassIds, rowProps, dialogs: cardDialogs } = useAtShowClassCards(showId, groups);

  const { groupedByTrial, yourRingClasses } = useAtShowPickerClasses({
    groups,
    organization,
    scopeToAssignedClasses,
    assignedClassIds,
    favoriteClassIds,
    nowMs,
  });

  // Tabs, search and sort narrow the cards already on the device (works offline).
  const [tab, setTab] = useState(DEFAULT_CLASS_LIST_TAB);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(DEFAULT_CLASS_LIST_SORT);
  const allCards = useMemo(() => groupedByTrial.flatMap(group => group.classes), [groupedByTrial]);
  const tabCounts = useMemo(() => countByTab(allCards), [allCards]);
  const visibleByTrial = useMemo(
    () =>
      groupedByTrial.map(({ trial, classes }) => ({
        trial,
        classes: sortClassCards(
          classes.filter(card => classMatchesTab(card, tab) && classMatchesSearch(card, search)),
          sort
        ),
      })),
    [groupedByTrial, tab, search, sort]
  );
  // Your ring follows the selected tab too: for a judge-only account it IS the picker,
  // so a tab that hid it would hide their completed classes.
  const visibleYourRing = useMemo(
    () =>
      sortYourRingCards(
        yourRingClasses.filter(
          ({ entry }) => classMatchesTab(entry, tab) && classMatchesSearch(entry, search)
        ),
        sort
      ),
    [yourRingClasses, tab, search, sort]
  );

  const { phase: refreshPhase, refresh: refreshClasses } = useAtShowClassRefresh(
    showId,
    isOnline,
    refresh
  );

  // Exhibitor show day starts from owned entries, not ringside class
  // administration (design decision, section 3 of the elderly-UX remediation).
  // Staff accounts — including a secretary who also exhibits — keep the
  // class-first default.
  const isExhibitorOnly = isExhibitorOnlyForAtShow(hasRole);

  // MYK9-637 (round 2): a synced show scope proves the entries READ happened,
  // not that it returned every class's rows. `view_authenticated_entry_results`
  // admits a non-manager judge per class (`is_assigned_judge`), and an
  // exhibitor only to their own entries -- so for those viewers a class outside
  // the set they can see holds no local rows for a reason that has nothing to
  // do with how many entries it has. Rendering that as `0 / 0` is the original
  // bug wearing a different hat, and it lands hardest on exactly the fail-open
  // path (assignments unknown on an offline cold boot) where the picker
  // deliberately widens to every class.
  const seesEveryEntryInShow = !isJudgeOnly && !isExhibitorOnly;
  const hasTrustedEntryCount = useCallback(
    (entry: ClassEntry) =>
      entryCountsAvailable &&
      (seesEveryEntryInShow || getClassIds(entry).every(id => assignedClassIds.has(id))),
    [assignedClassIds, entryCountsAvailable, seesEveryEntryInShow]
  );

  const {
    ownEntryIds,
    isLoading: ownershipLoading,
    isUnknown: ownershipUnknown,
  } = useMyAtShowEntries(showId);
  // 'Your dogs today' must never offer Check In for a class the
  // `self_checkin_entry` RPC will refuse, or for one the cascade hasn't
  // resolved yet (MYK9-800 follow-up) — the tri-state map shares its
  // underlying queries/cache with My Shows' day check-in gate
  // (`useSelfCheckinMap`), so the two surfaces can't disagree about which
  // classes allow self-check-in.
  const allClassIds = useMemo(
    () => groups.flatMap(group => group.classes.map(cls => cls.id)),
    [groups]
  );
  const selfCheckinByClassId = useSelfCheckinStateMap(allClassIds);
  const classesById = useMemo(() => {
    const map = new Map<string, AtShowClassSummary>();
    for (const group of groups) {
      const timeZone = getTrialTimezone(group.trial);
      for (const cls of group.classes) {
        map.set(cls.id, {
          className: cls.class_name,
          classStatus: cls.class_status,
          ...(cls.start_time
            ? { expectedStartLabel: formatAtShowClassTime(cls.start_time, timeZone) }
            : {}),
          ...(cls.start_time ? { startTime: cls.start_time } : {}),
          classOrder: cls.class_order,
          isRevisedStart: Boolean(cls.revised_expected_start),
          resultsReleasedAt: cls.results_released_at ?? null,
          selfCheckinState: selfCheckinByClassId[cls.id] ?? 'unknown',
        });
      }
    }
    return map;
  }, [groups, selfCheckinByClassId]);
  // 'Your dogs today' filters an exhibitor's entries to today's trial in the
  // trial's own timezone (MYK9-800) — one summary per trial, keyed by trial
  // id so an entry can resolve its day even before a class is posted. `label`
  // reuses the same "<trial label> · <date>" heading the trial sections below
  // already render (MYK9-704), so the row picks up trial date + number
  // without inventing a second format for it.
  const trialsById = useMemo(() => {
    const map = new Map<string, AtShowTrialSummary>();
    for (const group of groups) {
      map.set(group.trial.id, {
        date: group.trial.date,
        timezone: getTrialTimezone(group.trial),
        label: formatAtShowTrialHeading(group.trial),
      });
    }
    return map;
  }, [groups]);
  const myEntryDetails = useMyAtShowEntryDetails(
    showId,
    ownEntryIds,
    ownershipLoading,
    classesById,
    trialsById
  );

  // `null` = no manual override yet, so the view tracks ownership as it
  // resolves (starts 'all' while ownEntryIds is still loading, flips to
  // 'mine' once entries are known) without fighting an explicit user choice.
  // Kept in the URL (`?view=`) so the ringside menu's return control restores it.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const manualView = requestedView === 'mine' || requestedView === 'all' ? requestedView : null;
  const setManualView = useCallback(
    (next: 'mine' | 'all') =>
      setSearchParams(
        previous => {
          const params = new URLSearchParams(previous);
          params.set('view', next);
          return params;
        },
        { replace: true }
      ),
    [setSearchParams]
  );
  const view: 'mine' | 'all' =
    manualView ?? (isExhibitorOnly && ownEntryIds.size > 0 ? 'mine' : 'all');

  const handleClassClick = useCallback(
    (entry: ClassEntry) => {
      const ids = getClassIds(entry);
      navigate(
        ids.length === 2
          ? `/at-show/${showId}/class/${ids[0]}/${ids[1]}`
          : `/at-show/${showId}/class/${ids[0]}`
      );
    },
    [navigate, showId]
  );

  const { collapsedTrialIds, toggleTrial } = useCollapsedTrials(showId);

  // Only a sync that can still make progress justifies a spinner. Offline,
  // `triggerSync` returns early and every table stays 'idle' -- a skeleton that
  // never resolves on a device that is already primed. That connectivity test
  // now lives inside `areReplicationTablesPendingFirstSync` (MYK9-365) so all
  // five call sites are covered, not the two that wrote it out by hand.
  const isClassDataStillSyncing =
    groups.length === 0 &&
    areReplicationTablesPendingFirstSync(syncStatus, ['shows', 'trials', 'classes', 'entries']);
  const hasClasses = groupedByTrial.some(group => group.classes.length > 0);
  const isCheckingOfflineEmptyScope = !isOnline && !hasClasses && classDataHydration === 'checking';

  // An empty picker is only a statement about the SHOW when a read actually
  // reached the device. There are TWO ways that cannot be proven:
  //
  //  - offline, persisted per-scope metadata does not prove that every remote
  //    trial/class row is present. Process-local table status is deliberately
  //    ignored because it resets to 'idle' on every cold boot.
  //  - ONLINE, but the first sync errored -- venue wifi that associates but
  //    does not carry. `areReplicationTablesPendingFirstSync` counts only
  //    'idle'/'syncing', so 'error' reads as settled; and `getAll()` catches
  //    every read failure and returns [] (ReplicatedTableQuery.ts:150-155), so
  //    `error` is null as well. Without the first term the page asserts "this
  //    show has no classes yet" -- the exact false claim this file exists to
  //    prevent, left standing in the one quadrant a `!isOnline` guard excludes.
  const classSyncFailed = CLASS_DATA_TABLES.some(
    table => syncStatus.tablesStatus[table] === 'error'
  );
  const classDataNeverReachedDevice =
    classSyncFailed || (!isOnline && classDataHydration !== 'hydrated');

  if (isLoading || isClassDataStillSyncing || isCheckingOfflineEmptyScope || assignmentsLoading) {
    return (
      <>
        <div className={`ringside-root ${WIDE_COLUMN} px-4 pt-4`}>
          <AtShowOfflineReadySlot showId={showId} isExhibitorOnly={isExhibitorOnly} />
        </div>
        <AtShowClassListSkeleton />
      </>
    );
  }

  const readySlot = <AtShowOfflineReadySlot showId={showId} isExhibitorOnly={isExhibitorOnly} />;

  if (error) {
    return (
      <AtShowClassListErrorScreen
        showId={showId}
        clubId={clubId}
        readySlot={readySlot}
        onRetry={refresh}
      />
    );
  }

  if (isJudgeOnly && !assignmentsLoading && !assignmentsUnknown && assignedClassIds.size === 0) {
    return (
      <AtShowClassListNoAssignmentsScreen
        readySlot={readySlot}
        assignmentError={Boolean(assignmentError)}
        onRetry={retryAssignments}
        onBack={() => navigate('/judge/dashboard')}
      />
    );
  }

  if (view === 'mine') {
    return (
      <AtShowMyEntriesToday
        showId={showId as string}
        showName={showName}
        showDateLabel={showDateLabel}
        venue={showLocation}
        {...myEntryDetails}
        onSeeAllClasses={() => setManualView('all')}
      />
    );
  }

  if (!hasClasses) {
    return (
      <AtShowClassListEmptyScreen
        showId={showId}
        clubId={clubId}
        readySlot={readySlot}
        neverReachedDevice={classDataNeverReachedDevice}
        syncFailed={classSyncFailed}
        onRetry={refresh}
      />
    );
  }

  return (
    // Ringside is used on a tablet in landscape (INTENT s.6). A fixed 672px
    // column left ~half the viewport empty there and forced avoidable
    // scrolling through the class list mid-show, so the column widens with
    // the display instead of being capped at phone width forever.
    <main className={`ringside-root ${WIDE_COLUMN} px-4 py-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <ClassListUpButton showId={showId} clubId={clubId} />
        <div className="flex items-center gap-2">
          {/* Gating this on `ownEntryIds.size > 0` alone hid the only route back
              to an exhibitor's own dogs whenever ownership was merely UNKNOWN --
              a cold device at the venue -- stranding them in the staff class
              list. Offer the door whenever we have entries OR cannot rule them
              out; the destination handles its own empty state. */}
          {isExhibitorOnly && (ownEntryIds.size > 0 || ownershipUnknown) && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 gap-1.5 px-3"
              onClick={() => setManualView('mine')}
            >
              Your dogs today
            </Button>
          )}
          <AtShowClassRefreshButton phase={refreshPhase} onRefresh={() => void refreshClasses()} />
          <RingsideMenu showId={showId} />
        </div>
      </div>

      {showName && <h1 className="mb-4 text-center text-lg font-semibold">{showName}</h1>}

      <AtShowOfflineReadySlot showId={showId} isExhibitorOnly={isExhibitorOnly} />

      <AtShowDogsLink showId={showId} />

      <AtShowSetupSheetLink showId={showId} groups={groups} isExhibitorOnly={isExhibitorOnly} />

      {/* MYK9-1184: the exhibitor's way back to "Your dogs today" is a button,
          so name what this all-days list is. */}
      {isExhibitorOnly && <h2 className="mb-3 px-1 text-sm font-semibold">All classes</h2>}

      {assignmentError && (
        <section
          role="status"
          aria-label="Your ring unavailable"
          className="mb-6 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-warning"
        >
          <p className="min-w-0 flex-1 text-base">
            We couldn&apos;t load your assigned classes. The full class list is still available.
          </p>
          <Button type="button" variant="outline" className="min-h-11" onClick={retryAssignments}>
            Try again
          </Button>
        </section>
      )}

      <AtShowClassListToolbar
        tab={tab}
        onTabChange={setTab}
        counts={tabCounts}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
      />
      <AtShowClassRefreshResult phase={refreshPhase} />

      <AtShowClassListSections
        tab={tab}
        yourRing={visibleYourRing}
        byTrial={visibleByTrial}
        scopeToAssignedClasses={scopeToAssignedClasses}
        collapsedTrialIds={collapsedTrialIds}
        onToggleTrial={toggleTrial}
        cardProps={entry => ({
          isExhibitorOnly,
          onClick: handleClassClick,
          nextUp: selectNextUpForCard(getClassIds(entry), nextUpByClassId),
          entryCountsAvailable: hasTrustedEntryCount(entry),
          ...rowProps(entry),
        })}
      />
      {cardDialogs}
    </main>
  );
};

export default AtShowClassListPage;
