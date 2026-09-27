/**
 * Clean up legacy device-local saved views when the authenticated account
 * changes. Saved-view creation and restore are no longer mounted, but older
 * namespaced keys may still exist on a shared device.
 */

/** Minimal storage contract, satisfied by `window.localStorage` and test fakes. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

const NAMESPACE_PREFIX = 'operational-views';

/** Best-effort storage access. Returns null when storage is unavailable or blocked. */
function safeGetStorage(storage: KeyValueStorage | undefined | null): KeyValueStorage | null {
  if (!storage) return null;
  try {
    const probeKey = `${NAMESPACE_PREFIX}:__probe__`;
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

/** Remove every saved-view key belonging to the prior user, across surfaces and versions. */
export function clearAllLocalViewsForUser(
  storage: KeyValueStorage | undefined | null,
  userId: string
): void {
  const safeStorage = safeGetStorage(storage);
  if (!safeStorage || !userId) return;

  const suffix = `:${userId}:`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < safeStorage.length; i++) {
    const key = safeStorage.key(i);
    if (key && key.startsWith(`${NAMESPACE_PREFIX}:`) && key.includes(suffix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => safeStorage.removeItem(key));
}
