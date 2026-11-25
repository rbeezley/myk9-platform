import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryClient';
import { replicatedClassesTable, replicatedTrialsTable } from '@/services/replication';

/**
 * The show's classes that charge their own fee instead of the show's (MYK9-1931), as class id
 * to fee, read from the replicated trials and classes. A fee of zero is no fee of its own, the
 * rule `private.price_entry_fee` and `getShowEntryFee` price by. Undefined until known.
 *
 * Read by the show's fee field (how many classes differ) and the Show Desk schedule (which
 * ones), so both say the same thing from one read.
 */
export function useShowClassOwnFees(
  showId: string | undefined
): ReadonlyMap<string, number> | undefined {
  const queryClient = useQueryClient();
  const queryKey = [...queryKeys.showClasses(showId ?? ''), 'own-fees'];
  // A bulk "Set entry fee" or another secretary's change reaches the replica, not this query.
  useEffect(() => {
    if (!showId) return;
    return replicatedClassesTable.subscribe(
      // Only this read: the show's other class queries have their own refresh.
      () =>
        void queryClient.invalidateQueries({
          queryKey: [...queryKeys.showClasses(showId), 'own-fees'],
          exact: true,
        }),
      { emitCurrent: false }
    );
  }, [queryClient, showId]);

  const { data } = useQuery({
    queryKey,
    enabled: Boolean(showId),
    // Replica-only read: the default 'online' mode would park an offline device with no data.
    networkMode: 'always',
    queryFn: async (): Promise<ReadonlyMap<string, number>> => {
      const trials = await replicatedTrialsTable.getTrialsByShow(showId ?? '');
      const perTrial = await Promise.all(
        trials.map(trial => replicatedClassesTable.getClassesByTrial(trial.id))
      );
      const fees = new Map<string, number>();
      for (const cls of perTrial.flat()) {
        const fee = cls.entryFee ?? 0;
        if (!cls.deletedAt && fee > 0) fees.set(cls.id, fee);
      }
      return fees;
    },
  });
  return data;
}
