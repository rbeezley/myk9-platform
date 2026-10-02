/**
 * Server refusals → plain language. No raw database text ever reaches the user
 * from the delete path: every SQLSTATE the soft-delete, restore and preview RPCs
 * raise (20261001214300, 20261001233700, 20261001235300, MK001/MK002 from
 * earlier migrations) is named here, and anything else gets a generic sentence.
 *
 * Everything here reads the SQLSTATE alone, never the message (MYK9-922). The
 * server gives each meaning its own code:
 *   P0002  the row does not exist or is already deleted (restore: not deleted);
 *   42501  the row is live and the caller may not act on it.
 * Guessing from message text read a refusal as "already deleted" (and purged a
 * live dog from this device) and a deleted record as a refusal (and blocked a
 * whole bulk delete); the codes cannot be misread either way.
 */
import { objectNoun } from './deleteObjectCopy';
import type { DeleteObjectKind, DeletePreviewUnavailableReason } from './deleteTypes';
import { SHOW_STILL_SAVING } from '@/services/database/shows/deleteOutcome';

interface ErrorLike {
  code?: unknown;
}

function fieldsOf(error: unknown): { code: string } {
  const e = (error && typeof error === 'object' ? error : {}) as ErrorLike;
  return { code: typeof e.code === 'string' ? e.code : '' };
}

/** P0002 (no_data_found): the row does not exist or is already deleted. */
export const PG_NO_DATA_FOUND = 'P0002';
/** 42501 (insufficient_privilege): the row is live; the caller may not act on it. */
export const PG_INSUFFICIENT_PRIVILEGE = '42501';

/** True when the server said the row is already gone (another device, a retry). */
export function isAlreadyGoneError(error: unknown): boolean {
  return fieldsOf(error).code === PG_NO_DATA_FOUND;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/*
 * "Offline" means the browser says so. A transport failure while it says online
 * (`Failed to fetch`: a dropped request, a captive portal, a blip) is a plain,
 * retryable failure: calling it offline hid the retry control and left the
 * dialog stuck until it was reopened.
 */

export type DeleteFailureKind =
  'already-deleted' | 'blocked' | 'forbidden' | 'still-saving' | 'offline' | 'failed';

/** What a failed soft_delete_<object> call means, by SQLSTATE only. */
export function classifyDeleteError(error: unknown): DeleteFailureKind {
  const { code } = fieldsOf(error);
  if (code === SHOW_STILL_SAVING) return 'still-saving';
  if (code === 'MK010' || code === 'MK011' || code === 'MK001' || code === 'MK002')
    return 'blocked';
  if (code === PG_NO_DATA_FOUND) return 'already-deleted';
  if (code === PG_INSUFFICIENT_PRIVILEGE) return 'forbidden';
  if (isOffline()) return 'offline';
  return 'failed';
}

const thisThing = (kind: DeleteObjectKind) => `this ${objectNoun(kind)}`;

/** The sentence shown when a delete is refused or fails. */
export function deleteErrorMessage(kind: DeleteObjectKind, error: unknown): string {
  const { code } = fieldsOf(error);
  switch (classifyDeleteError(error)) {
    case 'blocked':
      if (code === 'MK011') return 'This club still has shows. Delete or move its shows first.';
      if (code === 'MK001') {
        return 'This person still owns dogs. Delete those dogs or give them a new owner first.';
      }
      if (kind === 'show') {
        return 'This show has paid or scored entries. Cancel the show instead of deleting it.';
      }
      if (kind === 'entry') {
        return 'This entry has been paid for or scored. Use Withdraw or Pull instead of deleting it.';
      }
      return `This ${objectNoun(kind)} has paid or scored entries. Withdraw or Pull those entries first.`;
    case 'forbidden':
      return `You don't have permission to delete ${thisThing(kind)}.`;
    case 'still-saving':
      return "Finish saving first: this device has changes that haven't uploaded yet.";
    case 'offline':
      return "You're offline. Deleting needs a connection. Try again when you're back online.";
    case 'already-deleted':
      return `${thisThing(kind).replace(/^t/, 'T')} was already deleted.`;
    case 'failed':
      return `We couldn't delete ${thisThing(kind)}. Please try again.`;
  }
}

/** The sentence shown when Undo (restore_<object>) fails. */
export function restoreErrorMessage(kind: DeleteObjectKind, error: unknown): string {
  const { code } = fieldsOf(error);
  if (code === PG_INSUFFICIENT_PRIVILEGE) {
    return 'The 10 minutes to undo this are over. Ask a myK9 administrator to restore it.';
  }
  if (code === 'MK013') {
    const parent =
      kind === 'trial'
        ? 'show'
        : kind === 'class'
          ? 'trial'
          : kind === 'show'
            ? 'club'
            : 'class or dog';
    return `This can't come back while its ${parent} is deleted. Restore the ${parent} first.`;
  }
  if (code === PG_NO_DATA_FOUND) {
    // Reached only when the record is NOT live (`restoreRecords` reads a live one
    // as restored first), so it was permanently purged: never say "already back".
    return `${thisThing(kind).replace(/^t/, 'T')} can no longer be restored.`;
  }
  if (isOffline()) {
    return "You're offline. Undo needs a connection. Try again when you're back online.";
  }
  return `We couldn't bring back ${thisThing(kind)}. Please try again.`;
}

/**
 * Why a delete_preview read failed, for the dialog's "unknown" state. A P0002
 * never reaches here: `useDeletePreview` reads it as "already gone" and drops
 * that item from the delete instead of blocking it.
 */
export function classifyPreviewError(error: unknown): DeletePreviewUnavailableReason {
  const { code } = fieldsOf(error);
  if (isOffline()) return 'offline';
  if (code === PG_INSUFFICIENT_PRIVILEGE) return 'forbidden';
  return 'failed';
}

/**
 * Whether pressing Undo again could succeed. A refusal the server will repeat
 * (window over, parent still deleted, record purged) is not worth a second try.
 */
export function isRetryableRestoreError(error: unknown): boolean {
  const { code } = fieldsOf(error);
  return !(code === PG_INSUFFICIENT_PRIVILEGE || code === 'MK013' || code === PG_NO_DATA_FOUND);
}
