import type { Entry, EntryStatusChange } from '@myk9/ringside';
import type { CheckInWriter } from '@/services/show-day/checkInStatus';
import { showUndoToast } from '@/lib/undoToast';

/** Statuses `self_checkin_entry` accepts, so an exhibitor's Undo can write them back. */
export const SELF_RESTORABLE: ReadonlySet<string> = new Set([
  'no-status',
  'checked-in',
  'conflict',
  'at-gate',
]);

/** Undo is offered unless an exhibitor's write would be refused restoring a staff-set status. */
export function canUndoPull(writer: CheckInWriter | undefined, previousStatus: string): boolean {
  return writer !== 'self-checkin-rpc' || SELF_RESTORABLE.has(previousStatus);
}

/** "Container Novice A": the class name, with the section added only when the name lacks it. */
export function pulledFromLabel(entry: Entry): string {
  const name = (entry.className ?? '').trim();
  const section = (entry.section ?? '').trim();
  if (!section || /^[A-Za-z]$/.test(section) === false) return name;
  return name.endsWith(` ${section}`) ? name : `${name} ${section}`.trim();
}

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
  if (!canUndoPull(writer, previous.status as string)) return;
  const from = pulledFromLabel(previous);
  const priorStatus = previous.status as EntryStatusChange;
  showUndoToast({
    message: from ? `${previous.callName} pulled from ${from}` : `${previous.callName} pulled`,
    description: 'Moved to Pulled / not running, at the bottom of the list.',
    onUndo: () => restore(priorStatus),
  });
}
