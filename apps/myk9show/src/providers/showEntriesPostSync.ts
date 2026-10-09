import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { getPostSyncInvalidationKeys } from './replicationSyncStatus';

/**
 * After a successful scoped `entries` pass, make the show's canonical entries
 * query read the downloaded rows (MYK9-1064). The table-level `['entries']`
 * invalidation does not reach `['shows', showId, 'entries']`, and a full pass
 * (no scope) never names a show.
 *
 * Cancel first: with no cached data TanStack reuses a fetch already in flight
 * (query-core 5.103.2 `query.js`: `cancelRefetch` only cancels when data
 * exists), and that fetch may have assembled its rows before the sync.
 * Owned by the provider, not a component, so it does not depend on who asked
 * for the pass or whether they are still mounted.
 */
export function refetchShowEntriesAfterScopedSync(
  queryClient: QueryClient,
  succeeded: readonly SucceededTable[]
): void {
  for (const showId of scopedEntriesShowIds(succeeded)) {
    const queryKey = queryKeys.showEntries(showId);
    void queryClient
      .cancelQueries({ queryKey })
      .then(() => queryClient.invalidateQueries({ queryKey }))
      .catch(() => undefined);
  }
}

type SucceededTable = { name: string; scope: string };

/** Shows a successful scoped `entries` pass downloaded. */
const scopedEntriesShowIds = (succeeded: readonly SucceededTable[]): Set<string> =>
  new Set(
    succeeded.filter(({ name, scope }) => name === 'entries' && scope).map(({ scope }) => scope)
  );

/**
 * Invalidate the per-table queries for the tables a pass synced.
 *
 * A show's entries read lives at `['shows', showId, 'entries', ...]`, so the
 * `['shows']` prefix reaches it. That stays: a pass cannot say what changed
 * (armbands, dogs, trials and refund metadata all feed those rows). But a show
 * the same pass refetches through `refetchShowEntriesAfterScopedSync` is left
 * out here, so each mounted show-entries query refetches once per pass, not
 * twice (MYK9-1066: one class page read it, and its per-row pull metadata,
 * three times).
 */
export function invalidatePostSyncQueries(
  queryClient: QueryClient,
  tableNames: readonly string[],
  succeeded: readonly SucceededTable[] = []
): Promise<void[]> {
  const refetchedByScopedPass = scopedEntriesShowIds(succeeded);
  return Promise.all(
    getPostSyncInvalidationKeys(tableNames).map(queryKey =>
      queryClient.invalidateQueries({
        queryKey,
        predicate: query => {
          const key = query.queryKey;
          return !(
            key[0] === 'shows' &&
            key[2] === 'entries' &&
            refetchedByScopedPass.has(String(key[1]))
          );
        },
      })
    )
  );
}
