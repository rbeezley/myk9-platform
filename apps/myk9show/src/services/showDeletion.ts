import { deleteShow } from '@/services/database/shows/writes';
import { createDatabaseError } from '@/services/database/databaseError';
import { SHOW_STILL_SAVING } from '@/services/database/shows/deleteOutcome';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';

/**
 * The one server-delete step every delete path calls (then
 * `useShowStore.purgeDeletedShow`).
 *
 * A show with unsynced work (created here, or any queued mutation) may not be
 * on the server yet, or may be committed with its response lost, so the delete
 * RPC's "Show not found" would be ambiguous and a later upload could bring the
 * show back. Such a show is refused without calling the server or touching the
 * queue; the caller tells the user it is still saving. A queue that cannot be
 * read is an error, never a pass.
 */
export async function deleteShowRecord(id: string, deletedBy?: string) {
  try {
    if (await replicatedShowsTable.hasUnsyncedWork(id)) {
      const error = Object.assign(createDatabaseError(new Error('Show is still saving'), 'show'), {
        code: SHOW_STILL_SAVING,
      });
      return { data: null, error };
    }
  } catch (error) {
    return { data: null, error: createDatabaseError(error, 'show', 'soft_delete') };
  }
  return deleteShow(id, deletedBy);
}
