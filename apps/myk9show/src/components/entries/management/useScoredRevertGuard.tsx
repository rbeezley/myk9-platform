import { useRef, useState, type ReactNode } from 'react';
import { getStatusDescriptor } from '@/components/status';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EntryStatus } from '@/types/show-registration-types';

/** Pre-scoring statuses — reverting a Completed (scored) entry to one of
 * these removes it from results until re-scored, so it requires confirmation
 * (design D3, spec requirement "Reverting a scored entry requires
 * confirmation"). Every surface that can change an entry's status —
 * `EntryStatusPopover` and `EntryRowActionMenu` alike — must route through
 * this guard rather than re-implementing the check. */
const PRE_SCORING_STATUSES: ReadonlySet<EntryStatus> = new Set([
  EntryStatus.ACCEPTED,
  EntryStatus.PENDING,
  EntryStatus.MISSING_INFO,
]);

export function requiresScoredRevertConfirmation(
  currentStatus: EntryStatus,
  targetStatus: EntryStatus
): boolean {
  return currentStatus === EntryStatus.COMPLETED && PRE_SCORING_STATUSES.has(targetStatus);
}

type StatusChangeHandler = (
  entryId: string,
  status: EntryStatus
) => void | boolean | Promise<boolean | void>;

interface PendingRevert {
  entryId: string;
  status: EntryStatus;
  resolve: (value: boolean | void) => void;
}

export interface ScoredRevertGuard {
  /** Same call shape as the raw status-change handler — drop this in place
   * of `onStatusChange` wherever entry status changes originate. Transitions
   * that don't need confirmation pass straight through. */
  guardedOnStatusChange: StatusChangeHandler;
  /** Render alongside the calling component's own JSX (mounts the shared
   * confirmation AlertDialog). */
  dialog: ReactNode;
}

/**
 * Shared revert-confirmation guard for the entry cockpit's status-change
 * surfaces. One implementation, two consumers (`EntryStatusPopover`,
 * `EntryRowActionMenu`) — do not re-implement the dialog/latch per surface.
 */
export function useScoredRevertGuard(
  currentStatus: EntryStatus,
  onStatusChange: StatusChangeHandler | undefined
): ScoredRevertGuard {
  const [pending, setPending] = useState<PendingRevert | null>(null);
  // Per-mount latch: blocks a second confirm activation from double-submitting
  // while the first is still in flight (isPending state lags one render).
  const confirmInFlightRef = useRef(false);

  const guardedOnStatusChange: StatusChangeHandler = (entryId, status) => {
    if (!onStatusChange || !requiresScoredRevertConfirmation(currentStatus, status)) {
      return onStatusChange?.(entryId, status);
    }
    return new Promise<boolean | void>(resolve => {
      setPending({ entryId, status, resolve });
    });
  };

  const handleConfirm = () => {
    if (confirmInFlightRef.current || !pending) return;
    confirmInFlightRef.current = true;
    const { entryId, status, resolve } = pending;
    setPending(null);
    Promise.resolve(onStatusChange?.(entryId, status))
      .then(resolve)
      .finally(() => {
        confirmInFlightRef.current = false;
      });
  };

  const handleCancel = () => {
    // Cancel is a no-op, not a failure — resolve as "nothing happened" so
    // callers awaiting the guarded handler don't surface an error state.
    pending?.resolve(undefined);
    setPending(null);
  };

  const targetLabel = pending ? getStatusDescriptor('entry', pending.status).label : '';

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={next => !next && handleCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This entry has a recorded result</AlertDialogTitle>
          <AlertDialogDescription>
            Changing it to {targetLabel} removes it from results until re-scored.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Change status</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { guardedOnStatusChange, dialog };
}
