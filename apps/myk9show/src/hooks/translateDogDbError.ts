/**
 * Rewrite raw Postgres/PostgREST errors into user-facing messages for
 * dog-create/update flows. Returns an Error (not a string) so callers can
 * throw it, with the original attached as `cause` for log forwarding.
 */

import { FriendlySaveError, friendlySaveMessage } from '@/utils/friendlySaveError';

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_INSUFFICIENT_PRIVILEGE = '42501';
/** myK9 custom SQLSTATE: the dog has paid or scored entries (soft_delete_dog). */
const MK_DOG_HAS_SETTLED_ENTRIES = 'MK002';

function withCause(message: string, cause: unknown): Error {
  const err = new Error(message);
  (err as Error & { cause?: unknown }).cause = cause;
  return err;
}

/**
 * The translated Error when `err` is a case we know, otherwise null. Callers
 * that reach a person must brand or show only a match: an unrecognised error
 * (a network TypeError, a PostgREST diagnostic) is not authored text.
 */
export function matchDogDbError(err: unknown): Error | null {
  const base = err instanceof Error ? err : new Error(String(err));

  const raw = err as { code?: unknown; message?: unknown } | null;
  const code = typeof raw?.code === 'string' ? raw.code : '';
  const message = typeof raw?.message === 'string' ? raw.message : base.message;

  // Before the privilege branch: MK002 is a deliberate product refusal whose
  // message IS the instruction, so it must never be flattened into a generic
  // permission error.
  if (code === MK_DOG_HAS_SETTLED_ENTRIES) {
    return withCause(
      'This dog has paid or scored entries. Pull or refund them before deleting.',
      err
    );
  }

  if (code === PG_UNIQUE_VIOLATION || /duplicate key value/i.test(message)) {
    if (/microchip_number/i.test(message)) {
      return withCause('A dog with this microchip number already exists.', err);
    }
    if (/dog_registrations_live_org_number_unique|registration number/i.test(message)) {
      return withCause('A dog with this registration number already exists.', err);
    }
    return withCause('This dog conflicts with an existing record.', err);
  }

  if (code === PG_FOREIGN_KEY_VIOLATION) {
    return withCause('The selected owner no longer exists. Please refresh and try again.', err);
  }

  if (code === PG_INSUFFICIENT_PRIVILEGE || /row-level security/i.test(message)) {
    return withCause('You do not have permission to save this dog.', err);
  }

  return null;
}

/** Translated when known; otherwise the original error, untouched (code and all). */
export function rethrownDogDbError(err: unknown): unknown {
  return matchDogDbError(err) ?? err;
}

export function translateDogDbError(err: unknown): Error {
  return matchDogDbError(err) ?? (err instanceof Error ? err : new Error(String(err)));
}

/**
 * What a save panel rejects with: a branded sentence for a known translation,
 * the original error for everything else, so `friendlySaveError` can still tell
 * a network failure from a refusal.
 */
export function dogSaveFailure(err: unknown): unknown {
  const match = matchDogDbError(err);
  return match ? new FriendlySaveError(match.message) : err;
}

/** One sentence for a toast, with the same known-or-generic rule. */
export function dogSaveMessage(err: unknown): string {
  return friendlySaveMessage(dogSaveFailure(err));
}
