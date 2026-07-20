import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { replicatedPaperworkPrintsTable } from '@/services/replication';
import { subscribeToShowChanges } from '@/features/show-live-sync/showChangeSignal';

export function useShowPaperworkPrints(showId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['show-desk', 'paperwork-prints', showId] as const;

  useEffect(() => {
    const invalidate = () =>
      void queryClient.invalidateQueries({
        queryKey: ['show-desk', 'paperwork-prints', showId],
      });
    const refresh = () => void replicatedPaperworkPrintsTable.sync(showId).then(invalidate);
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

  return useQuery({
    queryKey,
    queryFn: () => replicatedPaperworkPrintsTable.getByShow(showId),
  });
}
