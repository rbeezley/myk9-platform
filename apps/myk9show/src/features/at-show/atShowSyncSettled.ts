const syncSettledListeners = new Map<string, Set<() => void>>();

/**
 * Run `listener` each time a `syncAtShowData` operation for `showId` settles,
 * after every scope's rows are written, and on failure too: a partial sync
 * still changed local rows. This sync never advances the replication
 * provider's `lastSyncAt`, so the offline readiness badge needs this to notice
 * the page's own hydration (MYK9-766). Returns the unsubscribe.
 */
export function subscribeAtShowSyncSettled(showId: string, listener: () => void): () => void {
  const listeners = syncSettledListeners.get(showId) ?? new Set<() => void>();
  listeners.add(listener);
  syncSettledListeners.set(showId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && syncSettledListeners.get(showId) === listeners) {
      syncSettledListeners.delete(showId);
    }
  };
}

/** Tell every listener for `showId` that a `syncAtShowData` operation settled. */
export function notifyAtShowSyncSettled(showId: string): void {
  for (const listener of [...(syncSettledListeners.get(showId) ?? [])]) listener();
}
