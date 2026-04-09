import { logQuery, createDatabaseError } from '../supabaseClient';

/**
 * Tries replicationFn first; on failure falls back to postgrestFn.
 * Handles timing, logging, and error wrapping. Throws DatabaseError if both fail.
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
  } catch {
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
