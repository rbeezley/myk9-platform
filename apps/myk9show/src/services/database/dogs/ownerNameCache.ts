/**
 * A device copy of the owner names the dogs list shows (MYK9-1189).
 *
 * `people` is not replicated, so the owners a dog row carries come from
 * PostgREST. With no signal the dogs still load from the replica, but every
 * row would read "no owner". Each online roster read therefore leaves the owner
 * display names behind here, and the offline read hydrates from them.
 *
 * Name only (first and last), because that is all the list renders: no email,
 * phone or address is ever written to device storage by this module. Scoped to
 * the signed-in account (the persisted session's id, as the replica account
 * stamp does) so a shared browser never shows account B account A's owners, and
 * cleared on sign-out. Never use it online: the server's answer always wins.
 */
import { readPersistedAuthUserId } from '../persistedAuthUserId';

const KEY_PREFIX = 'myk9.dogOwnerNames.v1:';

export interface CachedOwnerName {
  id: string;
  first_name: string;
  last_name: string;
}

type NameMap = Record<string, [string, string]>;

function storageKey(): string | null {
  const userId = readPersistedAuthUserId();
  return userId ? `${KEY_PREFIX}${userId}` : null;
}

function readMap(key: string): NameMap {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as NameMap) : {};
  } catch {
    return {};
  }
}

/** Merge these owners' names into the signed-in account's device copy. Best effort. */
export function rememberOwnerNames(
  owners: ReadonlyArray<{ id: string; first_name?: string | null; last_name?: string | null }>
): void {
  if (typeof window === 'undefined') return;
  const key = storageKey();
  if (!key || owners.length === 0) return;
  try {
    const map = readMap(key);
    for (const owner of owners) {
      if (!owner.id) continue;
      map[owner.id] = [owner.first_name ?? '', owner.last_name ?? ''];
    }
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Storage full or blocked: the offline list falls back to its explicit label.
  }
}

/** The remembered names for these owner ids; ids never remembered are absent. */
export function recallOwnerNames(ownerIds: readonly string[]): Map<string, CachedOwnerName> {
  const found = new Map<string, CachedOwnerName>();
  if (typeof window === 'undefined') return found;
  const key = storageKey();
  if (!key) return found;
  const map = readMap(key);
  for (const id of ownerIds) {
    const entry = map[id];
    if (Array.isArray(entry)) found.set(id, { id, first_name: entry[0], last_name: entry[1] });
  }
  return found;
}

/** Drop every account's device copy (sign-out). */
export function clearOwnerNameCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
