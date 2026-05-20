import { logQuery, createDatabaseError, type DatabaseError } from '../supabaseClient';

type Result<T> = { data: T; error: DatabaseError | null };

/**
 * Wraps a Supabase query call with timing, structured logging, and uniform
 * error handling. Each sub-table CRUD function delegates the boilerplate
 * here so the function body is just the Supabase call.
 *
 * On success: returns { data, error: null }. If the underlying query returns
 * `data: null` (common for list queries on empty tables), the `fallback`
 * value is substituted so list callers can default to `[]` and single-row
 * callers can default to `null` without each call site repeating that choice.
 *
 * On Supabase or thrown error: logs the error message with timing, then
 * returns { data: fallback, error: dbError }. Network-level throws (where
 * `fn` rejects before Supabase responds) are caught and routed through the
 * same error branch so callers see one uniform shape.
 */
export async function wrapQuery<T>(
  tableName: string,
  op: string,
  fallback: T,
  fn: () => PromiseLike<{ data: T | null; error: unknown }>
): Promise<Result<T>> {
  const startTime = Date.now();

  try {
    const { data, error } = await fn();
    const duration = Date.now() - startTime;

    if (error) {
      const errMessage = (error as { message?: string })?.message;
      logQuery(tableName, op, duration, errMessage);
      const dbError = createDatabaseError(error, tableName, op);
      return { data: fallback, error: dbError };
    }

    logQuery(tableName, op, duration);
    return { data: data ?? fallback, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, tableName, op);
    logQuery(tableName, op, duration, dbError.message);
    return { data: fallback, error: dbError };
  }
}

/**
 * Variant for `delete` operations whose external signature is
 * `{ error: DatabaseError | null }` with no `data` field. The Supabase
 * `.delete()` chain returns `{ error }`; this helper preserves that shape
 * exactly while sharing the same timing/logging/error pipeline as
 * `wrapQuery`.
 */
export async function wrapMutation(
  tableName: string,
  op: string,
  fn: () => PromiseLike<{ error: unknown }>
): Promise<{ error: DatabaseError | null }> {
  const startTime = Date.now();

  try {
    const { error } = await fn();
    const duration = Date.now() - startTime;

    if (error) {
      const errMessage = (error as { message?: string })?.message;
      logQuery(tableName, op, duration, errMessage);
      const dbError = createDatabaseError(error, tableName, op);
      return { error: dbError };
    }

    logQuery(tableName, op, duration);
    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, tableName, op);
    logQuery(tableName, op, duration, dbError.message);
    return { error: dbError };
  }
}
