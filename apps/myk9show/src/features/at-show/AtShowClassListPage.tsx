/**
 * At-show class picker: trial-grouped staff navigation, assignment-first judge
 * navigation, and owned-entry-first exhibitor navigation. Novice A/B sections
 * share one card and route to the combined entry list.
 */

import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { groupSectionedClasses, getClassIds, type ClassEntry } from '@myk9/ringside';
import { formatTrialDate } from '@myk9/core';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { useOnlineStatus } from '@/lib/networkUtils';
import { areReplicationTablesPendingFirstSync } from '@/utils/replicationSyncEmptyState';
import { useAtShowClassList } from './useAtShowClassList';
import { useMyAtShowEntries } from './useMyAtShowEntries';
import { useMyAtShowEntryDetails } from './useMyAtShowEntryDetails';
import { AtShowMyEntriesToday } from './AtShowMyEntriesToday';
import { isExhibitorOnlyForAtShow, type AtShowClassSummary } from './myAtShowEntryDetails.helpers';
import { loadCollapsedTrialIds, saveCollapsedTrialIds } from './atShowClassListState';
import { formatAtShowClassTime } from './atShowClassTiming';
import { getTrialTimezone } from '@/features/registries';
import { AtShowClassRow } from './AtShowClassRow';
import { AtShowClassListSkeleton } from './AtShowClassListSkeleton';
import { WIDE_COLUMN } from './atShowClassListLayout';

/** The scopes the picker's own rows come from. */
const CLASS_DATA_TABLES = ['shows', 'trials', 'classes'] as const;
import { BackToRingsideExitButton } from './BackToRingsideExitButton';
import {
  sortClassesForAtShowScan,
  sortClassesForYourRing,
  yourRingScanPriority,
} from './atShowClassListSort';
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
    clubId,
    isLoading,
    error,
    classDataHydration,
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

  // Group Novice A/B pairs into single combined entries per trial.
  const groupedByTrial = useMemo(
    () =>
      groups
        .map(g => ({
          ...g,
          classes: scopeToAssignedClasses
            ? g.classes.filter(cls => assignedClassIds.has(cls.id))
            : g.classes,
        }))
        .map(g => ({
          trial: g.trial,
          classes: sortClassesForAtShowScan(groupSectionedClasses(g.classes, organization)),
        })),
    [assignedClassIds, groups, scopeToAssignedClasses, organization]
  );

  // Filter before A/B grouping so a judge assigned to only one section never
  // gets an unassigned partner pulled into the pinned section.
  const yourRingClasses = useMemo(
    () =>
      sortClassesForYourRing(
        groups.flatMap(group => {
          const assignedClasses = group.classes.filter(cls => assignedClassIds.has(cls.id));
          const scanPriorities = new Map(
            assignedClasses.map(cls => [cls.id, yourRingScanPriority(cls)])
          );

          return groupSectionedClasses(assignedClasses, organization).map(entry => ({
            entry,
            scanPriority: Math.min(
              ...getClassIds(entry).map(
                classId => scanPriorities.get(classId) ?? yourRingScanPriority(entry)
              )
            ),
            trialTimeZone: getTrialTimezone(group.trial),
          }));
        })
      ),
    [assignedClassIds, groups, organization]
  );

  // Exhibitor show day starts from owned entries, not ringside class
  // administration (design decision, section 3 of the elderly-UX remediation).
  // Staff accounts — including a secretary who also exhibits — keep the
  // class-first default.
  const isExhibitorOnly = isExhibitorOnlyForAtShow(hasRole);
  const {
    ownEntryIds,
    isLoading: ownershipLoading,
    isUnknown: ownershipUnknown,
  } = useMyAtShowEntries(showId);
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
          isRevisedStart: Boolean(cls.revised_expected_start),
        });
      }
    }
    return map;
  }, [groups]);
  const {
    entries: myEntries,
    isLoading: myEntriesLoading,
    dataUpdatedAt: myEntriesUpdatedAt,
  } = useMyAtShowEntryDetails(showId, ownEntryIds, ownershipLoading, classesById);

  // `null` = no manual override yet, so the view tracks ownership as it
  // resolves (starts 'all' while ownEntryIds is still loading, flips to
  // 'mine' once entries are known) without fighting an explicit user choice.
  const [manualView, setManualView] = useState<'mine' | 'all' | null>(null);
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

  // Trial sections default to open; we track the COLLAPSED ones so an empty
  // record means "all expanded" (the page's original behavior). Persisted
  // per-show so a judge's focus on one ring survives reloads.
  const [collapsedTrialIds, setCollapsedTrialIds] = useState<Set<string>>(
    () => new Set(showId ? loadCollapsedTrialIds(showId) : [])
  );

  // The `/at-show/:showId` route reuses this component instance across a param
  // change (no remount), so re-load the per-show collapsed set whenever the
  // show changes — otherwise the new show would inherit the previous show's
  // collapsed sections and the next toggle would persist them under its key.
  // React's "adjust state during render" pattern (no effect): reset when the
  // tracked show id no longer matches the current one.
  const [trackedShowId, setTrackedShowId] = useState(showId);
  if (showId !== trackedShowId) {
    setTrackedShowId(showId);
    setCollapsedTrialIds(new Set(showId ? loadCollapsedTrialIds(showId) : []));
  }

  const toggleTrial = useCallback(
    (trialId: string, open: boolean) => {
      setCollapsedTrialIds(current => {
        const next = new Set(current);
        // `open` is the next desired state from the Collapsible: open => not collapsed.
        if (open) next.delete(trialId);
        else next.add(trialId);
        if (showId) saveCollapsedTrialIds(showId, [...next]);
        return next;
      });
    },
    [showId]
  );

  // Only a sync that can still make progress justifies a spinner. Offline,
  // `triggerSync` returns early and every table stays 'idle', which this helper
  // counts as pending-first-sync -- so without the connectivity test the judge
  // gets a skeleton that never resolves on a device that is already primed.
  const isClassDataStillSyncing =
    groups.length === 0 &&
    isOnline &&
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

  if (error) {
    return (
      <main className="ringside-root flex min-h-96 flex-col items-center justify-center gap-3 px-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" aria-hidden />
        <h1 className="text-lg font-medium text-destructive">Failed to load classes</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The class list could not be read on this device. Try again, and if it keeps failing ask
          the secretary to check this show.
        </p>
        <AtShowOfflineReadySlot showId={showId} isExhibitorOnly={isExhibitorOnly} />
        <div className="flex w-full max-w-xs flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
          <Button variant="outline" className="min-h-11 px-6" onClick={refresh}>
            Try again
          </Button>
          <BackToRingsideExitButton showId={showId} clubId={clubId} />
        </div>
      </main>
    );
  }

  if (isJudgeOnly && !assignmentsLoading && !assignmentsUnknown && assignedClassIds.size === 0) {
    return (
      <main className="ringside-root flex min-h-96 flex-col items-center justify-center gap-3 px-4 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-medium">
          {assignmentError ? "We couldn't load your judge assignments" : 'No classes assigned yet'}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {assignmentError
            ? 'Check your connection and try again. Your classes will appear here once assignments are available.'
            : 'Your secretary has not assigned you to a class for this show yet. Ask them to add your judge assignment.'}
        </p>
        <AtShowOfflineReadySlot showId={showId} isExhibitorOnly={isExhibitorOnly} />
        <div className="flex flex-col gap-2 sm:flex-row">
          {assignmentError && (
            <Button variant="outline" className="min-h-11" onClick={retryAssignments}>
              Try again
            </Button>
          )}
          <Button className="min-h-11" onClick={() => navigate('/judge/dashboard')}>
            Back to Judge Dashboard
          </Button>
        </div>
      </main>
    );
  }

  if (view === 'mine') {
    return (
      <AtShowMyEntriesToday
        showId={showId as string}
        entries={myEntries}
        isLoading={myEntriesLoading}
        dataUpdatedAt={myEntriesUpdatedAt}
        onSeeAllClasses={() => setManualView('all')}
      />
    );
  }

  if (!hasClasses) {
    return (
      <main className="ringside-root flex min-h-96 flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-lg font-medium">
          {classDataNeverReachedDevice ? 'Classes not on this device yet' : 'No classes'}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {!classDataNeverReachedDevice
            ? 'This show has no classes yet.'
            : classSyncFailed
              ? "This show's classes could not be loaded onto this device. Try again, and if it keeps failing move somewhere with a better signal."
              : "This device hasn't downloaded this show's classes, and there's no connection to fetch them now. Reconnect once and they'll be here for the rest of the day."}
        </p>
        {/* The branch a cold replica lands in is exactly the branch where
            priming helps most, so the readiness action belongs here too. */}
        <AtShowOfflineReadySlot showId={showId} isExhibitorOnly={isExhibitorOnly} />
        <div className="flex w-full max-w-xs flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
          {classDataNeverReachedDevice && (
            <Button variant="outline" className="min-h-11 px-6" onClick={refresh}>
              Try again
            </Button>
          )}
          <BackToRingsideExitButton showId={showId} clubId={clubId} />
        </div>
      </main>
    );
  }

  return (
    // Ringside is used on a tablet in landscape (INTENT s.6). A fixed 672px
    // column left ~half the viewport empty there and forced avoidable
    // scrolling through the class list mid-show, so the column widens with
    // the display instead of being capped at phone width forever.
    <main className={`ringside-root ${WIDE_COLUMN} px-4 py-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <BackToRingsideExitButton showId={showId} clubId={clubId} />
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
      </div>

      {showName && <h1 className="mb-4 text-center text-lg font-semibold">{showName}</h1>}

      <AtShowOfflineReadySlot showId={showId} isExhibitorOnly={isExhibitorOnly} />

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

      {yourRingClasses.length > 0 && (
        <section
          aria-labelledby="your-ring-heading"
          className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-3"
        >
          <div className="mb-2 flex min-h-11 items-center gap-2 px-1">
            <h2 id="your-ring-heading" className="min-w-0 flex-1 text-sm font-semibold">
              Your ring
            </h2>
            <span className="shrink-0 rounded-full bg-[color:var(--chip-stone-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--chip-stone-fg)]">
              {yourRingClasses.length}
            </span>
          </div>
          <ul className="space-y-2">
            {yourRingClasses.map(({ entry, trialTimeZone }) => (
              <AtShowClassRow
                key={entry.id}
                entry={entry}
                isExhibitorOnly={isExhibitorOnly}
                onClick={handleClassClick}
                trialTimeZone={trialTimeZone}
                nextUp={selectNextUpForCard(getClassIds(entry), nextUpByClassId)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* INTENT: For a judge-only account with known assignments, Your ring
          IS the picker. Rendering the same rows again by trial doubles the
          scroll without adding a navigation option. Broader staff and the
          assignment-unknown fail-open retain the show-wide trial list. */}
      {!scopeToAssignedClasses &&
        groupedByTrial.map(({ trial, classes }) => {
          if (classes.length === 0) return null;
          const trialNumber = trial.trialNumber ?? trial.trial_number;
          const trialDate = trial.date ?? trial.trial_date;
          const isOpen = !collapsedTrialIds.has(trial.id);
          const trialDateLabel = trialDate ? formatTrialDate(trialDate) : '';
          const trialTimeZone = getTrialTimezone(trial);
          const trialLabel = `${trialNumber ? `Trial ${trialNumber}` : 'Trial'}${
            trialDateLabel ? ` · ${trialDateLabel}` : ''
          }`;
          return (
            <Collapsible
              key={trial.id}
              open={isOpen}
              onOpenChange={open => toggleTrial(trial.id, open)}
              className="mb-6"
              data-testid={`at-show-trial-${trial.id}`}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-2 px-1 text-left text-sm font-medium text-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${trialLabel}`}
                >
                  <ChevronRight
                    size={16}
                    className={cn('shrink-0 transition-transform', { 'rotate-90': isOpen })}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{trialLabel}</span>
                  <span className="shrink-0 rounded-full bg-[color:var(--chip-stone-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--chip-stone-fg)]">
                    {classes.length}
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 space-y-2">
                  {classes.map(entry => (
                    <AtShowClassRow
                      key={entry.id}
                      entry={entry}
                      isExhibitorOnly={isExhibitorOnly}
                      onClick={handleClassClick}
                      trialTimeZone={trialTimeZone}
                      nextUp={selectNextUpForCard(getClassIds(entry), nextUpByClassId)}
                    />
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
    </main>
  );
};

export default AtShowClassListPage;
