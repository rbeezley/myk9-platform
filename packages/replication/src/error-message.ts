/** Shown when a failure carries nothing readable. */
export const UNKNOWN_ERROR_MESSAGE = 'Unknown error';

function firstText(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return undefined;
}

/**
 * A human-readable message for any thrown value. Replaces `String(error)`,
 * which turns a PostgREST error object into "[object Object]" (MYK9-1146).
 * Reads `message`, then `details`, `hint` and `code` of an error-shaped object.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error)
    return firstText(error.message) ?? firstText(error.name) ?? UNKNOWN_ERROR_MESSAGE;
  if (typeof error === 'string') return firstText(error) ?? UNKNOWN_ERROR_MESSAGE;
  if (typeof error === 'object' && error !== null) {
    const { message, details, hint, code } = error as Record<string, unknown>;
    return firstText(message, details, hint, code) ?? UNKNOWN_ERROR_MESSAGE;
  }
  return UNKNOWN_ERROR_MESSAGE;
}
