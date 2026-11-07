import type { Entry, EntryStatusChange } from '@myk9/ringside';
import type { CheckInWriter } from '@/services/show-day/checkInStatus';
import { showUndoToast } from '@/lib/undoToast';

/** Statuses `self_checkin_entry` accepts, so an exhibitor's Undo can write them back. */
const SELF_RESTORABLE: ReadonlySet<string> = new Set([
  'no-status',
  'checked-in',
  'conflict',
  'at-gate',
]);

/**
 * After a Pulled is written, offer Undo that writes the prior status back through
 * `restore` (the same handler, so the same write path). The exhibitor writer is
 * refused staff-set statuses by `self_checkin_entry`, so Undo would leave the dog
 * pulled; the replicated (staff) writer can restore any, and gets Undo for all.
 */
export function offerPullUndo(
  previous: Entry | undefined,
  writer: CheckInWriter | undefined,
  restore: (status: EntryStatusChange) => void
): void {
  if (!previous || previous.status === 'pulled') return;
  if (writer === 'self-checkin-rpc' && !SELF_RESTORABLE.has(previous.status as string)) return;
  const priorStatus = previous.status as EntryStatusChange;
  showUndoToast({
    message: `${previous.callName} pulled`,
    onUndo: () => restore(priorStatus),
  });
}
