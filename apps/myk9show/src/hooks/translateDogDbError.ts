/**
 * Rewrite raw Postgres/PostgREST errors into user-facing messages for
 * dog-create/update flows. Returns an Error (not a string) so callers can
 * throw it, with the original attached as `cause` for log forwarding.
 */

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_INSUFFICIENT_PRIVILEGE = '42501';

function withCause(message: string, cause: unknown): Error {
  const err = new Error(message);
  (err as Error & { cause?: unknown }).cause = cause;
  return err;
}

export function translateDogDbError(err: unknown): Error {
  const base = err instanceof Error ? err : new Error(String(err));

  const raw = err as { code?: unknown; message?: unknown } | null;
  const code = typeof raw?.code === 'string' ? raw.code : '';
  const message = typeof raw?.message === 'string' ? raw.message : base.message;

  if (code === PG_UNIQUE_VIOLATION || /duplicate key value/i.test(message)) {
    if (/microchip_number/i.test(message)) {
      return withCause('A dog with this microchip number already exists.', err);
    }
    return withCause('This dog conflicts with an existing record.', err);
  }

  if (code === PG_FOREIGN_KEY_VIOLATION) {
    return withCause('The selected owner no longer exists. Please refresh and try again.', err);
  }

  if (code === PG_INSUFFICIENT_PRIVILEGE || /row-level security/i.test(message)) {
    return withCause('You do not have permission to save this dog.', err);
  }

  return base;
}
