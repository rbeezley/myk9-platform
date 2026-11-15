/**
 * Server answers that say "not this time", not "never" (MYK9-2011, owner decision 6,
 * 2026-11-14). The server was reached and could not finish this attempt: the statement ran
 * out of time (57014), it lost a deadlock (40P01), the row it needs is not there yet (P0002),
 * or it failed with a plain 500 that names no reason. A score that hits one of these keeps
 * retrying with capped backoff and spends no retry budget, so it never parks as refused.
 *
 * Checked only after `isRetryableError`, so a code that is permanent for one RPC
 * (`RPC_PERMANENT_CODES`: P0002 for `set_class_judge`) still parks at once. 40001 is left out on
 * purpose: it is the version conflict, which the OCC path settles.
 */
const SERVER_TRANSIENT_CODES: ReadonlySet<string> = new Set(['57014', '40P01', 'P0002']);

export function isServerTransientError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, httpStatus } = error as { code?: unknown; httpStatus?: unknown };
  if (typeof code === 'string' && SERVER_TRANSIENT_CODES.has(code)) return true;
  return httpStatus === 500 && (code === undefined || code === '');
}
