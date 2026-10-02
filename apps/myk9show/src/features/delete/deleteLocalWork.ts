/**
 * The ONE purge-time guard every declared local store shares (MYK9-922).
 *
 * `deleteRecords` checks the queue for unsaved work before it calls the server,
 * but the server call takes time and another tab can queue an entry create or
 * edit inside it. So the purge asks again at the moment it drops the rows, and
 * asks ATOMICALLY: `deleteRowsIfClean` (packages/replication) re-reads each
 * row's dirty / local-only flags and its pending or failed mutations and deletes
 * the clean rows in ONE IndexedDB transaction, so another tab cannot dirty a row
 * between the check and the delete. A row with local work is kept; normal sync
 * resolves it, and the server's trigger refuses an upload under a deleted
 * parent, which the replication layer drops with a clear message.
 *
 * The Zustand copies are then dropped from exactly the `deleted` set it returns.
 */

/** What a replica table offers the guard (`ReplicatedTable.deleteRowsIfClean`). */
export interface CleanRowDeleter {
  deleteRowsIfClean(ids: Iterable<string>): Promise<{ deleted: string[]; kept: string[] }>;
}

/** Delete the clean rows of `ids` atomically; report which were deleted and which kept. */
export async function purgeCleanRows(
  table: CleanRowDeleter,
  ids: Iterable<string>
): Promise<{ deleted: Set<string>; kept: Set<string> }> {
  const { deleted, kept } = await table.deleteRowsIfClean(ids);
  return { deleted: new Set(deleted), kept: new Set(kept) };
}
