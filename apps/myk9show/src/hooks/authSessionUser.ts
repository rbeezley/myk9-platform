/**
 * MYK9-1992: who is signed in, when auth-js cannot say right now.
 *
 * auth-js reports `session: null` (from `getSession()` and the INITIAL_SESSION notification) when
 * the access token has expired and the refresh request failed, including when it failed only
 * because the device is offline. Nothing was rejected: the session is still in storage and
 * `_removeSession()` (the SIGNED_OUT event) never ran. Reading that null as "signed out" turned
 * an offline secretary into a guest ("You're offline. Connect to the internet to see this show.",
 * Sign In in the header) and told the sync provider she was unauthenticated, so her queued
 * changes stopped sending.
 *
 * A null session is not a verdict. SIGNED_OUT is: auth-js clears storage before it fires, and the
 * persisted session is then gone too. Every other null falls back to the persisted session's user,
 * the same stored value `persistedAuthUserId` already reads for the replica account stamp. Once
 * the device is back online auth-js refreshes (TOKEN_REFRESHED) or, if the refresh token was
 * genuinely rejected, removes the session (SIGNED_OUT).
 *
 * Identity only. Never use this for authorization: the stored token may be long expired.
 */
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { deriveDefaultAuthStorageKey } from '@/services/database/persistedAuthUserId';

/** The user in the persisted auth-js session, or null when there is no usable session. */
export function readPersistedAuthUser(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined'
    ? undefined
    : window.localStorage,
  storageKey?: string
): User | null {
  try {
    const key = storageKey ?? deriveDefaultAuthStorageKey(import.meta.env.VITE_SUPABASE_URL || '');
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { refresh_token?: unknown; user?: Partial<User> | null };
    const hasRefreshToken =
      typeof stored.refresh_token === 'string' && stored.refresh_token.length > 0;
    const user = stored.user;
    if (!hasRefreshToken || !user || typeof user.id !== 'string' || !user.id) return null;
    return user as User;
  } catch {
    return null;
  }
}

/**
 * The user an auth notification stands for. A session wins; SIGNED_OUT is the only definitive
 * "nobody"; any other null is "not resolved yet" and keeps the persisted user (see above).
 */
export function resolveSessionUser(
  event: AuthChangeEvent | 'GET_SESSION',
  session: Session | null
): User | null {
  if (session?.user) return session.user;
  if (event === 'SIGNED_OUT') return null;
  return readPersistedAuthUser();
}
