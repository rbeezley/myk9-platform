import type { ClassChangeFailure } from './classChangeRequests';

/** Said when the device has no connection: a request is never queued. */
export const CLASS_CHANGE_OFFLINE_MESSAGE =
  'You need a connection to ask for a class change. Try again when you are back online.';

/** Shown for any failure the table below does not name. */
export const CLASS_CHANGE_FALLBACK_MESSAGE =
  'We could not send that request. Please try again, or ask the secretary.';

const BY_HINT: Record<string, string> = {
  class_full: 'That class is full, so it cannot take another dog.',
  class_started: 'That class has already started, so it cannot take a changed entry.',
  class_closed: 'That class is finished or cancelled, so it cannot take a changed entry.',
  class_changes_not_allowed:
    'This show does not take class change requests after entries close. Ask the secretary.',
  same_day_move_ups_not_allowed:
    'This show does not take requests to move to another trial on the same day. Ask the secretary.',
  request_already_open:
    'This entry already has a class change request. Take it back before asking again.',
  entry_not_accepted: 'This entry has to be accepted by the club before it can change class.',
  entry_started: 'This dog has already started at the show, so its class cannot be changed here.',
  no_open_request: 'That request is no longer waiting, so there is nothing to take back.',
};

const BY_CODE: Record<string, string> = {
  '40001': 'Someone else changed this entry. Reopen it and try again.',
  P0002: 'That entry or class no longer exists. Refresh the page and try again.',
  '42501': 'Only the dog’s owner or handler can ask for a class change.',
  MK006: 'This show has finished, so its classes can no longer be changed.',
};

/** One plain sentence for a refused request or take-back. Never the raw Postgres text. */
export const CLASS_CHANGE_TAKE_BACK_FALLBACK_MESSAGE =
  'We could not take that request back. Please try again, or ask the secretary.';

export function classChangeErrorMessage(
  error: ClassChangeFailure | null | undefined,
  fallback: string = CLASS_CHANGE_FALLBACK_MESSAGE
): string {
  if (error?.hint && BY_HINT[error.hint]) return BY_HINT[error.hint] as string;
  if (error?.code && BY_CODE[error.code]) return BY_CODE[error.code] as string;
  return fallback;
}
