/**
 * User-friendly error message mapping.
 *
 * Supabase / PostgREST errors often contain internal details (table names,
 * constraint names, SQL fragments) that should never be shown to end users.
 * This utility maps known error codes to safe, actionable messages.
 */

/** Known PostgreSQL / PostgREST error code prefixes and their user-facing messages. */
const ERROR_CODE_MAP: Record<string, string> = {
  // PostgreSQL class 23 — integrity constraint violations
  '23505': 'This record already exists.',
  '23503': 'Cannot complete this action — it is referenced by other records.',
  '23502': 'A required field is missing.',
  '23514': 'The value provided is out of the allowed range.',

  // PostgreSQL class 42 — access / syntax
  '42501': "You don't have permission to perform this action.",
  '42P01': 'Operation failed. Please try again.',

  // PostgreSQL class 08 — connection
  '08000': 'Unable to reach the server. Please check your connection.',
  '08006': 'Connection to the server was lost. Please try again.',
};

/** Prefix-based fallbacks (e.g. all PGRST codes). */
const ERROR_PREFIX_MAP: Record<string, string> = {
  PGRST: 'Operation failed. Please try again.',
};

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Extracts a user-safe error message from an unknown error value.
 *
 * In development builds the original message is preserved for debugging.
 * In production only mapped / generic messages are returned.
 */
export function getUserFriendlyError(error: unknown): string {
  if (import.meta.env.DEV) {
    // In dev, return the raw message for easier debugging
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return DEFAULT_MESSAGE;
  }

  // Extract code from Supabase / PostgREST error shapes
  const code = extractErrorCode(error);

  if (code) {
    // Exact match
    if (ERROR_CODE_MAP[code]) return ERROR_CODE_MAP[code];

    // Prefix match
    for (const [prefix, message] of Object.entries(ERROR_PREFIX_MAP)) {
      if (code.startsWith(prefix)) return message;
    }
  }

  return DEFAULT_MESSAGE;
}

/** Attempt to pull an error `code` from various error shapes. */
function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const obj = error as Record<string, unknown>;

  // Supabase PostgrestError: { code: string; message: string; details: string; hint: string }
  if (typeof obj.code === 'string') return obj.code;

  // Nested — e.g. error.error.code
  if (obj.error && typeof obj.error === 'object') {
    const inner = obj.error as Record<string, unknown>;
    if (typeof inner.code === 'string') return inner.code;
  }

  return undefined;
}
