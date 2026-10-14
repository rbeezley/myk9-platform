import { describeError } from '@myk9/replication';

export const SAFE_SYNC_REFRESH_ERROR =
  "We couldn't refresh saved show data. You can keep using the saved copy while we try again.";
const SAFE_SYNC_CANCELLED_ERROR = 'Sync was cancelled.';

function getRawSyncErrorMessage(error: unknown): string {
  return describeError(error);
}

function isAbortSyncMessage(message: string): boolean {
  return message.includes('AbortError') || message.includes('signal is aborted');
}

function containsInternalSyncDetail(message: string): boolean {
  return /canceling statement|statement timeout|supabase|postgrest|57014/i.test(message);
}

export function getSyncErrorMessage(error: unknown): string {
  const message = getRawSyncErrorMessage(error);

  if (isAbortSyncMessage(message)) return SAFE_SYNC_CANCELLED_ERROR;
  if (containsInternalSyncDetail(message)) return SAFE_SYNC_REFRESH_ERROR;

  return message;
}

export function isAbortSyncError(error: unknown): boolean {
  return isAbortSyncMessage(getRawSyncErrorMessage(error));
}
