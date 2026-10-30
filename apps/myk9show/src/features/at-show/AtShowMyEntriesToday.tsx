/**
 * AtShowMyEntriesToday — exhibitor-first "Your dogs today" show-day view.
 *
 * Mounted as the default view inside `AtShowClassListPage` for exhibitor-only
 * accounts with owned entries at this show (see
 * `openspec/changes/exhibitor-elderly-ux-remediation`, section 3). Lists the
 * exhibitor's own entries — dog, class, armband, check-in state, and next
 * action — ahead of the full ringside class-administration list.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, WifiOff } from 'lucide-react';
import { RingsideUpButton } from '@myk9/ui';
import type { CheckInStatus } from '@myk9/core';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { cn } from '@/lib/utils';
import { notifications } from '@/lib/notifications';
import { replicatedEntriesTable } from '@/services/replication';
import { useCheckInMutation } from '@/hooks/mutations/useCheckInMutation';
import { useMyEntryQueuePlacesWithFreshness } from '@/hooks/queries/useMyEntryQueuePlaces';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { isAwaitingPlaceInLine, type AtShowEntryDetail } from './myAtShowEntryDetails.helpers';
import { MyEntryRow } from './MyEntryRow';
import { ListViewTabs, type ListView } from '@/components/list-toolkit';
import { SAVED_INFO_NOTICE } from './myEntriesTodayCopy';
import {
  filterByDog,
  orderMyEntriesToday,
  resolveDogSelection,
  summarizeDogs,
} from './orderMyEntriesToday';
import { detectPlaceRingConflicts } from './placeRingConflicts';
import { useNotificationStore } from '@/store/notificationStore';

/** Reserved id for the unfiltered view; a dog key is a dog id or call name. */
const ALL_DOGS_VIEW = '__all-dogs__';

export interface AtShowMyEntriesTodayProps {
  showId: string;
  showName: string;
  /** Pre-formatted date range (replica data); null renders no date line. */
  showDateLabel?: string | null;
  venue?: string | null;
  entries: AtShowEntryDetail[];
  isLoading: boolean;
  /** From `useMyAtShowEntryDetails` — changes only when a fresh fetch lands. */
  dataUpdatedAt: number;
  /** The device could not read this show's entries (MYK9-774). */
  loadFailed: boolean;
  onRetry: () => void;
  onSeeAllClasses: () => void;
}

function AtShowMyEntriesTodaySkeleton() {
  return (
    <div role="status" aria-label="Loading your dogs today" className="space-y-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
        >
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export const AtShowMyEntriesToday: React.FC<AtShowMyEntriesTodayProps> = ({
  showId,
  showName,
  showDateLabel = null,
  venue = null,
  entries,
  isLoading,
  dataUpdatedAt,
  loadFailed,
  onRetry,
  onSeeAllClasses,
}) => {
  const navigate = useNavigate();
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
  const checkInMutation = useCheckInMutation({ writer: 'self-checkin-rpc' });

  // The self-checkin RPC writes only to the remote DB (no replication write —
  // "online-only by design"), so a tap needs a local optimistic override for
  // instant feedback — without it, the row would show no visible change
  // until the local table is next synced from the server, exactly the kind
  // of unconfirmed action this view exists to avoid. Cleared on error
  // (rollback), or once a fresh fetch actually lands (below) —
  // `useMyAtShowEntryDetails` subscribes directly to `replicatedEntriesTable`,
  // so this reconciles against any write to that table regardless of which
  // surface or mutation path made it (our own tap once replication syncs it
  // down, or a status change made from another surface, e.g. a secretary
  // reverting a check-in).
  const [statusOverrides, setStatusOverrides] = useState<Record<string, CheckInStatus>>({});
  const lastReconciledAt = useRef(dataUpdatedAt);
  useEffect(() => {
    if (dataUpdatedAt === lastReconciledAt.current) return;
    lastReconciledAt.current = dataUpdatedAt;
    setStatusOverrides({});
  }, [dataUpdatedAt]);

  const displayEntries = useMemo(
    () =>
      entries.map(detail =>
        statusOverrides[detail.entryId]
          ? { ...detail, checkInStatus: statusOverrides[detail.entryId] as CheckInStatus }
          : detail
      ),
    [entries, statusOverrides]
  );

  // Place in line is the server's count (an exhibitor holds only their own
  // rows); offline it stays "Waiting" rather than a stale number (MYK9-992).
  const awaitingIds = useMemo(
    () => displayEntries.filter(isAwaitingPlaceInLine).map(detail => detail.entryId),
    [displayEntries]
  );
  const { places, updatedAt: placesUpdatedAt } = useMyEntryQueuePlacesWithFreshness(awaitingIds);
  const isOnline = useIsOnline();

  // One time-ordered list across every dog; the filter narrows it. Counts come
  // from the whole day so they never shift under the filter (MYK9-1046).
  const orderedEntries = useMemo(
    () => orderMyEntriesToday(displayEntries, places),
    [displayEntries, places]
  );
  const dogs = useMemo(() => summarizeDogs(displayEntries), [displayEntries]);
  const [selectedDog, setSelectedDog] = useState<string | null>(null);
  const activeDog = resolveDogSelection(selectedDog, dogs);
  // Counts cover the whole day, so they never shift under the selection.
  const dogViews = useMemo<ListView[]>(
    () => [
      { id: ALL_DOGS_VIEW, label: 'All dogs', count: displayEntries.length },
      ...dogs.map(dog => ({ id: dog.dogKey, label: dog.dogName, count: dog.count })),
    ],
    [dogs, displayEntries.length]
  );
  const visibleEntries = useMemo(
    () => filterByDog(orderedEntries, activeDog),
    [orderedEntries, activeDog]
  );
  // The notice follows the server place the row already shows: this account
  // holds only its own entries, so counting dogs ahead locally would call a
  // dog with 30 ahead "next". No confirmed places, no notice.
  const leadDogs = useNotificationStore(s => s.preferences.leadDogs);
  const conflicts = useMemo(
    () =>
      detectPlaceRingConflicts(
        displayEntries,
        placesUpdatedAt === null ? undefined : places,
        leadDogs
      ),
    [displayEntries, places, placesUpdatedAt, leadDogs]
  );

  const handleOpenClass = useCallback(
    (classId: string) => {
      navigate(`/at-show/${showId}/class/${classId}`);
    },
    [navigate, showId]
  );

  const handleCheckIn = useCallback(
    async (detail: AtShowEntryDetail) => {
      setPendingEntryId(detail.entryId);
      setStatusOverrides(prev => ({ ...prev, [detail.entryId]: 'checked-in' }));
      try {
        await checkInMutation.mutateAsync({
          entryId: detail.entryId,
          newStatus: 'checked-in',
          classId: detail.classId ?? undefined,
        });
        // The self-checkin RPC writes only to the remote DB — nothing pulls
        // that write back into replicatedEntriesTable (the app-wide
        // replication provider syncs `entries` with an empty show scope, a
        // permanent no-op). Pull this show's rows explicitly so the
        // subscription above actually has real, confirmed data to reconcile
        // the optimistic override against, instead of the override just
        // persisting unconfirmed for the rest of the session.
        void replicatedEntriesTable.sync(showId).catch(() => {});
      } catch {
        setStatusOverrides(prev => {
          const next = { ...prev };
          delete next[detail.entryId];
          return next;
        });
        notifications.error('Check-in failed', {
          description: 'Please try again, or ask the secretary to check you in.',
        });
      } finally {
        setPendingEntryId(null);
      }
    },
    [checkInMutation, showId]
  );

  return (
    <div
      className="ringside-root mx-auto max-w-2xl px-4 py-4"
      data-testid="at-show-my-entries-today"
    >
      {/* This page is mounted inside the chromeless ringside surface (no app
          sidebar), so — like `RingsideHome`'s own "Back to dashboard" link —
          it needs its own way out. `/` resolves per-role via `HomeRedirect`,
          landing an exhibitor-only account on `/exhibitor/entries` (My
          Shows), never back into this same show (MYK9-800 walk finding #3). */}
      <RingsideUpButton label="Dashboard" className="mb-2" onClick={() => navigate('/')} />
      {(showName || showDateLabel || venue) && (
        <div className="mb-3 text-center" data-testid="at-show-identity">
          {showName && <p className="text-base font-semibold">{showName}</p>}
          {showDateLabel && <p className="text-sm text-muted-foreground">{showDateLabel}</p>}
          {venue && <p className="text-sm text-muted-foreground">{venue}</p>}
        </div>
      )}
      <h1 className="mb-1 text-center text-lg font-semibold">Your dogs today</h1>

      {isLoading ? (
        <AtShowMyEntriesTodaySkeleton />
      ) : loadFailed && displayEntries.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center"
          role="alert"
        >
          <p className="text-sm text-muted-foreground">
            We couldn't read your entries on this device.
          </p>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : displayEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Your entries for this show haven't loaded yet, or the running order isn't posted.
          </p>
        </div>
      ) : (
        <>
          {!isOnline && (
            <div
              className="mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground"
              role="status"
            >
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{SAVED_INFO_NOTICE}</p>
            </div>
          )}
          {isOnline && loadFailed && (
            // The last list read is still shown, since stale is better than
            // nothing at the ring, but it is marked as not current (MYK9-774).
            <div
              className="mt-3 flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              role="status"
            >
              <p className="text-sm text-muted-foreground">
                Couldn't refresh your entries on this device. This may be out of date.
              </p>
              <Button variant="outline" onClick={onRetry}>
                Try again
              </Button>
            </div>
          )}
          {dogs.length >= 2 && (
            <ListViewTabs
              className="mt-3"
              label="which dog"
              views={dogViews}
              activeId={activeDog ?? ALL_DOGS_VIEW}
              onSelect={id => setSelectedDog(id === ALL_DOGS_VIEW ? null : id)}
            />
          )}
          <ul className="mt-3 space-y-2">
            {visibleEntries.map(detail => (
              <MyEntryRow
                key={detail.entryId}
                detail={detail}
                place={places.get(detail.entryId)}
                placeUpdatedAt={placesUpdatedAt}
                conflictLabel={conflicts.get(detail.entryId)}
                onOpenClass={handleOpenClass}
                onCheckIn={handleCheckIn}
                checkInPending={pendingEntryId === detail.entryId}
              />
            ))}
          </ul>
        </>
      )}

      <Button
        type="button"
        variant="outline"
        className={cn('mt-4 min-h-11 w-full gap-2')}
        onClick={onSeeAllClasses}
      >
        <ListChecks className="h-4 w-4" aria-hidden />
        See all classes
      </Button>
    </div>
  );
};

export default AtShowMyEntriesToday;
