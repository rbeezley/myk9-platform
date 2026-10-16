/**
 * Did a registrations read fail because the server could not be REACHED,
 * rather than because it answered with an error (MYK9-1090)?
 *
 * Only the first may fall back to the labelled offline device copy. A 401,
 * 5xx, RLS or schema failure while online must surface as an error with its
 * retry, or a passing server problem reads as "offline" with no way back
 * (adversarial review of PR 2). The read layer wraps failures with
 * `createDatabaseError`, a plain object that keeps the browser's message, so
 * this matches on the message rather than `instanceof Error`. The messages
 * are the browsers' fetch rejections, as in `isTransientBrowserFetchError`:
 * Chrome "Failed to fetch", Safari "Load failed", Firefox "NetworkError…".
 */
const UNREACHABLE = /AbortError|signal is aborted|Failed to fetch|Load failed|NetworkError/i;

export function serverUnreachable(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!error) return false;
  const message =
    typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  return UNREACHABLE.test(message);
}
