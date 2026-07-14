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
import { CheckCircle2, ChevronRight, Clock3, ListChecks } from 'lucide-react';
import type { CheckInStatus } from '@myk9/core';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { cn } from '@/lib/utils';
import { notifications } from '@/lib/notifications';
import { replicatedEntriesTable } from '@/services/replication';
import { useCheckInMutation } from '@/hooks/mutations/useCheckInMutation';
import { EXHIBITOR_STATUS_LABELS, getCheckInStatusConfig } from '@/types/check-in-types';
import { deriveAtShowNextAction, type AtShowEntryDetail } from './myAtShowEntryDetails.helpers';

export interface AtShowMyEntriesTodayProps {
  showId: string;
  entries: AtShowEntryDetail[];
  isLoading: boolean;
  /** From `useMyAtShowEntryDetails` — changes only when a fresh fetch lands. */
  dataUpdatedAt: number;
  onSeeAllClasses: () => void;
}

// Plain-language override where one exists (no-status/checked-in/conflict/
// pulled); falls back to the staff-grade label — same fallback order
// CheckInStatusDialog uses — so a status without a plain override (at-gate,
// come-to-gate, in-ring, completed) still reads correctly instead of always
// showing "not checked in".
function statusLabel(detail: AtShowEntryDetail): string {
  return (
    EXHIBITOR_STATUS_LABELS[detail.checkInStatus] ??
    getCheckInStatusConfig(detail.checkInStatus).label
  );
}

function EntryRow({
  detail,
  onOpenClass,
  onCheckIn,
  checkInPending,
}: {
  detail: AtShowEntryDetail;
  onOpenClass: (classId: string) => void;
  onCheckIn: (detail: AtShowEntryDetail) => void;
  checkInPending: boolean;
}) {
  const action = deriveAtShowNextAction(detail);

  return (
    <li
      className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
      data-testid={`at-show-my-entry-${detail.entryId}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{detail.dogName}</span>
          {detail.armband && (
            <span className="shrink-0 rounded-full bg-[color:var(--chip-stone-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--chip-stone-fg)]">
              #{detail.armband}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-sm text-muted-foreground">
          {detail.className ?? 'Running order not posted yet'}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{statusLabel(detail)}</div>
      </div>

      {action.kind === 'check-in' && (
        <Button
          type="button"
          size="sm"
          className="min-h-11 shrink-0 gap-1.5"
          disabled={checkInPending}
          onClick={() => onCheckIn(detail)}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Check in
        </Button>
      )}
      {action.kind === 'wait-running-order' && (
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
          <Clock3 className="h-4 w-4" aria-hidden />
          Not posted yet
        </span>
      )}
      {(action.kind === 'view-class' || action.kind === 'scored') && detail.classId && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 shrink-0 gap-1"
          onClick={() => detail.classId && onOpenClass(detail.classId)}
        >
          View class
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      )}
    </li>
  );
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
  entries,
  isLoading,
  dataUpdatedAt,
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
      <h1 className="mb-1 text-center text-lg font-semibold">Your dogs today</h1>

      {isLoading ? (
        <AtShowMyEntriesTodaySkeleton />
      ) : displayEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Your entries for this show haven't loaded yet, or the running order isn't posted.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {displayEntries.map(detail => (
            <EntryRow
              key={detail.entryId}
              detail={detail}
              onOpenClass={handleOpenClass}
              onCheckIn={handleCheckIn}
              checkInPending={pendingEntryId === detail.entryId}
            />
          ))}
        </ul>
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
