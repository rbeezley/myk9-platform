/**
 * The two server functions that own a move-up, and the errors they raise.
 *
 * A move-up is an INSERT of the destination plus an UPDATE of the source to
 * `moved`. Done as two replicated writes, the pair could half-land: if the
 * second upload never succeeded the source sat `moved` with no destination
 * anywhere, and the dog had no live entry on any other device or on any report.
 * Migration 20260918193300 makes each direction ONE transaction.
 */
import { getUserFriendlyError } from '@/utils/errorMessages';

export const MOVE_UP_ENTRY_RPC = 'move_up_entry';
export const REVERSE_MOVE_UP_ENTRY_RPC = 'reverse_move_up_entry';

/** SQLSTATE the two functions raise, and what each one means to a secretary. */
export type MoveUpRpcFailureKind =
  'not-deployed' | 'not-authorized' | 'refused' | 'not-found' | 'unavailable';

export class MoveUpRpcError extends Error {
  readonly kind: MoveUpRpcFailureKind;

  constructor(kind: MoveUpRpcFailureKind, message: string) {
    super(message);
    this.name = 'MoveUpRpcError';
    this.kind = kind;
  }
}

interface PostgrestLikeError {
  code?: string | undefined;
  message?: string | undefined;
}

/**
 * Turn a PostgREST/Postgres error into something a secretary can act on.
 *
 * `PGRST202` is the deploy window: the bundle shipped before `supabase db push`
 * ran, so the function does not exist yet. It is called out by name because the
 * generic "something went wrong" would send someone hunting a data problem that
 * is really a deploy-ordering one. Nothing has been written in that case — the
 * whole operation is one server call, so a missing function means the dog simply
 * did not move.
 */
export function classifyMoveUpRpcError(error: unknown, fallback: string): MoveUpRpcError {
  const candidate = (error ?? {}) as PostgrestLikeError;
  const code = candidate.code;
  const message = typeof candidate.message === 'string' ? candidate.message : '';

  if (code === 'PGRST202' || code === '42883') {
    return new MoveUpRpcError(
      'not-deployed',
      'Moving entries is not available on this server yet. Nothing was changed.'
    );
  }
  if (code === '42501') {
    return new MoveUpRpcError(
      'not-authorized',
      message || 'You do not have permission to move entries in this show.'
    );
  }
  if (code === '22023') {
    return new MoveUpRpcError('refused', message || fallback);
  }
  if (code === '23505') {
    // The unique index speaking. `move_up_entry` pre-checks this and raises
    // 22023 with words, so reaching here means a race between the check and the
    // INSERT -- still a refusal, and still not raw constraint text in a toast.
    return new MoveUpRpcError('refused', 'This dog is already entered in that class.');
  }
  if (code === 'P0002') {
    return new MoveUpRpcError('not-found', message || 'That entry no longer exists.');
  }
  // Deliberately NOT the server's `message`: an unmapped SQLSTATE is raw
  // Postgres text (23503 on a stale registration_id, 40001 under a ringside
  // conflict storm, 23505 on a colliding caller-supplied id), and the authored
  // sentences above are the only ones written for a secretary to read.
  return new MoveUpRpcError('unavailable', fallback);
}

/**
 * The message to SHOW for a failed move-up or move-back.
 *
 * `getUserFriendlyError` returns `error.message` only under `import.meta.env.DEV`;
 * in production it looks for a PostgREST `code`, finds none on a thrown
 * `MoveUpRpcError`, and falls back to "Something went wrong. Please try again."
 * Every sentence this module and the two RPCs write — the deploy-window notice,
 * "This entry is not in a state that can be moved.", "An entry can only move
 * within its own show.", "This run has already started…" — was therefore
 * invisible to the only person who needed it.
 *
 * These strings are authored FOR the secretary, in the migration and here.
 * `classifyMoveUpRpcError` maps every SQLSTATE the two functions raise —
 * P0002, 42501, 22023 — and turns anything else into the CALLER's fallback
 * sentence rather than the server's text, so an unmapped code (23503 on a
 * stale registration_id, 40001 under a conflict storm, 23505 on a colliding
 * caller-supplied id) can never surface raw Postgres in a toast. An error that
 * is not a `MoveUpRpcError` at all still goes through `getUserFriendlyError`.
 */
export function getMoveUpErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof MoveUpRpcError) return error.message;
  return getUserFriendlyError(error, fallback);
}
