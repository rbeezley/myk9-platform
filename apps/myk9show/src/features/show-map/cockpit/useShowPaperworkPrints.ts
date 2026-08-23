import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { replicatedPaperworkPrintsTable } from '@/services/replication';
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

  useEffect(() => {
    const invalidate = () =>
      void queryClient.invalidateQueries({
        queryKey: ['show-desk', 'paperwork-prints', showId],
      });
    const refresh = () =>
      void replicatedPaperworkPrintsTable
        .sync(showId)
        .then(result => {
          setSyncFailed(!result?.success);
          invalidate();
        })
        .catch(() => setSyncFailed(true));
    const unsubscribeLocal = replicatedPaperworkPrintsTable.subscribe(invalidate);
    const unsubscribeRealtime = subscribeToShowChanges(showId, signal => {
      if (signal.table === 'paperwork_prints') refresh();
    });
    refresh();
    return () => {
      unsubscribeLocal();
      unsubscribeRealtime();
    };
  }, [queryClient, showId]);

  const query = useQuery({
    queryKey,
    queryFn: () => replicatedPaperworkPrintsTable.getByShow(showId),
  });

  // Existing callers keep reading `data`/`isError` unchanged; `syncFailed` is
  // additive.
  return { ...query, syncFailed };
}
