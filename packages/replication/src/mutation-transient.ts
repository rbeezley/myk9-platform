/**
 * Server answers that say "not this time", not "never" (MYK9-2011, owner decision 6,
 * 2026-11-14). The server was reached and could not finish this attempt: the statement ran
 * out of time (57014), it lost a deadlock (40P01), or it failed with a plain 500 that names
 * no reason. A write that hits one of these keeps retrying with capped backoff and spends no
 * retry budget, so it never parks as refused.
 *
 * Deliberately not here: P0002 (no row found). A score for an entry the server does not have
 * spends the normal budget and then shows on the Scores not sent list with Try again, so it
 * never waits forever unseen. 40001 is the version conflict, which the OCC path settles.
 * Checked only after `isRetryableError`, so a refusal never qualifies.
 */
const SERVER_TRANSIENT_CODES: ReadonlySet<string> = new Set(['57014', '40P01']);

export function isServerTransientError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, httpStatus } = error as { code?: unknown; httpStatus?: unknown };
  if (typeof code === 'string' && SERVER_TRANSIENT_CODES.has(code)) return true;
  return httpStatus === 500 && (code === undefined || code === '');
}
