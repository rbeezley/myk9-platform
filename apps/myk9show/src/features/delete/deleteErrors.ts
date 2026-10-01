/**
 * Server refusals → plain language. No raw database text ever reaches the user
 * from the delete path: every SQLSTATE the soft-delete, restore and preview RPCs
 * raise (20261001214300, 20261001233700, MK001/MK002 from earlier migrations) is
 * named here, and anything else gets a generic sentence.
 */
import { objectNoun } from './deleteObjectCopy';
import type { DeleteObjectKind, DeletePreviewUnavailableReason } from './deleteTypes';
import { SHOW_STILL_SAVING } from '@/services/database/shows/deleteOutcome';

interface ErrorLike {
  code?: unknown;
  message?: unknown;
}

function fieldsOf(error: unknown): { code: string; message: string } {
  const e = (error && typeof error === 'object' ? error : {}) as ErrorLike;
  return {
    code: typeof e.code === 'string' ? e.code : '',
    message: typeof e.message === 'string' ? e.message : '',
  };
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** A transport failure carries no SQLSTATE; PostgREST errors always do. */
function isNetworkFailure(code: string, message: string): boolean {
  return !code && /failed to fetch|network|load failed|fetch failed/i.test(message);
}

export type DeleteFailureKind =
  'already-deleted' | 'blocked' | 'forbidden' | 'still-saving' | 'offline' | 'failed';

/**
 * What a failed soft_delete_<object> call means. "Not found or already deleted"
 * shares 42501 with "Permission denied" on show/trial/class/entry, so the message
 * is the only discriminator (the same reading as `classifyShowDeleteError`).
 */
export function classifyDeleteError(error: unknown): DeleteFailureKind {
  const { code, message } = fieldsOf(error);
  if (code === SHOW_STILL_SAVING || /still saving/i.test(message)) return 'still-saving';
  if (code === 'MK010' || code === 'MK011' || code === 'MK001' || code === 'MK002')
    return 'blocked';
  if (/not found|already deleted/i.test(message) || code === 'P0002') return 'already-deleted';
  if (code === '42501') return 'forbidden';
  if (isOffline() || isNetworkFailure(code, message)) return 'offline';
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
      return `${thisThing(kind).replace(/^t/, 'T')} is still saving. Try again in a moment.`;
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
  const { code, message } = fieldsOf(error);
  if (code === '42501') {
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
  if (code === 'P0002' || /not deleted/i.test(message)) {
    return `${thisThing(kind).replace(/^t/, 'T')} is already back.`;
  }
  if (isOffline() || isNetworkFailure(code, message)) {
    return "You're offline. Undo needs a connection. Try again when you're back online.";
  }
  return `We couldn't bring back ${thisThing(kind)}. Please try again.`;
}

/** Why a delete_preview read failed, for the dialog's "unknown" state. */
export function classifyPreviewError(error: unknown): DeletePreviewUnavailableReason {
  const { code, message } = fieldsOf(error);
  if (isOffline() || isNetworkFailure(code, message)) return 'offline';
  if (code === '42501' && !/not found|already deleted/i.test(message)) return 'forbidden';
  return 'failed';
}
