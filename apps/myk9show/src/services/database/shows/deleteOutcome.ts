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

export type ShowDeleteFailure = 'already-deleted' | 'permission-denied' | 'still-saving' | 'failed';

/** Set on the error returned when a show still has unsynced work, so no delete was attempted. */
export const SHOW_STILL_SAVING = 'SHOW_STILL_SAVING';

const messageOf = (error: unknown): string =>
  error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';

export function classifyShowDeleteError(error: unknown): ShowDeleteFailure {
  const message = messageOf(error);
  // Matched by message too: showStore.deleteShow rethrows a plain Error, dropping the code.
  if (
    (error as { code?: unknown } | null)?.code === SHOW_STILL_SAVING ||
    /still saving/i.test(message)
  )
    return 'still-saving';
  if (/show not found/i.test(message)) return 'already-deleted';
  if (/permission denied/i.test(message)) return 'permission-denied';
  return 'failed';
}

/**
 * Plain-language copy when every failed show failed the same specific way;
 * null otherwise (the caller keeps its generic wording).
 */
export function showDeleteFailureMessage(
  failures: { name: string; kind: ShowDeleteFailure }[]
): string | null {
  if (failures.length === 0) return null;
  const kind = failures[0]?.kind;
  if (!failures.every(f => f.kind === kind)) return null;
  const names = failures.map(f => f.name).join(', ');
  if (kind === 'permission-denied') return `You don't have permission to delete ${names}.`;
  if (kind === 'still-saving') {
    return `${names} ${failures.length === 1 ? 'is' : 'are'} still saving. Try again in a moment.`;
  }
  return null;
}
