/**
 * withReplicationFallback — generic helper that eliminates boilerplate in every
 * query function that tries the replication store first and falls back to PostgREST.
 *
 * Pattern replaced:
 *
 *   const startTime = Date.now();
 *   try {
 *     const result = await replicationFn();
 *     logQuery(table, operation, Date.now() - startTime);
 *     return result;
 *   } catch {
 *     try {
 *       const result = await postgrestFn();
 *       logQuery(table, operation + '_fallback', Date.now() - startTime);
 *       return result;
 *     } catch (error) {
 *       const dbError = createDatabaseError(error, table, operation);
 *       logQuery(table, operation, Date.now() - startTime, dbError.message);
 *       throw dbError;         // or return { data: ..., error: dbError }
 *     }
 *   }
 */

import { logQuery, createDatabaseError } from '../supabaseClient';

/**
 * Wraps a replication-first / PostgREST-fallback query in the standard logging
 * and error-handling boilerplate.
 *
 * @param replicationFn - Async function that reads from the replication store.
 * @param postgrestFn   - Async function that reads from PostgREST (fallback).
 * @param table         - Table name used for `logQuery` and `createDatabaseError`.
 * @param operation     - Operation name used for `logQuery` and `createDatabaseError`.
 *                        The fallback log call appends `_fallback` automatically.
 * @returns             - Whatever `replicationFn` or `postgrestFn` returns.
 * @throws              - A `DatabaseError` if both functions throw.
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
