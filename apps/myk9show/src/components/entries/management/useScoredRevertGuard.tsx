import { useRef, useState, type ReactNode } from 'react';
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
import { getEntryStatusStateLabel } from './reviewStateLabels';

/** Pre-scoring statuses — reverting a scored entry to one of these removes
 * it from results until re-scored, so it requires confirmation (design D3,
 * spec requirement "Reverting a scored entry requires confirmation"). Every
 * surface that can change an entry's status — `EntryStatusPopover` and
 * `EntryRowActionMenu` alike — must route through this guard rather than
 * re-implementing the check. */
const PRE_SCORING_STATUSES: ReadonlySet<EntryStatus> = new Set([
  EntryStatus.ACCEPTED,
  EntryStatus.PENDING,
  EntryStatus.MISSING_INFO,
]);

/** Scoring facts an entry may carry independently of its lifecycle status —
 * `entries.is_scored` / `entries.result_status` are set by ringside scoring
 * and don't always flip `entry_status` to COMPLETED, so a scored entry can
 * still read as ACCEPTED. */
export interface ScoredEntryFacts {
  isScored?: boolean | null | undefined;
  resultStatus?: string | null | undefined;
}

/** `entries.result_status` defaults to 'pending' before any scoring happens,
 * so only a value beyond these placeholders indicates a recorded result. */
const UNSCORED_RESULT_STATUSES: ReadonlySet<string> = new Set(['', 'pending']);

function isEntryScored(currentStatus: EntryStatus, facts: ScoredEntryFacts | undefined): boolean {
  if (currentStatus === EntryStatus.COMPLETED) return true;
  if (facts?.isScored) return true;
  if (facts?.resultStatus != null && !UNSCORED_RESULT_STATUSES.has(facts.resultStatus)) return true;
  return false;
}

export function requiresScoredRevertConfirmation(
  currentStatus: EntryStatus,
  targetStatus: EntryStatus,
  facts?: ScoredEntryFacts
): boolean {
  return isEntryScored(currentStatus, facts) && PRE_SCORING_STATUSES.has(targetStatus);
}

/** Distinct from every real status-change outcome (void/boolean/Promise) so
 * callers can tell "the confirmation dialog was dismissed" apart from "the
 * status change succeeded" — a canceled dialog must never trigger the
 * success (queued-offline) or failure UI. */
export const REVERT_CANCELLED = Symbol('scored-revert-cancelled');

type GuardedStatusChangeResult = boolean | void | typeof REVERT_CANCELLED;

type RawStatusChangeHandler = (
  entryId: string,
  status: EntryStatus
) => void | boolean | Promise<boolean | void>;

type GuardedStatusChangeHandler = (
  entryId: string,
  status: EntryStatus
) => GuardedStatusChangeResult | Promise<GuardedStatusChangeResult>;

interface PendingRevert {
  entryId: string;
  status: EntryStatus;
  resolve: (value: GuardedStatusChangeResult) => void;
}

export interface ScoredRevertGuard {
  /** Same call shape as the raw status-change handler, widened to also
   * resolve `REVERT_CANCELLED` — drop this in place of `onStatusChange`
   * wherever entry status changes originate. Transitions that don't need
   * confirmation pass straight through. */
  guardedOnStatusChange: GuardedStatusChangeHandler;
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
  facts: ScoredEntryFacts | undefined,
  onStatusChange: RawStatusChangeHandler | undefined
): ScoredRevertGuard {
  const [pending, setPending] = useState<PendingRevert | null>(null);
  // Per-mount latch: blocks a second confirm activation from double-submitting
  // while the first is still in flight (isPending state lags one render).
  const confirmInFlightRef = useRef(false);

  const guardedOnStatusChange: GuardedStatusChangeHandler = (entryId, status) => {
    if (!onStatusChange || !requiresScoredRevertConfirmation(currentStatus, status, facts)) {
      return onStatusChange?.(entryId, status);
    }
    return new Promise<GuardedStatusChangeResult>(resolve => {
      setPending({ entryId, status, resolve });
    });
  };

  const handleConfirm = () => {
    if (confirmInFlightRef.current || !pending) return;
    confirmInFlightRef.current = true;
    const { entryId, status, resolve } = pending;
    setPending(null);
    // Settle on every outcome — including a rejection or a synchronous
    // throw from the handler — so the caller's `await` never hangs and the
    // existing failure UI (retry) still runs.
    void (async () => {
      try {
        const result = await onStatusChange?.(entryId, status);
        resolve(result);
      } catch {
        resolve(false);
      } finally {
        confirmInFlightRef.current = false;
      }
    })();
  };

  const handleCancel = () => {
    // AlertDialogAction is itself a Close — clicking "Change status" both
    // runs handleConfirm AND (synchronously, same click) triggers this
    // dialog's onOpenChange(false), which would otherwise race handleCancel's
    // synchronous resolve() against handleConfirm's later async resolve() and
    // always win (Promise settles on the first resolve call). Skip when a
    // confirm just fired so a confirmed revert is never re-read as canceled.
    if (confirmInFlightRef.current) return;
    // Cancel is a no-op, not a failure or a success — resolve with the
    // cancellation sentinel so callers can special-case "nothing happened"
    // instead of reading it as a queued-offline success.
    pending?.resolve(REVERT_CANCELLED);
    setPending(null);
  };

  const targetLabel = pending ? getEntryStatusStateLabel(pending.status) : '';

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
