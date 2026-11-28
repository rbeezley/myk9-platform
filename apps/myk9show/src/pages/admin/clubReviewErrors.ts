import { STEP_UP_SQLSTATE } from '@/features/step-up/stepUpFetch';
import { COULD_NOT_REACH_MYK9SHOW } from '@/lib/offlineCopy';
import { mappedErrorMessage } from '@/utils/errorMessages';

/** The server refused a delete because the club still has live shows (MYK9-2513). */
export const CLUB_HAS_SHOWS_SQLSTATE = 'MK011';

export const CLUB_HAS_SHOWS_MESSAGE =
  'Nothing was declined. This club still has shows. Delete or move its shows first, or decline without deleting the club.';

/** The review RPC raises this when the request was already reviewed or its club was deleted. */
export const REQUEST_ALREADY_REVIEWED_SQLSTATE = '23514';

export const REQUEST_ALREADY_REVIEWED_MESSAGE =
  'This request was already reviewed, or its club was removed. Refresh the list to see where it stands.';

/** Approving a request whose club was deleted leaves it pending, so refreshing brings it back. */
export const REQUEST_CLUB_DELETED_MESSAGE =
  "This request's club was deleted, so it can't be approved. Decline the request instead.";

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : '';
}

function isTransportFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  // PostgREST hands back a plain object, `{ message: 'TypeError: Failed to fetch' }`, not an Error.
  // Read only to classify; the text is never shown.
  const message = errorText(error);
  return (
    error instanceof TypeError ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(message)
  );
}

/**
 * MYK9-2528: what happened to an Approve, Decline or club-page change, in plain words.
 * Never the raw text of a network or database error ("TypeError: Failed to fetch"):
 * the SQLSTATE or the failure kind picks the sentence. `action` is the verb phrase the
 * person was doing, for example "approve this club".
 */
export function clubReviewErrorMessage(error: unknown, action: string): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === STEP_UP_SQLSTATE) return 'Nothing was approved. Confirm your password to continue.';
  if (code === CLUB_HAS_SHOWS_SQLSTATE) return CLUB_HAS_SHOWS_MESSAGE;
  if (code === REQUEST_ALREADY_REVIEWED_SQLSTATE) {
    // review_club_access_request raises 23514 for both; only the deleted-club case stays pending.
    return /club has been deleted/i.test(errorText(error))
      ? REQUEST_CLUB_DELETED_MESSAGE
      : REQUEST_ALREADY_REVIEWED_MESSAGE;
  }
  if (isTransportFailure(error)) {
    return `${COULD_NOT_REACH_MYK9SHOW} Nothing was changed. Check your connection, then try to ${action} again.`;
  }
  return mappedErrorMessage(error) ?? `We couldn't ${action}. Nothing was changed. Try again.`;
}

/** For a load that failed (the Users list): plain words, never the raw error. */
export function loadFailureDescription(error: unknown): string {
  if (isTransportFailure(error)) {
    return `${COULD_NOT_REACH_MYK9SHOW} Check your connection and try again.`;
  }
  return mappedErrorMessage(error) ?? 'Check your connection and try again.';
}
