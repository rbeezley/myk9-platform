import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

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
  succeeded: readonly { name: string; scope: string }[]
): void {
  const showIds = new Set(
    succeeded.filter(({ name, scope }) => name === 'entries' && scope).map(({ scope }) => scope)
  );
  for (const showId of showIds) {
    const queryKey = queryKeys.showEntries(showId);
    void queryClient
      .cancelQueries({ queryKey })
      .then(() => queryClient.invalidateQueries({ queryKey }))
      .catch(() => undefined);
  }
}
