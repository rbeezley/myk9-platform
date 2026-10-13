import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { replicatedPaperworkPrintsTable } from '@/services/replication';
import { assertScopeNotForeign } from '@/services/replication/scopeAccountStamp';
import { subscribeToShowChanges } from '@/features/show-live-sync/showChangeSignal';

export function useShowPaperworkPrints(showId: string) {
  const queryClient = useQueryClient();
  /**
   * Whether the last SERVER sync failed.
   *
   * `useQuery` below reads IndexedDB, so it succeeds even when the server read
   * did not — and `sync()` resolves with `{ success: false, error }` rather
   * than rejecting. So `isError` alone is effectively always false, and a
   * caller asking "could I load the confirmations?" got a confident yes while
   * showing an empty list. For the print reminder that is the difference
   * between "nothing is printed" and "I could not find out" (MYK9-228).
   */
  const [syncFailed, setSyncFailed] = useState(false);
  const queryKey = ['show-desk', 'paperwork-prints', showId] as const;

  const invalidate = useCallback(
    () =>
      void queryClient.invalidateQueries({
        queryKey: ['show-desk', 'paperwork-prints', showId],
      }),
    [queryClient, showId]
  );
  const resync = useCallback(
    () =>
      void replicatedPaperworkPrintsTable
        .sync(showId)
        .then(result => {
          setSyncFailed(!result?.success);
          invalidate();
        })
        .catch(() => setSyncFailed(true)),
    [invalidate, showId]
  );

  useEffect(() => {
    const unsubscribeLocal = replicatedPaperworkPrintsTable.subscribe(invalidate);
    const unsubscribeRealtime = subscribeToShowChanges(showId, signal => {
      if (signal.table === 'paperwork_prints') resync();
    });
    resync();
    return () => {
      unsubscribeLocal();
      unsubscribeRealtime();
    };
  }, [invalidate, resync, showId]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      // Another account's synced show is an error here, never its rows or an
      // empty list (MYK9-1133); the sync above restamps the show for this one.
      await assertScopeNotForeign(replicatedPaperworkPrintsTable, showId);
      return replicatedPaperworkPrintsTable.getByShow(showId);
    },
    // IndexedDB only: never pause it for the network (MYK9-955 offline reload).
    networkMode: 'always',
  });

  // Existing callers keep reading `data`/`isError` unchanged; `syncFailed` is
  // additive.
  return { ...query, syncFailed, resync };
}
