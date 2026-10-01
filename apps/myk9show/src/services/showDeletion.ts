import { deleteShow } from '@/services/database/shows/writes';
import { createDatabaseError } from '@/services/database/databaseError';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';

/**
 * Delete a show on the server, unless it only exists on this device.
 *
 * A show created here whose INSERT is still queued is unknown to the server:
 * the delete RPC would answer "Show not found" (which otherwise reads as
 * "already deleted"), and the queued INSERT would later upload and bring the
 * show back. So that case cancels the queued mutations and never calls the
 * server. Every delete path calls this, then `useShowStore.purgeDeletedShow`.
 */
export async function deleteShowRecord(id: string, deletedBy?: string) {
  try {
    if (await replicatedShowsTable.discardPendingLocalCreate(id)) {
      return { data: { id }, error: null, discardedLocalCreate: true };
    }
  } catch (error) {
    return { data: null, error: createDatabaseError(error, 'show', 'soft_delete') };
  }
  return deleteShow(id, deletedBy);
}
