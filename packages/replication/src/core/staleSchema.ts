/**
 * Stale-schema signal (MYK9-1663).
 *
 * The offline database is shared by every tab and by every build still cached
 * under a service worker. A build older than the device's database cannot open
 * it (IndexedDB rejects with VersionError), and a tab holding an older build
 * is told to close its connection when a newer build upgrades. Either way the
 * running code is stale and the offline store is unusable until the app
 * reloads onto the newer build.
 *
 * The package only reports that fact; it has no UI and never retries the open
 * or deletes the database (queued offline scores are still replayable by the
 * newer build). The consuming app subscribes and decides what to show.
 */

export type StaleSchemaReason = 'version-error' | 'version-change';

export type StaleSchemaListener = (reason: StaleSchemaReason) => void;

const listeners = new Set<StaleSchemaListener>();

/** Subscribe to stale-schema signals. Returns an unsubscribe function. */
export function onStaleSchema(listener: StaleSchemaListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when an IndexedDB open failed because the requested version is lower than the stored one. */
export function isVersionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'VersionError'
  );
}

/** Thrown by the database manager once a stale schema has been latched. */
export class StaleSchemaError extends Error {
  readonly reason: StaleSchemaReason;
  constructor(reason: StaleSchemaReason) {
    super(`Offline database schema is stale (${reason}); reload onto the newer build`);
    this.name = 'StaleSchemaError';
    this.reason = reason;
  }
}

/**
 * Latched for the life of the page once a stale schema is seen. While latched
 * the manager neither re-opens, counts failures, nor runs recover(): every
 * failed read would otherwise trip the circuit breaker and delete the newer
 * build's database, with its queued offline scores.
 */
let latchedReason: StaleSchemaReason | null = null;

export function getStaleSchemaLatch(): StaleSchemaReason | null {
  return latchedReason;
}

/** Latch and emit once. Returns false (and emits nothing) when already latched. */
export function latchStaleSchema(reason: StaleSchemaReason): boolean {
  if (latchedReason !== null) return false;
  latchedReason = reason;
  emitStaleSchema(reason);
  return true;
}

/** Test-only: clear the latch (DatabaseManager.reset() calls this). */
export function resetStaleSchemaLatch(): void {
  latchedReason = null;
}

/** Notify every subscriber. A throwing listener never blocks the others or the caller. */
export function emitStaleSchema(reason: StaleSchemaReason): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener(reason);
    } catch {
      /* a broken subscriber must not break database handling */
    }
  }
}
