/**
 * Secretary entry-status undo (design.md decision D6).
 *
 * Undo dispatches the INVERSE transition through the same replicated seam the
 * forward change uses (`changeSecretaryEntryStatus` → `updateSecretaryLifecycleStatus`)
 * so the DB trigger records the revert as a new `entry_status_history` row.
 * `restore_entry_status` is deliberately NOT used — it performs a direct Supabase
 * write that bypasses replication and would break offline-first.
 *
 * Guards:
 *  - Supersession: before reverting, the entry's freshest LOCAL status must still
 *    equal the status our action produced. If another actor (or a synced-down
 *    change) moved it elsewhere, we abort with honest messaging instead of
 *    stomping their change.
 *  - Offline: the replication mutation queue is per-entity FIFO (monotonic
 *    sequence — see packages/replication MutationQueueStore / mutation-ordering),
 *    so enqueueing the inverse while offline preserves ordering. We surface a
 *    "queued — will sync" outcome rather than claiming an immediate revert.
 */
import type { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { executeStatusChange, type StatusChangeAdapters } from './management-actions';

export type StatusUndoOutcome = 'reverted' | 'queued' | 'superseded' | 'missing' | 'failed';

export interface StatusUndoAdapters {
  /** Freshest local snapshot of an entry, used for the supersession check. */
  getCurrentEntry: (entryId: string) => EntryManagementEntry | undefined;
  /** Online detection at dispatch time — drives the "queued" vs "reverted" message. */
  isOnline: () => boolean;
  changeSecretaryStatus: StatusChangeAdapters['changeSecretaryStatus'];
  patchEntries: StatusChangeAdapters['patchEntries'];
  userId?: string | undefined;
}

export interface StatusUndoParams {
  entryId: string;
  /** Status to revert TO (the entry's status captured before the forward change). */
  priorStatus: EntryStatus;
  /** Status our forward action produced — the supersession check compares against this. */
  producedStatus: EntryStatus;
}

export async function executeStatusUndo(
  params: StatusUndoParams,
  adapters: StatusUndoAdapters
): Promise<StatusUndoOutcome> {
  const entry = adapters.getCurrentEntry(params.entryId);
  if (!entry) return 'missing';
  // Supersession: only undo if the entry is still in the state our action left it.
  if (entry.entryStatus !== params.producedStatus) return 'superseded';

  const online = adapters.isOnline();
  const reverted = await executeStatusChange(
    {
      entryId: params.entryId,
      newStatus: params.priorStatus,
      entry,
      ...(adapters.userId ? { userId: adapters.userId } : {}),
    },
    { changeSecretaryStatus: adapters.changeSecretaryStatus, patchEntries: adapters.patchEntries }
  );
  if (!reverted) return 'failed';
  return online ? 'reverted' : 'queued';
}

export interface BulkStatusUndoItem {
  entryId: string;
  priorStatus: EntryStatus;
}

export interface BulkStatusUndoResult {
  reverted: number;
  queued: number;
  superseded: number;
  failed: number;
}

/**
 * Revert a succeeded bulk subset item-by-item, each with its own supersession
 * check. Sequential (not parallel) so per-entity queue ordering is preserved and
 * one item's supersession never affects another's.
 */
export async function executeBulkStatusUndo(
  items: BulkStatusUndoItem[],
  producedStatus: EntryStatus,
  adapters: StatusUndoAdapters
): Promise<BulkStatusUndoResult> {
  const result: BulkStatusUndoResult = { reverted: 0, queued: 0, superseded: 0, failed: 0 };
  for (const item of items) {
    // Sequential (awaited in-loop) preserves per-entity FIFO queue ordering.
    const outcome = await executeStatusUndo(
      { entryId: item.entryId, priorStatus: item.priorStatus, producedStatus },
      adapters
    );
    if (outcome === 'reverted') result.reverted++;
    else if (outcome === 'queued') result.queued++;
    else if (outcome === 'superseded') result.superseded++;
    else result.failed++; // 'missing' | 'failed'
  }
  return result;
}

export type UndoToastKind = 'success' | 'info' | 'error';

export interface UndoToastMessage {
  kind: UndoToastKind;
  message: string;
}

export function buildStatusUndoToastMessage(outcome: StatusUndoOutcome): UndoToastMessage {
  switch (outcome) {
    case 'reverted':
      return { kind: 'success', message: 'Change undone' };
    case 'queued':
      return { kind: 'info', message: 'Undo queued — will sync when back online' };
    case 'superseded':
      return { kind: 'error', message: 'Changed by someone else — not undone' };
    case 'missing':
      return { kind: 'error', message: 'Entry no longer available — not undone' };
    case 'failed':
    default:
      return { kind: 'error', message: 'Could not undo the change' };
  }
}

export function buildBulkStatusUndoToastMessage(result: BulkStatusUndoResult): UndoToastMessage {
  const done = result.reverted + result.queued;
  const problems = result.superseded + result.failed;

  if (problems === 0) {
    if (result.queued > 0 && result.reverted === 0) {
      return { kind: 'info', message: `Undo queued for ${result.queued} — will sync when online` };
    }
    return { kind: 'success', message: `Undid ${done} ${done === 1 ? 'change' : 'changes'}` };
  }

  if (done === 0) {
    if (result.superseded > 0 && result.failed === 0) {
      return { kind: 'error', message: 'Changed by someone else — not undone' };
    }
    return { kind: 'error', message: 'Could not undo the changes' };
  }

  const parts: string[] = [`Undid ${done}`];
  if (result.superseded > 0) parts.push(`${result.superseded} changed by someone else`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  return { kind: 'error', message: parts.join(', ') };
}
