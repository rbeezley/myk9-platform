/**
 * Postgres SQLSTATEs (and PostgREST codes) the SERVER answers with when it was too busy or was
 * interrupted, not when it refused the write: a statement timeout, a serialization failure or
 * deadlock, a lock it could not take, an exhausted resource, a shutdown or lost connection, and
 * PostgREST losing its database (MYK9-2011).
 */
const SERVER_TRANSIENT_CODES: ReadonlySet<string> = new Set([
  '57014',
  '40001',
  '40P01',
  '55P03',
  '57P01',
  '57P02',
  '57P03',
  'PGRST000',
  'PGRST001',
  'PGRST002',
]);
/** SQLSTATE classes that are transient as a whole: 08 connection exception, 53 insufficient resources. */
const SERVER_TRANSIENT_CODE_CLASSES = ['08', '53'] as const;

/**
 * Whether a retryable error is the server answering "not now" (MYK9-2011): a transient SQLSTATE
 * above, a plain HTTP 500, or P0002 (`ringside_update_entry` raises it for an entry the server
 * cannot see yet). Like a gateway 502/503/504, it backs off without spending `maxRetries`, so a
 * brief database hiccup never parks a score as refused. A refusal never qualifies:
 * `isRetryableError` is checked by the caller first, and it already parks P0002 for the RPCs that
 * raise it as a refusal (`RPC_PERMANENT_CODES`).
 */
export function isServerTransientError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, httpStatus } = error as { code?: unknown; httpStatus?: unknown };
  if (httpStatus === 500) return true;
  if (typeof code !== 'string' || code.length === 0) return false;
  if (code === 'P0002' || SERVER_TRANSIENT_CODES.has(code)) return true;
  return SERVER_TRANSIENT_CODE_CLASSES.some(prefix => code.startsWith(prefix));
}
