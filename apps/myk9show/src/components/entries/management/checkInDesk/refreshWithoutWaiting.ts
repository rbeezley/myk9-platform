/**
 * Asks the page to re-read its entries and walks away. The desk's controls free as soon as their
 * write is stored (the replicated write is the source of truth); the re-read only brings the
 * screen up to date. It must never be awaited: the entries query is `offlineFirst`, so its retry
 * can pause offline and the promise then never settles, which would hold a control forever.
 */
export function refreshWithoutWaiting(refresh: (() => void | Promise<void>) | undefined): void {
  if (!refresh) return;
  try {
    void Promise.resolve(refresh()).catch(() => {
      // The write is stored; the next read shows it.
    });
  } catch {
    // A refresh that throws synchronously is the same: nothing to undo.
  }
}
