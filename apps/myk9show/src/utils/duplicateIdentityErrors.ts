/**
 * Translate exact identity conflicts into user-facing copy. Keep constraint
 * names out of UI surfaces while preserving the original error as the cause.
 */

const PG_UNIQUE_VIOLATION = '23505';

function withCause(message: string, cause: unknown): Error {
  const err = new Error(message);
  (err as Error & { cause?: unknown }).cause = cause;
  return err;
}

function errorCode(error: unknown): string {
  const candidate = error as { code?: unknown } | null;
  return typeof candidate?.code === 'string' ? candidate.code : '';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const candidate = error as { message?: unknown } | null;
  return typeof candidate?.message === 'string' ? candidate.message : String(error);
}

function isUniqueConflict(error: unknown): boolean {
  return (
    errorCode(error) === PG_UNIQUE_VIOLATION || /duplicate key value/i.test(errorMessage(error))
  );
}

export function translateClubIdentityError(error: unknown): Error {
  const message = errorMessage(error);

  if (/club name already exists.*not authorized|not authorized.*matching club/i.test(message)) {
    return withCause(
      'A club with this name already exists, but your account does not have access to use it.',
      error
    );
  }

  if (
    isUniqueConflict(error) &&
    /clubs_live_normalized_name_unique|normalize_club_name|club.*name/i.test(message)
  ) {
    return withCause('A club with this name already exists.', error);
  }

  return error instanceof Error ? error : new Error(message);
}

export function translatePersonIdentityError(error: unknown): Error {
  const message = errorMessage(error);

  if (isUniqueConflict(error) && /people_email_unique|email/i.test(message)) {
    return withCause('A person with this email already exists.', error);
  }

  return error instanceof Error ? error : new Error(message);
}
