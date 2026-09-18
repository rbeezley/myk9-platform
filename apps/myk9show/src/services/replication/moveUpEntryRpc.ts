/**
 * The two server functions that own a move-up, and the errors they raise.
 *
 * A move-up is an INSERT of the destination plus an UPDATE of the source to
 * `moved`. Done as two replicated writes, the pair could half-land: if the
 * second upload never succeeded the source sat `moved` with no destination
 * anywhere, and the dog had no live entry on any other device or on any report.
 * Migration 20260918193300 makes each direction ONE transaction.
 */
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
  if (code === 'P0002') {
    return new MoveUpRpcError('not-found', message || 'That entry no longer exists.');
  }
  return new MoveUpRpcError('unavailable', message || fallback);
}
