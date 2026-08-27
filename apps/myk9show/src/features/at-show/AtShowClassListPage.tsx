/**
 * AtShowClassListPage — Phase 1h at-show class picker (mobile cards).
 *
 * The navigation entry into the at-show flow: a judge taps a class card instead
 * of typing IDs. Classes are grouped by trial; Novice Section A/B pairs are
 * collapsed into one "A & B" card (via ringside `groupSectionedClasses`) that
 * routes to the combined EntryList; everything else routes to the single-class
 * EntryList. Mounted at `/at-show/:showId` (any account admitted by
 * `AtShowAccessGate` — staff or passcode). An exhibitor-only account with
 * owned entries at this show instead lands on `AtShowMyEntriesToday` by
 * default (see `isExhibitorOnlyForAtShow`); staff always see this class-first
 * view.
 *
 * Card styling is host-side (Tailwind) under `.ringside-root`; matching myK9Q's
 * exact class-card look is part of the visual-polish pass.
 */

import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ChevronRight, ArrowLeft } from 'lucide-react';
import {
  getEffectiveClassStatus,
  groupSectionedClasses,
  getClassIds,
  type ClassEntry,
} from '@myk9/ringside';
import { formatTrialDate } from '@myk9/core';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { hasScopedClubRole } from '@/utils/roleScopes';
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
import { selectNextUpForCard } from './atShowNextUpPreview';
import { useMyAtShowJudgeAssignments } from './useMyAtShowJudgeAssignments';
import { OfflineReadyBadge } from '@/features/offline-readiness/OfflineReadyBadge';
import { isJudgeOnlyAtShow } from './isJudgeOnlyAtShow';

const LIVE_CLASS_STATUSES = new Set<ClassEntry['class_status']>([
  'briefing',
  'start_time',
  'in_progress',
  'offline-scoring',
]);

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

function AtShowClassListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading at-show classes"
      className="ringside-root mx-auto max-w-2xl px-4 py-4"
    >
      <Skeleton className="mb-4 h-11 w-40" />
      <Skeleton className="mx-auto mb-5 h-6 w-56" />
      {Array.from({ length: 2 }).map((_, trialIndex) => (
        <div key={trialIndex} className="mb-6">
          <div className="mb-2 flex min-h-11 items-center gap-2 px-1">
            <Skeleton className="h-4 w-4 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: trialIndex === 0 ? 3 : 2 }).map((__, classIndex) => (
              <div
                key={classIndex}
                className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
              >
                <Skeleton className="h-6 w-6 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function classScanPriority(entry: ClassEntry): number {
  if (entry.is_favorite) return 0;
  if (LIVE_CLASS_STATUSES.has(entry.class_status)) return 1;
  if (entry.entry_count > 0) return 2;
  return 3;
}

function sortClassesForAtShowScan(classes: ClassEntry[]): ClassEntry[] {
  return [...classes].sort((a, b) => {
    const priorityDelta = classScanPriority(a) - classScanPriority(b);
    if (priorityDelta !== 0) return priorityDelta;
    const orderDelta = a.class_order - b.class_order;
    if (orderDelta !== 0) return orderDelta;
    return a.class_name.localeCompare(b.class_name);
  });
}

function yourRingScanPriority(entry: ClassEntry): number {
  const effectiveStatus = getEffectiveClassStatus(entry);
  if (
    effectiveStatus === 'briefing' ||
    effectiveStatus === 'start_time' ||
    effectiveStatus === 'in-progress' ||
    effectiveStatus === 'offline-scoring'
  ) {
    return 0;
  }
  if (entry.entry_count > 0) return 1;
  return 2;
}

interface YourRingClass {
  entry: ClassEntry;
  scanPriority: number;
  trialTimeZone: string;
}

function sortClassesForYourRing(classes: YourRingClass[]): YourRingClass[] {
  return [...classes].sort((a, b) => {
    const priorityDelta = a.scanPriority - b.scanPriority;
    if (priorityDelta !== 0) return priorityDelta;
    const orderDelta = a.entry.class_order - b.entry.class_order;
    if (orderDelta !== 0) return orderDelta;
    return a.entry.class_name.localeCompare(b.entry.class_name);
  });
}

function BackToRingsideExitButton({
  showId,
  clubId,
}: {
  showId: string | undefined;
  clubId: string | undefined;
}) {
  const navigate = useNavigate();
  const { hasRole, userWithRoles } = useAuthContext();
  // Mirror ShowManagementSectionRoute's admission exactly: secretary/site-admin
  // pass unconditionally, but a club admin only reaches show-desk when scoped to
  // THIS show's club. Predicting with a coarser check (any club admin) would
  // send a cross-club admin to a route that then bounces them to the public
  // show page — the ringside eject this button exists to avoid.
  const canUseShowDesk =
    hasRole(UserRole.SECRETARY) ||
    hasRole(UserRole.SITE_ADMIN) ||
    (hasRole(UserRole.CLUB_ADMIN) && hasScopedClubRole(userWithRoles, UserRole.CLUB_ADMIN, clubId));
  const label = canUseShowDesk ? 'Back to Show Desk' : 'Back to Ringside';
  const target = canUseShowDesk && showId ? `/shows/${showId}/show-desk` : '/at-show';

  return (
    <Button variant="ghost" className="min-h-11 gap-2 px-3" onClick={() => navigate(target)}>
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </Button>
  );
}

export const AtShowClassListPage: React.FC = () => {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const { groups, nextUpByClassId, organization, showName, clubId, isLoading, error, refresh } =
    useAtShowClassList(showId);
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
  const { ownEntryIds, isLoading: ownershipLoading, isUnknown: ownershipUnknown } =
    useMyAtShowEntries(showId);
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

  // An empty picker is only a statement about the SHOW when a read actually
  // reached the device. Offline with nothing cached it is a statement about
  // this device, and must be phrased as one.
  const classDataNeverReachedDevice =
    !isOnline &&
    areReplicationTablesPendingFirstSync(syncStatus, ['shows', 'trials', 'classes']);

  if (isLoading || isClassDataStillSyncing || assignmentsLoading) {
    return (
      <>
        <div className="ringside-root mx-auto max-w-2xl px-4 pt-4">
          <AtShowOfflineReadySlot showId={showId} isExhibitorOnly={isExhibitorOnly} />
        </div>
        <AtShowClassListSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <div className="ringside-root flex flex-col items-center justify-center h-96 gap-3 px-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium text-destructive">Failed to load classes</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <AtShowOfflineReadySlot showId={showId} isExhibitorOnly={isExhibitorOnly} />
        <div className="flex w-full max-w-xs flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
          <Button variant="outline" className="min-h-11 px-6" onClick={refresh}>
            Try again
          </Button>
          <BackToRingsideExitButton showId={showId} clubId={clubId} />
        </div>
      </div>
    );
  }

  if (isJudgeOnly && !assignmentsLoading && !assignmentsUnknown && assignedClassIds.size === 0) {
    return (
      <div className="ringside-root flex min-h-96 flex-col items-center justify-center gap-3 px-4 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium">
          {assignmentError ? "We couldn't load your judge assignments" : 'No classes assigned yet'}
        </p>
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
      </div>
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

  const hasClasses = groupedByTrial.some(g => g.classes.length > 0);
  if (!hasClasses) {
    return (
      <div className="ringside-root flex min-h-96 flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-lg font-medium">
          {classDataNeverReachedDevice ? 'Classes not on this device yet' : 'No classes'}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {classDataNeverReachedDevice
            ? "This device hasn't downloaded this show's classes, and there's no connection to fetch them now. Reconnect once and they'll be here for the rest of the day."
            : 'This show has no classes yet.'}
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
      </div>
    );
  }

  return (
    <div className="ringside-root mx-auto max-w-2xl px-4 py-4">
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

      {groupedByTrial.map(({ trial, classes }) => {
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
    </div>
  );
};

export default AtShowClassListPage;
