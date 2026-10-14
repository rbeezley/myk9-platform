/**
 * The signed-in account's id, read from supabase-js's persisted session
 * (MYK9-1133), for the replica account stamp only.
 *
 * `supabase.auth.getSession()` errors when the access token has expired and the
 * network is gone (jwt_expiry is 3600), which is most of a show day for a
 * device that went offline after sign-in. The stamp check asks WHO is signed
 * in, not whether they may do anything, so it falls back to the id in the
 * stored session. Never use this for authorization, uploads or RLS: the token
 * in that session may be long expired.
 *
 * supabase-js stores the whole session as JSON under its storageKey, the
 * default of which is `sb-<first hostname label of the project URL>-auth-token`:
 * `{ access_token, refresh_token, expires_at, token_type, user: { id, ... } }`
 * (older builds wrapped it as `{ currentSession: { ... } }`). Sign-out removes
 * the key and the next sign-in overwrites it, so a previous account's id is
 * not reused.
 */

type ReadableStorage = Pick<Storage, 'getItem'>;

/** The key supabase-js uses when `auth.storageKey` is not set (as in supabaseClient.ts). */
export function deriveDefaultAuthStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

function userIdOf(stored: unknown): string | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const record = stored as { user?: { id?: unknown }; currentSession?: unknown };
  const id = record.user?.id ?? userIdOf(record.currentSession);
  return typeof id === 'string' && id.trim().length > 0 ? id : null;
}

/** The persisted session's user id, or null when there is none to read. */
export function readPersistedAuthUserId(
  storage: ReadableStorage | undefined = typeof window === 'undefined'
    ? undefined
    : window.localStorage,
  storageKey?: string
): string | null {
  try {
    const key = storageKey ?? deriveDefaultAuthStorageKey(import.meta.env.VITE_SUPABASE_URL || '');
    const raw = storage?.getItem(key);
    return raw ? userIdOf(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
