/**
 * User-friendly error message mapping.
 *
 * Supabase / PostgREST errors often contain internal details (table names,
 * constraint names, SQL fragments) that should never be shown to end users.
 * This utility maps known error codes to safe, actionable messages.
 */

import {
  SIGN_IN_EMAIL_LOCKED_CODE,
  SIGN_IN_EMAIL_LOCKED_MESSAGE,
  SIGN_IN_EMAIL_UNVERIFIABLE_CODE,
  SIGN_IN_EMAIL_UNVERIFIABLE_MESSAGE,
} from './signInEmailMessages';

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

  // myK9 custom SQLSTATEs (class MK)
  MK001: 'This person still owns dogs. Delete those dogs first.',
  MK002: 'This dog has paid or scored entries. Scratch or refund them before deleting.',

  // Application-level refusals (MYK9-136). These carry copy that is the whole
  // point of the refusal, so they must be mapped — this function discards the
  // original message in production.
  [SIGN_IN_EMAIL_LOCKED_CODE]: SIGN_IN_EMAIL_LOCKED_MESSAGE,
  [SIGN_IN_EMAIL_UNVERIFIABLE_CODE]: SIGN_IN_EMAIL_UNVERIFIABLE_MESSAGE,
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
export function getUserFriendlyError(error: unknown, fallback: string = DEFAULT_MESSAGE): string {
  if (import.meta.env.DEV) {
    // In dev, return the raw message for easier debugging
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    // Plain error objects (e.g. DatabaseError from createDatabaseError) carry
    // their message as a property without being Error instances.
    if (error && typeof error === 'object') {
      const msg = (error as Record<string, unknown>).message;
      if (typeof msg === 'string' && msg) return msg;
    }
    return fallback;
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

  return fallback;
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
