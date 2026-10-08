import { onlineManager } from '@tanstack/react-query';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';

const REFRESH_WAIT_MS = 3000;

/** Refresh partial caches without letting a stalled connection block offline reads. */
export async function refreshShowEntriesForRead(showId: string): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(replicatedEntriesTable.sync(showId)).then(
        result => result.success === true,
        () => false
      ),
      new Promise<boolean>(resolve => {
        timeout = setTimeout(() => resolve(false), REFRESH_WAIT_MS);
      }),
    ]);
  } catch {
    // The existing cached read remains usable when sync is unavailable.
    return false;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/** Opens of one show within this window share a single refresh. */
const SHOW_OPEN_REFRESH_GAP_MS = 15_000;

const showOpenRefreshes = new Map<string, { startedAt: number; refresh: Promise<boolean> }>();

/**
 * Refresh a show's entries when someone opens it (MYK9-1064).
 *
 * The app-level sync pass runs `entries` with no show scope, which downloads
 * nothing, so a returning device's show replica only moves when a reader asks.
 * Staff surfaces that serve a warm replica (class details, Show Desk, Entry
 * Management) never asked. This is the incremental, per-scope sync, never
 * polled: opens within the gap share one refresh, an offline device keeps its
 * replica, and a hidden tab refreshes a show once per page session so a
 * background invalidation cannot turn into a poll.
 */
export function refreshShowEntriesOnOpen(showId: string): Promise<boolean> {
  if (!onlineManager.isOnline()) return Promise.resolve(false);
  const now = Date.now();
  const previous = showOpenRefreshes.get(showId);
  if (previous) {
    if (now - previous.startedAt < SHOW_OPEN_REFRESH_GAP_MS) return previous.refresh;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return Promise.resolve(false);
    }
  }
  // No read deadline here: nothing waits on this, so a slow sync that succeeds
  // must still report success (the 3 s race in refreshShowEntriesForRead is for
  // readers that must not block).
  const refresh = Promise.resolve(replicatedEntriesTable.sync(showId))
    .then(
      result => result.success === true,
      () => false
    )
    .then(ok => {
      // A failed refresh is not remembered, so the next open retries at once.
      if (!ok && showOpenRefreshes.get(showId)?.refresh === refresh)
        showOpenRefreshes.delete(showId);
      return ok;
    });
  showOpenRefreshes.set(showId, { startedAt: now, refresh });
  return refresh;
}

/** Test seam: forget which shows were refreshed. */
export function resetShowOpenRefreshesForTests(): void {
  showOpenRefreshes.clear();
}
