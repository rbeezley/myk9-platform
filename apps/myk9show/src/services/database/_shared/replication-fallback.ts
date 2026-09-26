import { logQuery, createDatabaseError } from '../supabaseClient';

/** Shown when the replica is unreadable and a local write may not have uploaded. */
export const UNSYNCED_UNREADABLE_MESSAGE =
  "This device couldn't read its saved data and has changes that haven't synced yet. Try again once it syncs.";

/** The device could not read its replica (ReplicatedTable.getAllOrThrow, rowsOrThrow). */
export function isReplicaReadError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ReplicaReadError';
}

/**
 * Tries replicationFn first; on failure falls back to postgrestFn.
 * Handles timing, logging, and error wrapping. Throws DatabaseError if both fail.
 *
 * MYK9-774: when replicationFn failed because the device could not read its
 * replica, the server list would show any write this device has not uploaded
 * as undone. The fallback then first asks the upload queue, and throws instead
 * of serving server rows while such a write exists or cannot be ruled out.
 */
export async function withReplicationFallback<T>(
  replicationFn: () => Promise<T>,
  postgrestFn: () => Promise<T>,
  table: string,
  operation: string
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await replicationFn();
    logQuery(table, operation, Date.now() - startTime);
    return result;
  } catch (replicationError) {
    if (isReplicaReadError(replicationError)) {
      // Loaded on this path only: the queue module pulls in the session client.
      const { hasPendingLocalWritesOrUnknown } = await import('./pendingWrites');
      if (await hasPendingLocalWritesOrUnknown()) {
        const dbError = createDatabaseError(
          new Error(UNSYNCED_UNREADABLE_MESSAGE),
          table,
          operation
        );
        logQuery(
          table,
          `${operation}_unsynced_unreadable`,
          Date.now() - startTime,
          dbError.message
        );
        throw dbError;
      }
    }
    // Replication store failed — fall back to PostgREST
    try {
      const result = await postgrestFn();
      logQuery(table, `${operation}_fallback`, Date.now() - startTime);
      return result;
    } catch (error) {
      const dbError = createDatabaseError(error, table, operation);
      logQuery(table, operation, Date.now() - startTime, dbError.message);
      throw dbError;
    }
  }
}
