/**
 * When an E2E spec may reuse a test account's saved sign-in instead of signing
 * in through the form again (MYK9-1056).
 *
 * Every form sign-in creates an auth session and refresh token on the live
 * project that nothing ever signs out: one PR smoke run left ~45 behind, and
 * the four shared test accounts had reached ~25k sessions by 2026-10-08. The
 * Playwright half lives in `../e2e/helpers/sharedSession.ts`; this half is pure
 * so vitest (which excludes `e2e/`) can check it.
 */

import { isSupabaseAuthTokenKey } from './signInDiagnostics';

/**
 * A saved token must have at least this long left. supabase-js refreshes only
 * near expiry, and a refresh rotates the refresh token: two workers holding the
 * same session would then trip Supabase's reuse detection, which revokes the
 * whole session. An hour-long access token reused only while 20+ minutes remain
 * is never near expiry during a spec.
 */
export const SHARED_SESSION_MIN_REMAINING_MS = 20 * 60 * 1000;

/** The supabase-js localStorage entry for one signed-in account. */
export interface SavedSession {
  key: string;
  value: string;
}

/** The stored session's access token and expiry, or null if the value is not one. */
export function readSessionToken(
  value: string
): { accessToken: string; expiresAtMs: number } | null {
  try {
    const parsed = JSON.parse(value) as { access_token?: unknown; expires_at?: unknown };
    if (typeof parsed.access_token !== 'string' || parsed.access_token.length === 0) return null;
    if (typeof parsed.expires_at !== 'number') return null;
    return { accessToken: parsed.access_token, expiresAtMs: parsed.expires_at * 1000 };
  } catch {
    return null;
  }
}

/** Whether a saved session is shaped right and has enough life left to share. */
export function isReusableSession(saved: SavedSession, nowMs: number): boolean {
  if (!isSupabaseAuthTokenKey(saved.key)) return false;
  const token = readSessionToken(saved.value);
  return token !== null && token.expiresAtMs - nowMs >= SHARED_SESSION_MIN_REMAINING_MS;
}

/** One file per account; the address is reduced to a safe file name. */
export function sharedSessionFileName(email: string): string {
  return `${email.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`;
}
