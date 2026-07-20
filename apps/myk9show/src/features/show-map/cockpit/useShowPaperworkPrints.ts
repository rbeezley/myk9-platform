import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { replicatedPaperworkPrintsTable } from '@/services/replication';

export function useShowPaperworkPrints(showId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['show-desk', 'paperwork-prints', showId] as const;

  useEffect(() => {
    const invalidate = () =>
      void queryClient.invalidateQueries({
        queryKey: ['show-desk', 'paperwork-prints', showId],
      });
    const unsubscribe = replicatedPaperworkPrintsTable.subscribe(invalidate);
    void replicatedPaperworkPrintsTable.sync(showId).then(invalidate);
    return unsubscribe;
  }, [queryClient, showId]);

  return useQuery({
    queryKey,
    queryFn: () => replicatedPaperworkPrintsTable.getByShow(showId),
  });
}
