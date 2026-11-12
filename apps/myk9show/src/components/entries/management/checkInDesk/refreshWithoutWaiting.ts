import type { EntriesRefresh, StoredEntryPatch } from './storedEntryPatch';

/**
 * Asks the page to re-read its entries and walks away. The desk's controls free as soon as their
 * write is stored (the replicated write is the source of truth); the re-read only brings the
 * screen up to date. `stored` is what the write put in the replica, so the page's list can take
 * it at once and keep it if the re-read fails. It must never be awaited: the entries query is `offlineFirst`, so its retry
 * can pause offline and the promise then never settles, which would hold a control forever.
 */
export function refreshWithoutWaiting(
  refresh: EntriesRefresh | undefined,
  stored?: readonly StoredEntryPatch[]
): void {
  if (!refresh) return;
  try {
    void Promise.resolve(refresh(stored)).catch(() => {
      // The write is stored; the next read shows it.
    });
  } catch {
    // A refresh that throws synchronously is the same: nothing to undo.
  }
}
