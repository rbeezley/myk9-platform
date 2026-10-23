/**
 * Refresh policy for an open dog page's career read (MYK9-1361).
 *
 * `fetchExhibitorResults` re-reads every result the dog has ever had from
 * `view_authenticated_entry_results`, then the trials lookup. That is one of the
 * costliest reads in the system, and dozens of devices keep a dog page open
 * during a show, so the page refreshes on a slow, jittered timer plus an
 * invalidation when this device's entries replica changes for the dog.
 *
 * The read stays a full read: the view has no stable delta key (Phase 4 item 1
 * of docs/plan-show-day-db-load.md would give one).
 */
import { useEffect, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { replicatedEntriesTable, type ReplicatedEntry } from '@/services/replication';

/** Bounds of the open-dog-page refresh timer; each mount draws one value uniformly from them. */
export const OPEN_DOG_PAGE_POLL_MIN_MS = 180_000;
export const OPEN_DOG_PAGE_POLL_MAX_MS = 300_000;
/** Reuse a dog's data across navigation between its tabs. */
export const OPEN_DOG_PAGE_STALE_MS = 60_000;
/** Replica-driven refreshes of one dog page are at least this far apart. */
export const DOG_PAGE_REPLICA_REFRESH_COALESCE_MS = 15_000;

/**
 * One refresh interval per mount, drawn uniformly from the bounds so devices
 * that opened the page together do not poll in step. Only a dog page applies it.
 */
export function useOpenDogPagePollMs(): number {
  const [pollMs] = useState(
    () =>
      OPEN_DOG_PAGE_POLL_MIN_MS +
      Math.floor(Math.random() * (OPEN_DOG_PAGE_POLL_MAX_MS - OPEN_DOG_PAGE_POLL_MIN_MS + 1))
  );
  return pollMs;
}

/** What the career read shows of the dog's entries, so an unrelated replica change is not a refresh. */
function dogEntriesFingerprint(rows: readonly ReplicatedEntry[], dogIds: ReadonlySet<string>) {
  return rows
    .filter(row => row.dogId !== undefined && dogIds.has(row.dogId))
    .map(row =>
      [
        row.id,
        row.isScored,
        row.resultStatus,
        row.resultText,
        row.finalPlacement,
        row.totalFaults,
        row.searchTimeSeconds,
        row.deletedAt ?? row.deleted_at,
      ].join('|')
    )
    .sort()
    .join('\n');
}

/**
 * Invalidate `queryKey` (which must be referentially stable) when the entries replica changes for one of `dogIds`,
 * so a score that lands on this device shows up without waiting for the timer.
 *
 * The replica notifies with the table's whole snapshot, not the changed rows, so
 * the first snapshot is the baseline and later ones are compared by the dog's
 * own entries. Refreshes are spaced at least
 * `DOG_PAGE_REPLICA_REFRESH_COALESCE_MS` apart: the first change after an idle
 * period refreshes at once, and changes inside the window collapse into one
 * trailing refresh at its end.
 */
export function useExhibitorResultsReplicaRefresh(
  queryKey: QueryKey,
  dogIds: readonly string[],
  enabled: boolean
) {
  const queryClient = useQueryClient();
  const dogIdsKey = dogIds.join(',');

  useEffect(() => {
    if (!enabled || dogIdsKey === '') return;
    const ids = new Set(dogIdsKey.split(','));
    let baseline: string | undefined;
    let lastRefreshAt = Number.NEGATIVE_INFINITY;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      timer = undefined;
      lastRefreshAt = Date.now();
      void queryClient.invalidateQueries({ queryKey });
    };
    const unsubscribe = replicatedEntriesTable.subscribe((rows: readonly ReplicatedEntry[]) => {
      const next = dogEntriesFingerprint(rows, ids);
      const previous = baseline;
      baseline = next;
      if (previous === undefined || previous === next || timer !== undefined) return;
      const wait = lastRefreshAt + DOG_PAGE_REPLICA_REFRESH_COALESCE_MS - Date.now();
      if (wait <= 0) refresh();
      else timer = setTimeout(refresh, wait);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [queryClient, queryKey, dogIdsKey, enabled]);
}
