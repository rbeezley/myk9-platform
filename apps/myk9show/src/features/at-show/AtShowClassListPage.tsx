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
import { AlertCircle, User, ChevronRight, Star, ArrowLeft } from 'lucide-react';
import {
  groupSectionedClasses,
  getClassIds,
  getClassStatusColor,
  getFormattedClassStatus,
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
import { areReplicationTablesPendingFirstSync } from '@/utils/replicationSyncEmptyState';
import { useAtShowClassList } from './useAtShowClassList';
import { useMyAtShowEntries } from './useMyAtShowEntries';
import { useMyAtShowEntryDetails } from './useMyAtShowEntryDetails';
import { AtShowMyEntriesToday } from './AtShowMyEntriesToday';
import { isExhibitorOnlyForAtShow, type AtShowClassSummary } from './myAtShowEntryDetails.helpers';
import { loadCollapsedTrialIds, saveCollapsedTrialIds } from './atShowClassListState';
import { badgeClass, getClassListStatusTier } from './slots/atShowChrome.helpers';

const LIVE_CLASS_STATUSES = new Set<ClassEntry['class_status']>([
  'briefing',
  'start_time',
  'in_progress',
  'offline-scoring',
]);

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
  const { groups, organization, showName, clubId, isLoading, error, refresh } =
    useAtShowClassList(showId);
  const { status: syncStatus } = useReplicationSync();
  const { hasRole } = useAuthContext();

  // Group Novice A/B pairs into single combined entries per trial.
  const groupedByTrial = useMemo(
    () =>
      groups.map(g => ({
        trial: g.trial,
        classes: sortClassesForAtShowScan(groupSectionedClasses(g.classes, organization)),
      })),
    [groups, organization]
  );

  // Exhibitor show day starts from owned entries, not ringside class
  // administration (design decision, section 3 of the elderly-UX remediation).
  // Staff accounts — including a secretary who also exhibits — keep the
  // class-first default.
  const isExhibitorOnly = isExhibitorOnlyForAtShow(hasRole);
  const { ownEntryIds, isLoading: ownershipLoading } = useMyAtShowEntries(showId);
  const classesById = useMemo(() => {
    const map = new Map<string, AtShowClassSummary>();
    for (const group of groups) {
      for (const cls of group.classes) {
        map.set(cls.id, { className: cls.class_name, classStatus: cls.class_status });
      }
    }
    return map;
  }, [groups]);
  const { entries: myEntries, isLoading: myEntriesLoading } = useMyAtShowEntryDetails(
    showId,
    ownEntryIds,
    ownershipLoading,
    classesById
  );

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

  const isClassDataStillSyncing =
    groups.length === 0 &&
    areReplicationTablesPendingFirstSync(syncStatus, ['shows', 'trials', 'classes', 'entries']);

  if (isLoading || isClassDataStillSyncing) {
    return <AtShowClassListSkeleton />;
  }

  if (error) {
    return (
      <div className="ringside-root flex flex-col items-center justify-center h-96 gap-3 px-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium text-destructive">Failed to load classes</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <div className="flex w-full max-w-xs flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
          <Button variant="outline" className="min-h-11 px-6" onClick={refresh}>
            Try again
          </Button>
          <BackToRingsideExitButton showId={showId} clubId={clubId} />
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
        onSeeAllClasses={() => setManualView('all')}
      />
    );
  }

  const hasClasses = groupedByTrial.some(g => g.classes.length > 0);
  if (!hasClasses) {
    return (
      <div className="ringside-root flex flex-col items-center justify-center h-96 gap-3 px-4 text-center">
        <p className="text-lg font-medium">No classes</p>
        <p className="text-sm text-muted-foreground">This show has no classes yet.</p>
        <BackToRingsideExitButton showId={showId} clubId={clubId} />
      </div>
    );
  }

  return (
    <div className="ringside-root mx-auto max-w-2xl px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <BackToRingsideExitButton showId={showId} clubId={clubId} />
        {isExhibitorOnly && ownEntryIds.size > 0 && (
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

      {groupedByTrial.map(({ trial, classes }) => {
        if (classes.length === 0) return null;
        const trialNumber = trial.trialNumber ?? trial.trial_number;
        const trialDate = trial.date ?? trial.trial_date;
        const isOpen = !collapsedTrialIds.has(trial.id);
        const trialDateLabel = trialDate ? formatTrialDate(trialDate) : '';
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
                {classes.map(entry => {
                  const status = getFormattedClassStatus(entry);
                  // Smart colour key (folds in dogs-in-ring / completed-count
                  // detection) → badge tier, so the pill glance-distinguishes a
                  // live ring from a finished one. INTENT: in-ring gloved taps
                  // want ~48px rows — hence min-h-12.
                  const statusTier = getClassListStatusTier(
                    getClassStatusColor(entry.class_status, entry)
                  );
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => handleClassClick(entry)}
                        className={cn(
                          'flex min-h-12 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md active:scale-[0.99]',
                          // #923 tokenized the favorite (theme-aware, calm in
                          // dark); keep that and add this PR's 48px tap floor.
                          entry.is_favorite && 'border-primary bg-primary/5'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {entry.is_favorite && (
                              <Star size={15} className="shrink-0 fill-primary text-primary" />
                            )}
                            <span className="truncate font-medium">{entry.class_name}</span>
                          </div>
                          {entry.judge_name && entry.judge_name !== 'No Judge Assigned' && (
                            <div className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
                              <User size={13} className="shrink-0" />
                              {entry.judge_name}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-medium',
                              badgeClass(statusTier)
                            )}
                          >
                            {status.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {entry.completed_count} / {entry.entry_count}
                          </span>
                        </div>
                        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
};

export default AtShowClassListPage;
