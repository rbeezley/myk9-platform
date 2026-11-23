/**
 * The two answers to the "changed somewhere else at the same time" notice (MYK9-1993).
 *
 * Keep my change: the conflict held the write out of every upload pass, and nothing else was
 * due to send it before the next poll (3 to 5 minutes while a show channel is live), so the
 * phone and the server disagreed for minutes. It is sent now. If the server refuses it, the
 * queue's own "could not be sent" notice says why and offers Try again and Discard; Discard
 * puts the row back to the server's copy on the tables that revert on discard.
 *
 * Keep the other change: the queued write is dropped BEFORE the row is released from the
 * conflict. In the other order an upload pass in between would send the old value and
 * overwrite the change the person just chose.
 */
import type { MutationManager, ReplicatedTable } from '@myk9/replication';

export type ConflictChoiceTable = Pick<
  ReplicatedTable<{ id: string }>,
  'resolveReplicationConflict'
>;
export type ConflictChoiceQueue = Pick<
  MutationManager,
  'sendRowNow' | 'discardPendingMutationsForRow'
>;

export async function keepMyChange(
  table: ConflictChoiceTable,
  queue: ConflictChoiceQueue,
  tableName: string,
  rowId: string
): Promise<void> {
  if (!(await table.resolveReplicationConflict(rowId, 'keep-local'))) return;
  await queue.sendRowNow(tableName, rowId);
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
