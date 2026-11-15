/**
 * The two answers to the "changed somewhere else at the same time" notice (MYK9-1993).
 *
 * Keep my change: the conflict held the write out of every upload pass, and nothing else was
 * due to send it before the next poll (3 to 5 minutes while a show channel is live), so the
 * phone and the server disagreed for minutes. It is sent now. If the server refuses it for
 * good (not authorized, or invalid), and the table's Discard puts the row back to the server's
 * copy (revertsOnDiscard), the write is discarded and the caller says so in plain words.
 * Anything else, a write out of retries or a table without that revert, keeps the queue's own
 * "could not be sent" notice with Try again and Discard, so nothing is lost or left showing a
 * refused value without a way out.
 *
 * Keep the other change: the queued write is dropped BEFORE the row is released from the
 * conflict. In the other order an upload pass in between would send the old value and
 * overwrite the change the person just chose.
 */
import type { MutationManager, ReplicatedTable } from '@myk9/replication';
import { formatSyncFailureReason } from './replicationSyncFormatters';

export type ConflictChoiceTable = Pick<
  ReplicatedTable<{ id: string }>,
  'resolveReplicationConflict' | 'discardRestoresServerCopy'
>;

/** Refusals retrying cannot change. A `max-retries` failure may be a passing outage. */
const FINAL_REFUSALS: ReadonlySet<string> = new Set(['authorization', 'permanent']);
export type ConflictChoiceQueue = Pick<
  MutationManager,
  'sendRowNow' | 'getFailedMutations' | 'discardFailedMutation' | 'discardPendingMutationsForRow'
>;

export const KEPT_CHANGE_NOT_SENT_TITLE = 'Your change could not be sent';
export const KEPT_CHANGE_SHOWS_OTHER = 'This now shows the other change.';

export type KeepMyChangeOutcome =
  /** Sent, still queued, or refused in a way the queue's own notice handles. */
  | { kind: 'kept' }
  /**
   * The server refused it; the row shows the server's copy again. `reason` is the
   * formatSyncFailureReason line, shown through SyncFailureReason like every refusal.
   */
  | { kind: 'refused'; mutationIds: string[]; reason?: string };

export async function keepMyChange(
  table: ConflictChoiceTable,
  queue: ConflictChoiceQueue,
  tableName: string,
  rowId: string
): Promise<KeepMyChangeOutcome> {
  if (!(await table.resolveReplicationConflict(rowId, 'keep-local'))) return { kind: 'kept' };
  const sentAt = Date.now();
  await queue.sendRowNow(tableName, rowId);

  const refused = (await queue.getFailedMutations()).filter(
    mutation =>
      mutation.tableName === tableName &&
      String(mutation.rowId) === rowId &&
      (mutation.failedAt ?? 0) >= sentAt
  );
  if (refused.length === 0) return { kind: 'kept' };
  const final = refused.every(mutation => FINAL_REFUSALS.has(mutation.failureKind ?? ''));
  if (!final || !table.discardRestoresServerCopy()) return { kind: 'kept' };

  await Promise.allSettled(refused.map(mutation => queue.discardFailedMutation(mutation.id)));
  const reason = formatSyncFailureReason({
    count: refused.length,
    mutations: refused,
    message: '',
  });
  return {
    kind: 'refused',
    mutationIds: refused.map(mutation => mutation.id),
    ...(reason && { reason: /[.!?…]$/.test(reason) ? reason : `${reason}.` }),
  };
}

export async function keepOtherChange(
  table: ConflictChoiceTable,
  queue: ConflictChoiceQueue,
  tableName: string,
  rowId: string
): Promise<void> {
  await queue.discardPendingMutationsForRow(tableName, rowId);
  await table.resolveReplicationConflict(rowId, 'take-remote');
}
