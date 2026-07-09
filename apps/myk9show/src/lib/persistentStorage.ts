/**
 * Persistent-storage request for offline-first durability.
 *
 * Without `navigator.storage.persist()`, all IndexedDB (and localStorage) is
 * "best-effort" and the browser may evict it under pressure. On iOS/Safari,
 * script-writable storage is purged after 7 days of non-use for non-installed
 * web apps — which would destroy a judge's queued scores AND the localStorage
 * backup together. Requesting persistence is the standard mitigation; installing
 * to the home screen is the real fix on iOS (installed PWAs are exempt from the
 * 7-day purge).
 *
 * This is best-effort and idempotent: the browser may grant silently, prompt,
 * or deny based on engagement heuristics. Never block on the result.
 */

export type PersistentStorageStatus = 'persisted' | 'not-persisted' | 'unsupported';

let cached: Promise<PersistentStorageStatus> | null = null;

async function query(): Promise<PersistentStorageStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage) return 'unsupported';

  try {
    // Already persisted? Don't re-request.
    if (typeof navigator.storage.persisted === 'function') {
      const already = await navigator.storage.persisted();
      if (already) return 'persisted';
    }
    if (typeof navigator.storage.persist === 'function') {
      const granted = await navigator.storage.persist();
      return granted ? 'persisted' : 'not-persisted';
    }
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

/**
 * Request persistent storage once per session. Repeated calls return the same
 * in-flight/cached result, so it's safe to call at startup AND on entering the
 * scoring surface.
 */
export function requestPersistentStorage(): Promise<PersistentStorageStatus> {
  if (!cached) cached = query();
  return cached;
}

/** Test-only: reset the memoized request. */
export function __resetPersistentStorageCache(): void {
  cached = null;
}
