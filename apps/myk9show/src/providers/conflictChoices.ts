/**
 * The two answers to the "changed somewhere else at the same time" notice (MYK9-1993).
 *
 * Keep my change: the conflict held the write out of every upload pass, and nothing else was
 * due to send it before the next poll (3 to 5 minutes while a show channel is live), so the
 * phone and the server disagreed for minutes. It is sent now. If the server refuses it, the
 * write is discarded, which puts the row back to the server's copy (revertsOnDiscard), and
 * the caller says so in plain words.
 *
 * Keep the other change: the queued write is dropped BEFORE the row is released from the
 * conflict. In the other order an upload pass in between would send the old value and
 * overwrite the change the person just chose.
 */
import type { MutationManager, ReplicatedTable } from '@myk9/replication';
import { formatSyncFailureReason } from './replicationSyncFormatters';

export type ConflictChoiceTable = Pick<
  ReplicatedTable<{ id: string }>,
  'resolveReplicationConflict'
>;
export type ConflictChoiceQueue = Pick<
  MutationManager,
  'sendRowNow' | 'getFailedMutations' | 'discardFailedMutation' | 'discardPendingMutationsForRow'
>;

export const KEPT_CHANGE_NOT_SENT_TITLE = 'Your change could not be sent';
const SHOWS_OTHER_CHANGE = 'This now shows the other change.';

export type KeepMyChangeOutcome =
  /** Sent, or still queued (offline, or a retry the queue owns). */
  | { kind: 'kept' }
  /** The server refused it; the row shows the server's copy again. */
  | { kind: 'refused'; mutationIds: string[]; description: string };

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

  await Promise.allSettled(refused.map(mutation => queue.discardFailedMutation(mutation.id)));
  const reason = formatSyncFailureReason({
    count: refused.length,
    mutations: refused,
    message: '',
  });
  const sentence = reason && !/[.!?…]$/.test(reason) ? `${reason}.` : reason;
  return {
    kind: 'refused',
    mutationIds: refused.map(mutation => mutation.id),
    description: sentence ? `${sentence} ${SHOWS_OTHER_CHANGE}` : SHOWS_OTHER_CHANGE,
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
