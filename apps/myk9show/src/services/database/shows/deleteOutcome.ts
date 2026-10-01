/**
 * What a failed `soft_delete_show` call means, read from the RPC's own
 * messages (migration 20260515113000). Both refusals carry ERRCODE 42501, so
 * the code cannot tell them apart; the message is the only discriminator.
 *
 * - "Show not found" / "Show not found or already deleted": the row is
 *   already soft-deleted (or never existed). For a client that still lists the
 *   show, that is the outcome the user asked for, so callers treat it as done.
 * - "Permission denied": the caller may not delete this show. A real failure.
 */

export type ShowDeleteFailure = 'already-deleted' | 'permission-denied' | 'failed';

const messageOf = (error: unknown): string =>
  error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';

export function classifyShowDeleteError(error: unknown): ShowDeleteFailure {
  const message = messageOf(error);
  if (/show not found/i.test(message)) return 'already-deleted';
  if (/permission denied/i.test(message)) return 'permission-denied';
  return 'failed';
}

/** Plain-language failure copy; null when the failure has no specific wording. */
export function showDeletePermissionMessage(names: string[]): string {
  return `You don't have permission to delete ${names.join(', ')}.`;
}
